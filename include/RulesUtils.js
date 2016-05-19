
define(function (require, exports, module) {
    
    'use strict';
    
    var _ = brackets.getModule("thirdparty/lodash");
    
    // Load brackets modules
    var CodeMirror              = brackets.getModule("thirdparty/CodeMirror/lib/codemirror"),
        Async                   = brackets.getModule("utils/Async"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        ChangedDocumentTracker  = brackets.getModule("document/ChangedDocumentTracker"),
        FileSystem              = brackets.getModule("filesystem/FileSystem"),
        FileUtils               = brackets.getModule("file/FileUtils"),
        StringUtils             = brackets.getModule("utils/StringUtils");

    /**
     * Tracks dirty documents between invocations of findMatchingincludes.
     * @type {ChangedDocumentTracker}
     */
    var _changedDocumentTracker = new ChangedDocumentTracker();
    
    /**
     * include matching regular expression. Recognizes the forms:
     * "{include includeName ".
     *
     */
    
    
    var _includeRegExp = /{include ([^\}\/][^\s^\}\/]+)/g;
    
    /**
     * @private
     * Return an object mapping include name to offset info for all includes in the specified text.
     * @param {!string} text Document text
     * @return {Object.<string, Array.<{offsetStart: number, offsetEnd: number}>}
     */
    function  _findAllIncludesInText(text) {
        var results = {},
            namespaceName,
            includeName,
            match,
            _namespaceRegExp = /{namespace ([^\}\/][^\s]+)(?:\})/g;
        
       if ((namespaceName = _namespaceRegExp.exec(text)) !== null) {
            namespaceName = namespaceName[1].trim();
       }
       
            while ((match = _includeRegExp.exec(text)) !== null) {
                includeName = namespaceName + (match[1]).trim();
                
                
                if (!Array.isArray(results[includeName])) {
                    results[includeName] = [];
                }
                
                results[includeName].push({offsetStart: match.index});
            }
    
        return results;
    }
    
    // Given the start offset of a include definition (before the opening brace), find
    // the end offset for the include (the closing "{/include"). 
    
    function _getincludeEndOffset(text, offsetStart) {
        var mode = CodeMirror.getMode({}, "netcool-rules");
        var state = CodeMirror.startState(mode), stream, style, token;
        var curOffset = offsetStart, length = text.length, blockCount = 0, lineStart;
        var foundStartBrace = false;
        

        // Get a stream for the next line, and update curOffset and lineStart to point to the 
        // beginning of that next line. Returns false if we're at the end of the text.
                     
        function nextLine() {
            if (stream) {
                curOffset++; // account for \n
                if (curOffset >= length) {
                    return false;
                }
            }
            lineStart = curOffset;
            var lineEnd = text.indexOf("\n", lineStart);
            
            if (lineEnd === -1) {
                lineEnd = length;
            }
            stream = new CodeMirror.StringStream(text.slice(curOffset, lineEnd));
            return true;
        }
        
        // Get the next token, updating the style and token to refer to the current
        // token, and updating the curOffset to point to the end of the token (relative
        // to the start of the original text).
        function nextToken() {
            if (curOffset >= length) {
                return false;
            }
            if (stream) {
                // Set the start of the next token to the current stream position.
                stream.start = stream.pos;
            }
            while (!stream || stream.eol()) {
                if (!nextLine()) {
                    return false;
                }
            }
            style = mode.token(stream, state);
            token = stream.current();
            curOffset = lineStart + stream.pos;
            return true;
        }

        while (nextToken()) {
            if (style === "keyword" && token === "{/include"){
                 return curOffset;
            }
         }
        // Shouldn't get here, but if we do, return the end of the text as the offset.
        return length;
    }

    /**
     * @private
     * Computes include offsetEnd, lineStart and lineEnd. Appends a result record to rangeResults.
     * @param {!Document} doc
     * @param {!string} includeName
     * @param {!Array.<{offsetStart: number, offsetEnd: number}>} includes
     * @param {!Array.<{document: Document, name: string, lineStart: number, lineEnd: number}>} rangeResults
     */
    function _computeOffsets(doc, includeName, includes, rangeResults) {
        var text    = doc.getText(),
            lines   = StringUtils.getLines(text);
        
        
        includes.forEach(function (tmplEntry) {
            if (!tmplEntry.offsetEnd) {
                tmplEntry.offsetEnd = _getincludeEndOffset(text, tmplEntry.offsetStart);
                tmplEntry.lineStart = StringUtils.offsetToLineNum(lines, tmplEntry.offsetStart);
                tmplEntry.lineEnd   = StringUtils.offsetToLineNum(lines, tmplEntry.offsetEnd);
            }
            
            rangeResults.push({
                document:   doc,
                name:       includeName,
                lineStart:  tmplEntry.lineStart,
                lineEnd:    tmplEntry.lineEnd
            });
    
        });
    }
    
    /**
     * @private
     * Read a file and build a function list. Result is cached in fileInfo.
     * @param {!FileInfo} fileInfo File to parse
     * @param {!$.Deferred} result Deferred to resolve with all includes found and the document
     */
    function _readFile(fileInfo, result) {
        DocumentManager.getDocumentForPath(fileInfo.fullPath)
            .done(function (doc) {
                var allincludes =  _findAllincludesInText(doc.getText());
                
                // Cache the result in the fileInfo object
                fileInfo.RulesUtils = {};
                fileInfo.RulesUtils.functions = allincludes;
                fileInfo.RulesUtils.timestamp = doc.diskTimestamp;
                
                result.resolve({doc: doc, functions: allincludes});
            })
            .fail(function (error) {
                result.reject(error);
            });
    }
    
    /**
     * Determines if the document include cache is up to date. 
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with true with true when a include cache is available for the document. Resolves
     * with false when there is no cache or the cache is stale.
     */
    function _shouldGetFromCache(fileInfo) {
        var result = new $.Deferred(),
            isChanged = _changedDocumentTracker.isPathChanged(fileInfo.fullPath);
        
        if (isChanged && fileInfo.RulesUtils) {
            // See if it's dirty and in the working set first
            var doc = DocumentManager.getOpenDocumentForPath(fileInfo.fullPath);
            
            if (doc && doc.isDirty) {
                result.resolve(false);
            } else {
                // If a cache exists, check the timestamp on disk
                var file = FileSystem.getFileForPath(fileInfo.fullPath);
                
                file.stat(function (err, stat) {
                    if (!err) {
                        result.resolve(fileInfo.RulesUtils.timestamp.getTime() === stat.mtime.getTime());
                    } else {
                        result.reject(err);
                    }
                });
            }
        } else {
            // Use the cache if the file did not change and the cache exists
            result.resolve(!isChanged && fileInfo.RulesUtils);
        }

        return result.promise();
    }
    
    /**
     * @private
     * Compute lineStart and lineEnd for each matched include
     * @param {!Array.<{doc: Document, fileInfo: FileInfo, functions: Array.<offsetStart: number, offsetEnd: number>}>} docEntries
     * @param {!string} includeName
     * @param {!Array.<document: Document, name: string, lineStart: number, lineEnd: number>} rangeResults
     * @return {$.Promise} A promise resolved with an array of document ranges to populate a MultiRangeInlineEditor.
     */
    function _getOffsetsForinclude(docEntries, includeName) {
        // Filter for documents that contain the named function
        var result              = new $.Deferred(),
            matchedDocuments    = [],
            rangeResults        = [];
        
        docEntries.forEach(function (docEntry) {
            // Need to call _.has here since docEntry.functions could have an
            // entry for "hasOwnProperty", which results in an error if trying
            // to invoke docEntry.functions.hasOwnProperty().
            if (_.has(docEntry.functions, includeName)) {
                var includesInDocument = docEntry.functions[includeName];
                matchedDocuments.push({doc: docEntry.doc, fileInfo: docEntry.fileInfo, functions: includesInDocument});
            }
        });
        
        Async.doInParallel(matchedDocuments, function (docEntry) {
            var doc         = docEntry.doc,
                oneResult   = new $.Deferred();
            // doc will be undefined if we hit the cache
            if (!doc) {
                DocumentManager.getDocumentForPath(docEntry.fileInfo.fullPath)
                    .done(function (fetchedDoc) {
                        _computeOffsets(fetchedDoc, includeName, docEntry.functions, rangeResults);
                    })
                    .always(function () {
                        oneResult.resolve();
                    });
            } else {
                _computeOffsets(doc, includeName, docEntry.functions, rangeResults);
                oneResult.resolve();
            }
            
            return oneResult.promise();
        }).done(function () {
            result.resolve(rangeResults);
        });
        
        return result.promise();
    }
    
    /**
     * Resolves with a record containing the Document or FileInfo and an Array of all
     * include names with offsets for the specified file. Results may be cached.
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with a document info object that
     *   contains a map of all include names from the document and each includes's start offset. 
     */
    function _getincludesForFile(fileInfo) {
        var result = new $.Deferred();
            
        _shouldGetFromCache(fileInfo)
            .done(function (useCache) {
                if (useCache) {
                    // Return cached data. doc property is undefined since we hit the cache.
                    // _getOffsets() will fetch the Document if necessary.
                    result.resolve({/*doc: undefined,*/fileInfo: fileInfo, functions: fileInfo.RulesUtils.functions});
                } else {
                    _readFile(fileInfo, result);
                }
            }).fail(function (err) {
                result.reject(err);
            });
        
        return result.promise();
    }
    
    /**
     * @private
     * Get all includess for each FileInfo.
     * @param {Array.<FileInfo>} fileInfos
     * @return {$.Promise} A promise resolved with an array of document info objects that each
     *   contain a map of all include names from the document and each include's start offset.
     */
    function _getincludesInFiles(fileInfos) {
        var result      = new $.Deferred(),
            docEntries  = [];
        
        Async.doInParallel(fileInfos, function (fileInfo) {
            var oneResult = new $.Deferred();
            
            _getincludesForFile(fileInfo)
                .done(function (docInfo) {
                    docEntries.push(docInfo);
                })
                .always(function (error) {
                    // If one file fails, continue to search
                    oneResult.resolve();
                });
            
            return oneResult.promise();
        }).always(function () {
            // Reset ChangedDocumentTracker now that the cache is up to date.
            _changedDocumentTracker.reset();
            
            result.resolve(docEntries);
        });
        
        return result.promise();
    }
    
    /**
     * Return all includes that have the specified name, searching across all the given files.
     *
     * @param {!String} includeName The name to match.
     * @param {!Array.<File>} fileInfos The array of files to search.
     * @return {$.Promise} that will be resolved with an Array of objects containing the
     *      source document, start line, and end line (0-based, inclusive range) for each matching include list.
     */
    function findMatchingIncludes(includeName, fileInfos, keepAllFiles) {
        var result  = new $.Deferred(),
            RulesFiles = [];
        
        if (!keepAllFiles) {
            // Filter fileInfos for .js files
            RulesFiles = fileInfos.filter(function (fileInfo) {
                return (FileUtils.getFileExtension(fileInfo.fullPath).toLowerCase() === "rules" ||
                		FileUtils.getFileExtension(fileInfo.fullPath).toLowerCase() === "lookup");
            });
        } else {
            RulesFiles = fileInfos;
        }
        // RegExp search (or cache lookup) for all includes in the project
        _getincludesInFiles(RulesFiles).done(function (docEntries) {
            // Compute offsets for all matched includes
            _getOffsetsForinclude(docEntries, includeName).done(function (rangeResults) {
                result.resolve(rangeResults);
            });
        });
        
        return result.promise();
    }

    /**
     * Finds all instances of the specified searchName in "text".
     * Returns an Array of Objects with start and end properties.
     *
     * @param text {!String} Rules text to search
     * @param searchName {!String} include name to search for
     * @return {Array.<{offset:number, includeName:string}>}
     *      Array of objects containing the start offset for each matched includes name.
     */
    function findAllMatchingincludesInText(text, searchName) {
        var allincludes =  _findAllincludesInText(text);
        var result = [];
        var lines = text.split("\n");
        
        _.forEach(allincludes, function (includes, includeName) {
            if (includeName === searchName || searchName === "*") {
                includes.forEach(function (tmplEntry) {
                    var endOffset = _getincludeEndOffset(text, tmplEntry.offsetStart);
                    result.push({
                        name: includeName,
                        lineStart: StringUtils.offsetToLineNum(lines, tmplEntry.offsetStart),
                        lineEnd: StringUtils.offsetToLineNum(lines, endOffset)
                    });
                });
            }
        });
         
        return result;
    }
    
    exports.findAllMatchingincludesInText = findAllMatchingincludesInText;
    exports.findMatchingIncludes = findMatchingIncludes;
});
