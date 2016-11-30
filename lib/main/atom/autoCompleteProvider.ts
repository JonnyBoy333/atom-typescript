/// <reference path='../../globals'/>

// more: https://github.com/atom-community/autocomplete-plus/wiki/Provider-API

///ts:import=parent
import parent = require('../../worker/parent'); ///ts:import:generated
///ts:import=atomConfig
import atomConfig = require('./atomConfig'); ///ts:import:generated
import fs = require('fs');
///ts:import=atomUtils
import atomUtils = require('./atomUtils'); ///ts:import:generated
import escape = require('escape-html');

var fuzzaldrin = require('fuzzaldrin');
var CSON = require("season");

declare module autocompleteplus {
    /** What gets passed into the handler */
    export interface RequestOptions {
        editor: AtomCore.IEditor;
        bufferPosition: TextBuffer.IPoint; // the position of the cursor
        prefix: string;
        scopeDescriptor: { scopes: string[] };
    }

    /** The suggestion */
    export interface Suggestion {
        //Either text or snippet is required

        text?: string;
        snippet?: string;

        replacementPrefix?: string;

        rightLabel?: string;
        rightLabelHTML?: string;
        leftLabel?: string;
        type: string;
        description?: string;
    }

    /** What the provider needs to implement */
    export interface Provider {
        inclusionPriority?: number;
        excludeLowerPriority?: boolean;
        suggestionPriority?: number;
        selector: string;
        disableForSelector?: string;
        getSuggestions: (options: RequestOptions) => Promise<Suggestion[]>;
        onDidInsertSuggestion?: (args: { editor: AtomCore.IEditor; triggerPosition: TextBuffer.IPoint; suggestion: Suggestion }) => any;
    }
}

var explicitlyTriggered = false;
export function triggerAutocompletePlus() {
    atom.commands.dispatch(
        atom.views.getView(atom.workspace.getActiveTextEditor()),
        'autocomplete-plus:activate');
    explicitlyTriggered = true;
}

// the structure stored in the CSON snippet file
interface SnippetDescriptor {
    prefix: string;
    body: string;
}
interface SnippetsContianer {
    [name: string]: SnippetDescriptor;
}

function getModuleAutocompleteType(scopes: string[]): {
  isReference: boolean,
  isRequire: boolean, // this only matches: import hello = require("^cursor") and not require("^")
  isImport: boolean // ES6 import: import hello from "^cursor"
} {
  function has(match: string): boolean {
    return scopes.some(scope => scope.indexOf(match) !== -1)
  }

  let isString = has('string.quoted')

  return {
    isReference: has('reference.path.string.quoted') || has('amd.path.string.quoted'),
    isRequire: has('meta.import-equals.external') && isString,
    isImport: has('meta.import') && isString
  }
}

export var provider: autocompleteplus.Provider = {
    selector: '.source.ts, .source.tsx',
    inclusionPriority: 3,
    suggestionPriority: 3,
    excludeLowerPriority: false,
    getSuggestions: async function (options: autocompleteplus.RequestOptions): Promise<autocompleteplus.Suggestion[]> {

        const filePath = options.editor.getPath()

        // We refuse to work on files that are not on disk.
        if (!filePath || !fs.existsSync(filePath))
          return [];

        const client = await parent.clients.get(filePath)

        // var {isReference, isRequire, isImport} = getModuleAutocompleteType(options.scopeDescriptor.scopes)
        //
        // // For file path completions
        // if (isReference || isRequire || isImport) {
        //     return parent.getRelativePathsInProject({ filePath, prefix: options.prefix, includeExternalModules: isReference })
        //         .then((resp) => {
        //
        //         var range = options.editor.bufferRangeForScopeAtCursor(".string.quoted")
        //         var cursor = options.editor.getCursorBufferPosition()
        //
        //         // Check if we're in a string and if the cursor is at the end of it. Bail otherwise
        //         if (!range || cursor.column !== range.end.column-1) {
        //           return []
        //         }
        //
        //         var content = options.editor.getTextInBufferRange(range).replace(/^['"]|['"]$/g, "")
        //
        //         return resp.files.map(file => {
        //             var relativePath = file.relativePath;
        //
        //             /** Optionally customize this in future */
        //             var suggestionText = relativePath;
        //
        //             var suggestion: autocompleteplus.Suggestion = {
        //                 text: suggestionText,
        //                 replacementPrefix: content,
        //                 rightLabelHTML: '<span>' + file.name + '</span>',
        //                 type: 'import'
        //             };
        //
        //             return suggestion;
        //         });
        //     });
        // }
        // else {

            // if explicitly triggered reset the explicit nature
        if (explicitlyTriggered) {
            explicitlyTriggered = false;
        }
        else { // else in special cases for automatic triggering refuse to provide completions
            const prefix = options.prefix.trim()

            if (prefix === '' || prefix === ';' || prefix === '{') {
                return Promise.resolve([]);
            }
        }

        return client.executeCompletions({
            file: filePath,
            prefix: options.prefix,
            line: options.bufferPosition.row+1,
            offset: options.bufferPosition.column+1
        }).then(resp => {
            console.log("prefix", options.prefix)
            return resp.body.map(c => {

                // if (c.snippet) // currently only function completions are snippet
                // {
                //     return {
                //         snippet: c.snippet,
                //         replacementPrefix: '',
                //         rightLabel: 'signature',
                //         type: 'snippet',
                //     };
                // }
                // else {
                    var prefix = options.prefix;

                    // If the completion is $foo
                    // The prefix from acp is actually only `foo`
                    // But the var is $foo
                    // => so we would potentially end up replacing $foo with $$foo
                    // Fix that:
                    if (c.name && c.name.startsWith('$')) {
                        prefix = "$" + prefix;
                    }

                    return {
                        text: c.name,
                        replacementPrefix: prefix === "." ? "" : prefix.trim(),
                        rightLabel: c.name,
                        leftLabel: c.kind,
                        type: atomUtils.kindToType(c.kind),
                        description: null,
                    };
                // }
              });
          });
    },
}
