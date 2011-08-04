﻿/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

const NUM_CONCURRENT_TESTS = 6;
const TRANSLATOR_TYPES = ["Web", "Import", "Export", "Search"];
const TABLE_COLUMNS = ["Translator", "Supported", "Status", "Pending", "Succeeded", "Failed", "Unknown"];
var translatorTables = {},
	translatorTestViews = {},
	translatorTestViewsToRun = {},
	translatorBox,
	outputBox,
	allOutputView,
	currentOutputView,
	viewerMode = true;

/**
 * Handles adding debug output to the output box
 * @param {HTMLElement} el An element to add class="selected" to when this outputView is displayed
 */
var OutputView = function(el) {
	this._output = [];
	this._el = el;
}

/**
 * Sets whether this output is currently displayed in the output box
 * @param {Boolean} isDisplayed
 */
OutputView.prototype.setDisplayed = function(isDisplayed) {
	this.isDisplayed = isDisplayed;
	if(this.isDisplayed) outputBox.textContent = this._output.join("\n");
	if(this._el) this._el.className = (isDisplayed ? "output-displayed" : "output-hidden");
	currentOutputView = this;
}

/**
 * Adds output to the output view
 */
OutputView.prototype.addOutput = function(msg, level) {
	this._output.push(msg);
	if(this.isDisplayed) outputBox.textContent = this._output.join("\n");
}

/**
 * Gets output to the output view
 */
OutputView.prototype.getOutput = function() {
	return this._output.join("\n");
}

/**
 * Encapsulates a set of tests for a specific translator and type
 * @constructor
 */
var TranslatorTestView = function(translator, type) {
	var row = this._row = document.createElement("tr");
	
	// Translator
	this._label = document.createElement("td");
	row.appendChild(this._label);
	
	// Supported
	this._supported = document.createElement("td");
	row.appendChild(this._supported);
	
	// Status
	this._status = document.createElement("td");
	row.appendChild(this._status);
	
	// Unknown
	this._pending = document.createElement("td");
	row.appendChild(this._pending);
	
	// Succeeded
	this._succeeded = document.createElement("td");
	row.appendChild(this._succeeded);
	
	// Failed
	this._failed = document.createElement("td");
	row.appendChild(this._failed);
	
	// Unknown
	this._unknown = document.createElement("td");
	row.appendChild(this._unknown);
	
	// create output view and debug function
	var outputView = this._outputView = new OutputView(row);
	this._debug = function(obj, msg, level) {
		outputView.addOutput(msg, level);
		allOutputView.addOutput(msg, level);
	}
	
	// put click handler on row to allow display of debug output
	row.addEventListener("click", function(e) {
		// don't run deselect click event handler
		e.stopPropagation();
		
		currentOutputView.setDisplayed(false);
		outputView.setDisplayed(true);
	}, false);
	
	// create translator tester and update status based on what it knows
	this.isRunning = false;
}

/**
 * Initializes TranslatorTestView given a translator and its type
 */
TranslatorTestView.prototype.initWithTranslatorAndType = function(translator, type) {
	this._label.appendChild(document.createTextNode(translator.label));
	
	this.isSupported = translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER;
	this._supported.appendChild(document.createTextNode(this.isSupported ? "Yes" : "No"));
	this._supported.className = this.isSupported ? "supported-yes" : "supported-no";
	
	this._translatorTester = new Zotero_TranslatorTester(translator, type, this._debug);
	this.canRun = !!this._translatorTester.tests.length;
	this.updateStatus(this._translatorTester);
	
	this._type = type;
	translatorTables[this._type].appendChild(this._row);
}

/**
 * Initializes TranslatorTestView given a JSON-ified translatorTester
 */
TranslatorTestView.prototype.unserialize = function(serializedData) {
	this._outputView.addOutput(serializedData.output);
	this._label.appendChild(document.createTextNode(serializedData.label));
	
	this.isSupported = serializedData.isSupported;
	this._supported.appendChild(document.createTextNode(this.isSupported ? "Yes" : "No"));
	this._supported.className = this.isSupported ? "supported-yes" : "supported-no";
	
	this.canRun = false;
	this.updateStatus(serializedData);
	
	this._type = serializedData.type;
	translatorTables[this._type].appendChild(this._row);
}

/**
 * Initializes TranslatorTestView given a JSON-ified translatorTester
 */
