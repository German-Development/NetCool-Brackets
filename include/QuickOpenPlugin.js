function _getIncludeName(hostEditor, pos){
	var fn_begin = 0,
		includeName = "",
		tokenArray;
	var i=0;
	
	
	var DocumentManager	= brackets.getModule("document/DocumentManager");
	var String			= brackets.getModule("strings");
	
	
	console.log("Inside getIncludeName");
	console.log("hostEditor full path=[" + hostEditor.document.file.fullPath + "]");
	
	DocumentManager.getDocumentForPath(hostEditor.document.file.fullPath)
	.done(function (doc) {
		var text = doc.getText();
	})
	.fail (function (error){
	});
	
	tokenArray = hostEditor._codeMirror.getLineTokens(pos.line, true);
	
	console.log("This is the line number=" + pos.line);
	console.log("This is the tokenArray for the line=[" + tokenArray.toString() + "]");
	
	while (i<tokenArray.length && fn_begin === 0){
		console.log("tokenArray[" + i + "]=" + tokenArray[i].string + "(" + tokenArray[i].type + ")");
		if (fn_begin === 0 && tokenArray[i].string === "include" && tokenArray[i+2].type === "string"){
			console.log("Found the include pieces");
			includeName=tokenArray[i+2].string;
			fn_begin = i + 2; // check the number 2 thing
		}else{ i++;}
	}
	
	console.log("This is the includeName=[" + includeName + "]");
    return{
    	includeName: includeName,
    	reason: null
    };
}

/** Find the include file in the opened project
*   for creating the inline editor.
*/

function _findInProject(includeName){
	var result = new $.Deferred();
	
	var LanguageManager = brackets.getModule("language/LanguageManager"),
	    ProjectManager	= brackets.getModule("project/ProjectManager");
	
	var RulesUtils		= require(["C:\\Users\\\German\\workspace\\Netcool-Brackets\\Netcool-Rules-Brackets\\include\\RulesUtils.js"]);
	
	
	function _nonBinaryFileFilter(file){
		return !LanguageManager.getLanguageForPath(file.fullPath).isBinary();
	}
	
	ProjectManager.getAllFiles(_nonBinaryFileFilter)
	.done(function (files){
		RulesUtils.findMatchingIncludes(includeName, files)
		.done(function (includeNames){
			result.resolve(includeNames);
		})
		.fail (function () {
			result.reject();
		});
	})
	.fail(function (){
		result.reject();
	});
	
	return result.promise();
}

/** Create the Inline editor 
*
*/

function _createInlineEditor(hostEditor, includeName) {
	var result = new $.Deferred();
	
	var MultiRangeInlineEditor = brackets.getModule("editor/MultiRangeInlineEditor");
	
	console.log ("Entered createInlineEditor->[" + includeName + "]");
	
	/*_findInProject(includeName)
	.done (function (includeNames) {
		if (includeNames && includeNames.length > 0) {
			
			console.log("About to create the MultiRangeInlineEditor");
			var rulesInlineEditor = new MultiRangeInlineEditor(includeNames);
			rulesInlineEditor.load(hostEditor);
			result.resolve(rulesInlineEditor);
		} else {
			// no matching include was found
			result.reject();
		}
	})
	.fail (function() {
		result.reject();
	});
*/
	function a(includeName){
		console.log("About to create the MultiRangeInlineEditor");
		var rulesInlineEditor = new MultiRangeInlineEditor(includeName);
		rulesInlineEditor.load(hostEditor);
		result.resolve(rulesInlineEditor);
	
		return result.promise();
	}
	a(includeName);
}

function provider(hostEditor, pos){
	// Only provides an editor when the cursor is in a Rules file content
	
	console.log("Entered provider");
	if (hostEditor.getModeForSelection() !== "netcool_rules") {
		return null;
	}
	
	var sel = hostEditor.getSelection();
	if (sel.start.line !== sel.end.line){
		return null;
	}
	
	console.log("this is the selected line[" + sel.start.line + "," + sel.end.line + "]");
	console.log("about to call getIncludeName");
	var functionResult = _getIncludeName(hostEditor, sel.start);
	
	console.log("I've got IncludeName=[" + functionResult.includeName + "]");
	
	if (!functionResult.includeName){
		return functionResult.reason || null;
	}
	
	console.log("About to enter createInlineEditor");
	return _createInlineEditor(hostEditor, functionResult.includeName);
}