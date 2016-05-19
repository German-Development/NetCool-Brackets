define(function (require, exports, module) {
    'use strict';

    var LanguageManager			= brackets.getModule("language/LanguageManager"),
        MultiRangeInlineEditor	= brackets.getModule("editor/MultiRangeInlineEditor"),
        EditorManager			= brackets.getModule("editor/EditorManager"),
        DocumentManager			= brackets.getModule("document/DocumentManager"),
        LanguageManager			= brackets.getModule("language/LanguageManager"),
        ProjectManager			= brackets.getModule("project/ProjectManager"),        
    	QuickOpen 				= brackets.getModule("search/QuickOpen");
    	
    	
    
    var SyntaxColoring  = require("include/Syntax"),
    	RulesUtils		= require("include/RulesUtils"),
    	QuickOpenPlugin = require("include/QuickOpenPlugin");


CodeMirror.defineMIME("text/x-nco_rules", "netcool_rules");

    LanguageManager.defineLanguage("netcool_rules", {
    name: "netcool_rules",
    mode: "netcool_rules",
    fileExtensions: ["rules","lookup"],
    lineComment: ["#"]
    });
    
    console.log("About to enter registerInlineEditProvider");
    EditorManager.registerInlineEditProvider(provider);
    
});
