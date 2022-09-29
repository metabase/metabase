/*global ace*/
/* eslint "no-redeclare": 0 */
/* eslint "import/no-commonjs": 0 */

// Modified from https://github.com/ajaxorg/ace/blob/b8804b1e9db1f7f02337ca884f4780f3579cc41b/lib/ace/mode/behaviour/cstyle.js

/****** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

ace.require(
  ["ace/lib/oop", "ace/mode/behaviour", "ace/token_iterator", "ace/lib/lang"],
  function (oop, { Behaviour }, { TokenIterator }, lang) {
    const SAFE_INSERT_IN_TOKENS = [
      "text",
      "paren.rparen",
      "punctuation.operator",
    ];
    const SAFE_INSERT_BEFORE_TOKENS = [
      "text",
      "paren.rparen",
      "punctuation.operator",
      "comment",
    ];

    let context;
    let contextCache = {};
    const initContext = function (editor) {
      let id = -1;
      if (editor.multiSelect) {
        id = editor.selection.index;
        if (contextCache.rangeCount !== editor.multiSelect.rangeCount) {
          contextCache = { rangeCount: editor.multiSelect.rangeCount };
        }
      }
      if (contextCache[id]) {
        return (context = contextCache[id]);
      }
      context = contextCache[id] = {
        autoInsertedBrackets: 0,
        autoInsertedRow: -1,
        autoInsertedLineEnd: "",
        maybeInsertedBrackets: 0,
        maybeInsertedRow: -1,
        maybeInsertedLineStart: "",
        maybeInsertedLineEnd: "",
      };
    };

    const getWrapped = function (selection, selected, opening, closing) {
      const rowDiff = selection.end.row - selection.start.row;
      return {
        text: opening + selected + closing,
        selection: [
          0,
          selection.start.column + 1,
          rowDiff,
          selection.end.column + (rowDiff ? 0 : 1),
        ],
      };
    };

    const SQLBehaviour = function () {
      function createInsertDeletePair(name, opening, closing) {
        this.add(
          name,
          "insertion",
          function (state, action, editor, session, text) {
            if (text === opening) {
              initContext(editor);
              const selection = editor.getSelectionRange();
              const selected = session.doc.getTextRange(selection);
              if (selected !== "" && editor.getWrapBehavioursEnabled()) {
                return getWrapped(selection, selected, opening, closing);
              } else if (SQLBehaviour.isSaneInsertion(editor, session)) {
                SQLBehaviour.recordAutoInsert(editor, session, closing);
                return {
                  text: opening + closing,
                  selection: [1, 1],
                };
              }
            } else if (text === closing) {
              initContext(editor);
              const cursor = editor.getCursorPosition();
              const line = session.doc.getLine(cursor.row);
              const rightChar = line.substring(
                cursor.column,
                cursor.column + 1,
              );
              if (rightChar === closing) {
                const matching = session.$findOpeningBracket(closing, {
                  column: cursor.column + 1,
                  row: cursor.row,
                });
                if (
                  matching !== null &&
                  SQLBehaviour.isAutoInsertedClosing(cursor, line, text)
                ) {
                  SQLBehaviour.popAutoInsertedClosing();
                  return {
                    text: "",
                    selection: [1, 1],
                  };
                }
              }
            }
          },
        );

        this.add(
          name,
          "deletion",
          function (state, action, editor, session, range) {
            const selected = session.doc.getTextRange(range);
            if (!range.isMultiLine() && selected === opening) {
              initContext(editor);
              const line = session.doc.getLine(range.start.row);
              const rightChar = line.substring(
                range.start.column + 1,
                range.start.column + 2,
              );
              if (rightChar === closing) {
                range.end.column++;
                return range;
              }
            }
          },
        );
      }

      createInsertDeletePair.call(this, "braces", "{", "}");
      createInsertDeletePair.call(this, "parens", "(", ")");
      createInsertDeletePair.call(this, "brackets", "[", "]");

      this.add(
        "string_dquotes",
        "insertion",
        function (state, action, editor, session, text) {
          if (text === '"' || text === "'") {
            if (
              this.lineCommentStart &&
              this.lineCommentStart.indexOf(text) !== -1
            ) {
              return;
            }
            initContext(editor);
            const quote = text;
            const selection = editor.getSelectionRange();
            const selected = session.doc.getTextRange(selection);
            if (
              selected !== "" &&
              selected !== "'" &&
              selected !== '"' &&
              editor.getWrapBehavioursEnabled()
            ) {
              return getWrapped(selection, selected, quote, quote);
            } else if (!selected) {
              const cursor = editor.getCursorPosition();
              const line = session.doc.getLine(cursor.row);
              const leftChar = line.substring(cursor.column - 1, cursor.column);
              const rightChar = line.substring(
                cursor.column,
                cursor.column + 1,
              );

              const token = session.getTokenAt(cursor.row, cursor.column);
              const rightToken = session.getTokenAt(
                cursor.row,
                cursor.column + 1,
              );
              // We're escaped.
              if (leftChar === "\\" && token && /escape/.test(token.type)) {
                return null;
              }

              const stringBefore = token && /string|escape/.test(token.type);
              const stringAfter =
                !rightToken || /string|escape/.test(rightToken.type);

              let pair;
              if (rightChar === quote) {
                pair = stringBefore !== stringAfter;
                if (pair && /string\.end/.test(rightToken.type)) {
                  pair = false;
                }
              } else {
                if (stringBefore && !stringAfter) {
                  return null;
                } // wrap string with different quote
                if (stringBefore && stringAfter) {
                  return null;
                } // do not pair quotes inside strings
                const wordRe = session.$mode.tokenRe;
                wordRe.lastIndex = 0;
                const isWordBefore = wordRe.test(leftChar);
                wordRe.lastIndex = 0;
                const isWordAfter = wordRe.test(leftChar);
                if (isWordBefore || isWordAfter) {
                  return null;
                } // before or after alphanumeric
                if (rightChar && !/[\s;,.})\]\\]/.test(rightChar)) {
                  return null;
                } // there is rightChar and it isn't closing
                pair = true;
              }
              return {
                text: pair ? quote + quote : "",
                selection: [1, 1],
              };
            }
          }
        },
      );

      this.add(
        "string_dquotes",
        "deletion",
        function (state, action, editor, session, range) {
          const selected = session.doc.getTextRange(range);
          if (!range.isMultiLine() && (selected === '"' || selected === "'")) {
            initContext(editor);
            const line = session.doc.getLine(range.start.row);
            const rightChar = line.substring(
              range.start.column + 1,
              range.start.column + 2,
            );
            if (rightChar === selected) {
              range.end.column++;
              return range;
            }
          }
        },
      );
    };

    SQLBehaviour.isSaneInsertion = function (editor, session) {
      const cursor = editor.getCursorPosition();
      const iterator = new TokenIterator(session, cursor.row, cursor.column);

      // Don't insert in the middle of a keyword/identifier/lexical
      if (
        !this.$matchTokenType(
          iterator.getCurrentToken() || "text",
          SAFE_INSERT_IN_TOKENS,
        )
      ) {
        // Look ahead in case we're at the end of a token
        const iterator2 = new TokenIterator(
          session,
          cursor.row,
          cursor.column + 1,
        );
        if (
          !this.$matchTokenType(
            iterator2.getCurrentToken() || "text",
            SAFE_INSERT_IN_TOKENS,
          )
        ) {
          return false;
        }
      }

      // Only insert in front of whitespace/comments
      iterator.stepForward();
      return (
        iterator.getCurrentTokenRow() !== cursor.row ||
        this.$matchTokenType(
          iterator.getCurrentToken() || "text",
          SAFE_INSERT_BEFORE_TOKENS,
        )
      );
    };

    SQLBehaviour.$matchTokenType = function (token, types) {
      return types.indexOf(token.type || token) > -1;
    };

    SQLBehaviour.recordAutoInsert = function (editor, session, bracket) {
      const cursor = editor.getCursorPosition();
      const line = session.doc.getLine(cursor.row);
      // Reset previous state if text or context changed too much
      if (
        !this.isAutoInsertedClosing(
          cursor,
          line,
          context.autoInsertedLineEnd[0],
        )
      ) {
        context.autoInsertedBrackets = 0;
      }
      context.autoInsertedRow = cursor.row;
      context.autoInsertedLineEnd = bracket + line.substr(cursor.column);
      context.autoInsertedBrackets++;
    };

    SQLBehaviour.recordMaybeInsert = function (editor, session, bracket) {
      const cursor = editor.getCursorPosition();
      const line = session.doc.getLine(cursor.row);
      if (!this.isMaybeInsertedClosing(cursor, line)) {
        context.maybeInsertedBrackets = 0;
      }
      context.maybeInsertedRow = cursor.row;
      context.maybeInsertedLineStart = line.substr(0, cursor.column) + bracket;
      context.maybeInsertedLineEnd = line.substr(cursor.column);
      context.maybeInsertedBrackets++;
    };

    SQLBehaviour.isAutoInsertedClosing = function (cursor, line, bracket) {
      return (
        context.autoInsertedBrackets > 0 &&
        cursor.row === context.autoInsertedRow &&
        bracket === context.autoInsertedLineEnd[0] &&
        line.substr(cursor.column) === context.autoInsertedLineEnd
      );
    };

    SQLBehaviour.isMaybeInsertedClosing = function (cursor, line) {
      return (
        context.maybeInsertedBrackets > 0 &&
        cursor.row === context.maybeInsertedRow &&
        line.substr(cursor.column) === context.maybeInsertedLineEnd &&
        line.substr(0, cursor.column) === context.maybeInsertedLineStart
      );
    };

    SQLBehaviour.popAutoInsertedClosing = function () {
      context.autoInsertedLineEnd = context.autoInsertedLineEnd.substr(1);
      context.autoInsertedBrackets--;
    };

    SQLBehaviour.clearMaybeInsertedClosing = function () {
      if (context) {
        context.maybeInsertedBrackets = 0;
        context.maybeInsertedRow = -1;
      }
    };

    oop.inherits(SQLBehaviour, Behaviour);

    exports.SQLBehaviour = SQLBehaviour;
  },
);