TranslatorTestView.prototype.serialize = function(serializedData) {
	return {
		"type":this._type,
		"output":this._outputView.getOutput(),
		"label":this._label.textContent,
		"isSupported":this.isSupported,
		"pending":parseInt(this._pending.textContent),
		"failed":parseInt(this._failed.textContent),
		"succeeded":parseInt(this._succeeded.textContent),
		"unknown":parseInt(this._unknown.textContent)
	};
}

/**
 * Changes the displayed status of a translator
 */
TranslatorTestView.prototype.updateStatus = function(obj, status) {
	while(this._status.hasChildNodes()) {
		this._status.removeChild(this._status.firstChild);
	}
	
	var pending = typeof obj.pending === "object" ? obj.pending.length : obj.pending;
	var succeeded = typeof obj.succeeded === "object" ? obj.succeeded.length : obj.succeeded;
	var failed = typeof obj.failed === "object" ? obj.failed.length : obj.failed;
	var unknown = typeof obj.unknown === "object" ? obj.unknown.length : obj.unknown;
	
	if(pending || succeeded || failed || unknown) {
		if(pending) {
			if(this.isRunning) {
				this._status.className = "status-running";
				this._status.textContent = "Running";
			} else if(status && status === "pending") {
				this._status.className = "status-pending";
				this._status.textContent = "Pending";
			} else if(this.canRun) {
				// show link to start
				var me = this;
				var a = document.createElement("a");
				a.href = "#";
				a.addEventListener("click", function(e) {
					e.preventDefault();
					me.runTests();
				}, false);
				a.textContent = "Run";
				this._status.appendChild(a);
			} else {
				this._status.textContent = "Not Run";
			}
		} else if(failed) {
			this._status.className = "status-failed";
			this._status.textContent = "Failed";
		} else if(unknown) {
			this._status.className = "status-unknown";
			this._status.textContent = "Unknown";
		} else {
			this._status.className = "status-succeeded";
			this._status.textContent = "Succeeded";
		}
	} else {
		this._status.className = "status-untested";
		this._status.textContent = "Untested";
	}
	
	this._pending.textContent = pending;
	this._succeeded.textContent = succeeded;
	this._failed.textContent = failed;
	this._unknown.textContent = unknown;
}

/**
 * Runs test for this translator
 */
TranslatorTestView.prototype.runTests = function(doneCallback) {
	if(this.isRunning) return;
	this.isRunning = true;
	
	// show as running
	this.updateStatus(this._translatorTester);
	
	// set up callback
	var me = this;
	var newCallback = function(obj, test, status, message) {
		me.updateStatus(obj);
		if(obj.pending.length === 0 && doneCallback) {
			doneCallback();
		}
	};
	
	this._translatorTester.runTests(newCallback);
}

/**
 * Called when loaded
 */
function load(event) {
	try {
		viewerMode = !Zotero;
	} catch(e) {};
	
	if(window.chrome || window.safari) {
		// initialize injection
		Zotero.initInject();
		// make sure that connector is online
		Zotero.Connector.checkIsOnline(function(status) {
			if(status) {
				init();
			} else {
				document.body.textContent = "To avoid excessive repo requests, the translator tester may only be used when Zotero Standalone is running.";
			}
		});
	} else {
		init();
	}
}

/**
 * Builds translator display and retrieves translators
 */
function init() {
	// create translator box
	translatorBox = document.createElement("div");
	translatorBox.id = "translator-box";
	document.body.appendChild(translatorBox);
	
	// create output box
	outputBox = document.createElement("div");
	outputBox.id = "output-box";
	document.body.appendChild(outputBox);
	
	// set click handler for translator box to display all output, so that when the user clicks
	// outside of a translator, it will revert to this state
	translatorBox.addEventListener("click", function(e) {
		currentOutputView.setDisplayed(false);
		allOutputView.setDisplayed(true);
	}, false);
	
	// create output view for all output and display
	allOutputView = new OutputView();
	allOutputView.setDisplayed(true);

	for(var i in TRANSLATOR_TYPES) {
		var displayType = TRANSLATOR_TYPES[i];
		var translatorType = displayType.toLowerCase();
		
		// create header
		var h1 = document.createElement("h1");
		h1.appendChild(document.createTextNode(displayType+" Translators "));
		
		if(!viewerMode) {
			// create "run all"
			var runAll = document.createElement("a");
			runAll.href = "#";
			runAll.appendChild(document.createTextNode("(Run)"));
			runAll.addEventListener("click", new function() {
				var type = translatorType;
				return function(e) {
					e.preventDefault();
					for(var i in translatorTestViewsToRun[type]) {
						var testView = translatorTestViewsToRun[type][i];
						testView.updateStatus(testView._translatorTester, "pending");
					}
					for(var i=0; i<NUM_CONCURRENT_TESTS; i++) {
						runTranslatorTests(type);
					}
				}
			}, false);
			h1.appendChild(runAll);
		}
		
		translatorBox.appendChild(h1);
		
		// create table
		var translatorTable = document.createElement("table");
		translatorTables[translatorType] = translatorTable;
		
		// add headings to table
		var headings = document.createElement("tr");
		for(var j in TABLE_COLUMNS) {
			var th = document.createElement("th");
			th.className = "th-"+TABLE_COLUMNS[j].toLowerCase();
			th.appendChild(document.createTextNode(TABLE_COLUMNS[j]));
			headings.appendChild(th);
		}
		
		// append to document
		translatorTable.appendChild(headings);
		translatorBox.appendChild(translatorTable);
		
		// get translators, with code for unsupported translators
		if(!viewerMode) {
			Zotero.Translators.getAllForType(translatorType, new function() {
				var type = translatorType;
				return function(translators) {
					haveTranslators(translators, type);
				}
			}, true);
		}
	}
	
	if(viewerMode) {
		// if no Zotero object, try to unserialize data
		var req = new XMLHttpRequest();
		req.open("GET", "testResults.json", true);
		req.overrideMimeType("text/plain");
		req.onreadystatechange = function(e) {
			if(req.readyState != 4) return;

			if(req.responseText) {	// success; unserialize
				var data = JSON.parse(req.responseText);
				for(var i=0, n=data.length; i<n; i++) {
					var translatorTestView = new TranslatorTestView();
					translatorTestView.unserialize(data[i]);
				}
			} else {
				jsonNotFound("XMLHttpRequest returned "+req.status);
			}
		};
		
		try {
			req.send();
		} catch(e) {
			jsonNotFound(e.toString());
		}
	} else {
		// create "serialize" link at bottom
		var lastP = document.createElement("p");
		var serialize = document.createElement("a");
		serialize.href = "#";
		serialize.appendChild(document.createTextNode("Serialize Results"));
		serialize.addEventListener("click", serializeAll, false);
		lastP.appendChild(serialize);
		translatorBox.appendChild(lastP);
	}
}


/**
 * Indicates no JSON file could be found.
 */
function jsonNotFound(str) {
	var body = document.body;
	while(body.hasChildNodes()) body.removeChild(body.firstChild);
	body.textContent = "testResults.json could not be loaded ("+str+").";
}

/**
 * Called after translators are returned from main script
 */
function haveTranslators(translators, type) {
	translatorTestViews[type] = [];
	translatorTestViewsToRun[type] = [];
	
	for(var i in translators) {
		var translatorTestView = new TranslatorTestView();
		translatorTestView.initWithTranslatorAndType(translators[i], type);
		translatorTestViews[type].push(translatorTestView);
		if(translatorTestView.canRun) {
			translatorTestViewsToRun[type].push(translatorTestView);
		}
	}
}

/**
 * Runs translator tests recursively, after translatorTestViews has been populated
 */
function runTranslatorTests(type, callback, runCallbackIfComplete) {
	if(translatorTestViewsToRun[type].length) {
		if(translatorTestViewsToRun[type].length === 1) runCallbackIfComplete = true;
		var translatorTestView = translatorTestViewsToRun[type].shift();
		translatorTestView.runTests(function() { runTranslatorTests(type, callback, runCallbackIfComplete) });
	} else if(callback && runCallbackIfComplete) {
		callback();
	}
}

/**
 * Serializes all run translator tests
 */
function serializeAll(e) {
	var serializedData = [];
	for(var i in translatorTestViews) {
		var n = translatorTestViews[i].length;
		for(var j=0; j<n; j++) {
			serializedData.push(translatorTestViews[i][j].serialize());
		}
	}
	
	document.location.href = "data:application/octet-stream,"+encodeURIComponent(JSON.stringify(serializedData, null, "\t"));
	e.preventDefault();
}

window.addEventListener("load", load, false);