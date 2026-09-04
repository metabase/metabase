;; GENERATED FILE — do not edit by hand.
;; Compiled from the sibling parse.gleam by gleam-clj
;; (github.com/escherize/gleam-clj). Regenerate:
;;   GLEAM_CLJ_NO_MAIN=1 gleam-to-clj build <project> <out>
(ns metabase.lib.parse-impl
  "A typed reimplementation of metabase.lib.parse: parsing `{{param}}` and
   `[[optional]]` clauses in native query strings, with best-effort skipping
   of params inside SQL comments and string literals.

   Faithful port of the Clojure original:
   - tokenization is sequential pass-by-pass splitting (pattern order
   matters for overlaps, so a single left-to-right scan would differ)
   - `{{` only matches when not followed by another `{` (so `{{{x}}` parses
   as a literal `{` plus a param)
   - inside string literals, a clause that fails to parse is backtracked to
   literal text (the original does this with catch/rethrow; here it is a
   Result)
   - `strict` mirrors the original's :parse-error-type option: when false,
   invalid (but terminated) clauses dissolve to nothing instead of erroring"
  (:require
   [gleam.list :as list]
   [gleam.prelude :as p]
   [gleam.string :as string])
  (:import (gleam.prelude Ok)))

;; type Token
(defprotocol IToken)
(defrecord OptionalBegin [] IToken)
(defn OptionalBegin? "True if `v` is a OptionalBegin value." [v] (instance? OptionalBegin v))
(defrecord OptionalEnd [] IToken)
(defn OptionalEnd? "True if `v` is a OptionalEnd value." [v] (instance? OptionalEnd v))
(defrecord ParamBegin [] IToken)
(defn ParamBegin? "True if `v` is a ParamBegin value." [v] (instance? ParamBegin v))
(defrecord ParamEnd [] IToken)
(defn ParamEnd? "True if `v` is a ParamEnd value." [v] (instance? ParamEnd v))
(defrecord SingleQuote [] IToken)
(defn SingleQuote? "True if `v` is a SingleQuote value." [v] (instance? SingleQuote v))
(defrecord BlockCommentBegin [] IToken)
(defn BlockCommentBegin? "True if `v` is a BlockCommentBegin value." [v] (instance? BlockCommentBegin v))
(defrecord BlockCommentEnd [] IToken)
(defn BlockCommentEnd? "True if `v` is a BlockCommentEnd value." [v] (instance? BlockCommentEnd v))
(defrecord LineCommentBegin [] IToken)
(defn LineCommentBegin? "True if `v` is a LineCommentBegin value." [v] (instance? LineCommentBegin v))
(defrecord Newline [] IToken)
(defn Newline? "True if `v` is a Newline value." [v] (instance? Newline v))
(defn Token? "True if `v` is any Token value." [v] (instance? metabase.lib.parse_impl.IToken v))
(defn Token-schema
  "Malli schema for Token."
  []
  [:or
   [:fn OptionalBegin?]
   [:fn OptionalEnd?]
   [:fn ParamBegin?]
   [:fn ParamEnd?]
   [:fn SingleQuote?]
   [:fn BlockCommentBegin?]
   [:fn BlockCommentEnd?]
   [:fn LineCommentBegin?]
   [:fn Newline?]])

;; type Piece
(defprotocol IPiece)
(defrecord Str [^java.lang.String value] IPiece)
(defn Str? "True if `v` is a Str value." [v] (instance? Str v))
(defrecord Tok [f0 ^java.lang.String f1] IPiece)
(defn Tok? "True if `v` is a Tok value." [v] (instance? Tok v))
(defn Piece? "True if `v` is any Piece value." [v] (instance? metabase.lib.parse_impl.IPiece v))
(defn Piece-schema
  "Malli schema for Piece."
  []
  [:or
   [:and [:fn Str?] [:map [:value :string]]]
   [:and [:fn Tok?] [:map [:f0 (Token-schema)] [:f1 :string]]]])

;; type Fragment
(defprotocol IFragment)
(defrecord Literal [^java.lang.String value] IFragment)
(defn Literal? "True if `v` is a Literal value." [v] (instance? Literal v))
(defrecord Param [^java.lang.String value] IFragment)
(defn Param? "True if `v` is a Param value." [v] (instance? Param v))
(defrecord Optional [value] IFragment)
(defn Optional? "True if `v` is a Optional value." [v] (instance? Optional v))
(defn Fragment? "True if `v` is any Fragment value." [v] (instance? metabase.lib.parse_impl.IFragment v))
(defn Fragment-schema
  "Malli schema for Fragment."
  []
  [:or
   [:and [:fn Literal?] [:map [:value :string]]]
   [:and [:fn Param?] [:map [:value :string]]]
   [:and [:fn Optional?] [:map [:value [:sequential [:fn Fragment?]]]]]])

;; type ParseError
(defprotocol IParseError)
(defrecord Unterminated [] IParseError)
(defn Unterminated? "True if `v` is a Unterminated value." [v] (instance? Unterminated v))
(defrecord InvalidParamName [] IParseError)
(defn InvalidParamName? "True if `v` is a InvalidParamName value." [v] (instance? InvalidParamName v))
(defrecord EmptyParam [] IParseError)
(defn EmptyParam? "True if `v` is a EmptyParam value." [v] (instance? EmptyParam v))
(defrecord OptionalWithoutParam [] IParseError)
(defn OptionalWithoutParam? "True if `v` is a OptionalWithoutParam value." [v] (instance? OptionalWithoutParam v))
(defn ParseError? "True if `v` is any ParseError value." [v] (instance? metabase.lib.parse_impl.IParseError v))
(defn ParseError-schema
  "Malli schema for ParseError."
  []
  [:or
   [:fn Unterminated?]
   [:fn InvalidParamName?]
   [:fn EmptyParam?]
   [:fn OptionalWithoutParam?]])

;; type Pattern
(defprotocol IPattern)
(defrecord Lit [^java.lang.String f0 f1] IPattern)
(defn Lit? "True if `v` is a Lit value." [v] (instance? Lit v))
(defrecord ParamBeginPattern [] IPattern)
(defn ParamBeginPattern? "True if `v` is a ParamBeginPattern value." [v] (instance? ParamBeginPattern v))
(defn Pattern? "True if `v` is any Pattern value." [v] (instance? metabase.lib.parse_impl.IPattern v))
(defn Pattern-schema
  "Malli schema for Pattern."
  []
  [:or
   [:and [:fn Lit?] [:map [:f0 :string] [:f1 (Token-schema)]]]
   [:fn ParamBeginPattern?]])

;; type Mode
(defprotocol IMode)
(defrecord NoComment [] IMode)
(defn NoComment? "True if `v` is a NoComment value." [v] (instance? NoComment v))
(defrecord LineMode [] IMode)
(defn LineMode? "True if `v` is a LineMode value." [v] (instance? LineMode v))
(defrecord BlockMode [] IMode)
(defn BlockMode? "True if `v` is a BlockMode value." [v] (instance? BlockMode v))
(defn Mode? "True if `v` is any Mode value." [v] (instance? metabase.lib.parse_impl.IMode v))
(defn Mode-schema
  "Malli schema for Mode."
  []
  [:or
   [:fn NoComment?]
   [:fn LineMode?]
   [:fn BlockMode?]])

;; type State
(defprotocol IState)
(defrecord State [optional-level param-level in-string mode] IState)
(defn State? "True if `v` is a State value." [v] (instance? State v))
(defn State-schema
  "Malli schema for State."
  []
  [:and [:fn State?] [:map [:optional-level :int] [:param-level :int] [:in-string :boolean] [:mode (Mode-schema)]]])

(defn- base-patterns
  "base_patterns() -> List(Pattern)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:69"}
  []
  (list (->Lit "[[" (->OptionalBegin)) (->Lit "]]" (->OptionalEnd)) (->ParamBeginPattern) (->Lit "}}" (->ParamEnd)) (->Lit "'" (->SingleQuote))))

(defn- sql-patterns
  "sql_patterns() -> List(Pattern)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:79"}
  []
  (list/append (list (->Lit "/*" (->BlockCommentBegin)) (->Lit "*/" (->BlockCommentEnd)) (->Lit "--" (->LineCommentBegin)) (->Lit "\n" (->Newline)))
               (base-patterns)))

(defn- split-literal
  "split_literal(s: String, pat: String, token: Token, acc: List(Piece)) -> List(Piece)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:91"}
  [^java.lang.String s ^java.lang.String pat token acc]
  (let [subject (string/split-once s pat)]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (list/reverse (list* (->Str s) acc))
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1)]
        (recur after pat token (list* (->Tok token pat) (->Str before) acc))))))

(defn- find-param-begin
  "find_param_begin(s: String, before_acc: String) -> Result(#(String, String), Nil)

   Find the first `{{` that is not followed by a third `{`; returns the text
   before it and the text after it."
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:101"}
  [^java.lang.String s ^java.lang.String before-acc]
  (let [subject (string/split-once s "{{")]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (p/->Error nil)
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1) subject (string/starts-with after "{")]
        (if (not subject)
          (p/->Ok [(str before-acc before) after])
          (recur (str "{" after) (str before-acc before "{")))))))

(defn- split-param-begin
  "split_param_begin(s: String, acc: List(Piece)) -> List(Piece)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:112"}
  [^java.lang.String s acc]
  (let [subject (find-param-begin s "")]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (list/reverse (list* (->Str s) acc))
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1)]
        (recur after (list* (->Tok (->ParamBegin) "{{") (->Str before) acc))))))

(defn- apply-pattern
  "apply_pattern(pieces: List(Piece), pattern: Pattern) -> List(Piece)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:120"}
  [pieces pattern]
  (-> pieces
      (list/flat-map (fn [piece]
                       (if (instance? Tok piece)
                         (list piece)
                         (let [s (:value piece)]
                           (if (instance? Lit pattern)
                             (let [pat (:f0 pattern) token (:f1 pattern)]
                               (split-literal s pat token (list)))
                             (split-param-begin s (list)))))))
      (list/filter (fn [piece]
                     (if (and (instance? Str piece) (= (:value piece) ""))
                       false
                       true)))))

(defn tokenize
  "tokenize(s: String, handle_sql_comments: Bool) -> List(Piece)"
  {:malli/schema [:=> [:cat :string :boolean] [:sequential (Piece-schema)]]
   :gleam/src "./src/metabase/lib/parse_impl.gleam:140"}
  [^java.lang.String s handle-sql-comments]
  (let [patterns (if handle-sql-comments (sql-patterns) (base-patterns))]
    (list/fold patterns (list (->Str s)) apply-pattern)))

(defn- combine-adjacent
  "combine_adjacent(frags: List(Fragment)) -> List(Fragment)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:157"}
  [frags]
  (cond
    (and (<= 2 (count frags)) (instance? Literal (first frags)) (instance? Literal (nth frags 1)))
    (let [a (:value (first frags)) b (:value (nth frags 1)) rest' (nthrest frags 2)]
      (recur (list* (->Literal (str a b)) rest')))

    (seq frags)
    (let [f (first frags) rest' (rest frags)]
      (list* f (combine-adjacent rest')))

    (empty? frags)
    (list)))

(defn- invalid
  "invalid(strict: Bool, error: ParseError) -> Result(List(Fragment), ParseError)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:165"}
  [strict error]
  (if strict (p/->Error error) (p/->Ok (list))))

(defn- make-param
  "make_param(strict: Bool, contents: List(Fragment)) -> Result(List(Fragment), ParseError)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:172"}
  [strict contents]
  (let [subject (combine-adjacent contents)]
    (if (and (= (count subject) 1) (instance? Literal (first subject)))
      (let [k (:value (first subject)) subject (string/is-empty (string/trim k))]
        (if subject
          (invalid strict (->EmptyParam))
          (p/->Ok (list (->Param k)))))
      (invalid strict (->InvalidParamName)))))

(defn- make-optional
  "make_optional(strict: Bool, contents: List(Fragment)) -> Result(List(Fragment), ParseError)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:183"}
  [strict contents]
  (let [has-param (list/any contents
                            (fn [f] (if (instance? Param f) true false)))]
    (if has-param
      (p/->Ok (list (->Optional (combine-adjacent contents))))
      (invalid strict (->OptionalWithoutParam)))))

(defn- prepend-reversed
  "prepend_reversed(frags: List(Fragment), acc: List(Fragment)) -> List(Fragment)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:197"}
  [frags acc]
  (list/fold frags acc (fn [a f] (list* f a))))

(defn- tokens-state
  "tokens_state(optional_level: Int, param_level: Int, in_string: Bool, mode: Mode) -> State"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:341"}
  [optional-level param-level in-string mode]
  (->State optional-level param-level in-string mode))

(declare enter-comment enter-clause parse-tokens)

(defn- enter-comment
  "enter_comment(strict: Bool, comment_mode: Mode, text: String, more: List(Piece), optional_level: Int, param_level: Int, in_string: Bool, mode: Mode, acc: List(Fragment)) -> Result(#(List(Fragment), List(Piece)), ParseError)"
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:390"}
  [strict comment-mode ^java.lang.String text more optional-level param-level in-string mode acc]
  (let [in-clause (or (> optional-level 0) (> param-level 0)) subject (or (not= mode (->NoComment)) in-clause in-string)]
    (if subject
      (parse-tokens strict
                    more
                    optional-level
                    param-level
                    in-string
                    mode
                    (list* (->Literal text) acc))
      (let [subject (parse-tokens strict
                                  more
                                  optional-level
                                  param-level
                                  in-string
                                  comment-mode
                                  (list))]
        (if (instance? Ok subject)
          (let [inner (nth (:value subject) 0) rest' (nth (:value subject) 1)]
            (parse-tokens strict
                          rest'
                          optional-level
                          param-level
                          in-string
                          mode
                          (prepend-reversed inner
                                            (list* (->Literal text) acc))))
          (let [e (:value subject)]
            (p/->Error e)))))))

(defn- enter-clause
  "enter_clause(strict: Bool, sub: Result(#(List(Fragment), List(Piece)), ParseError), validate: fn(Bool, List(Fragment)) -> Result(List(Fragment), ParseError), text: String, more: List(Piece), strict2: Bool, state: State, acc: List(Fragment)) -> Result(#(List(Fragment), List(Piece)), ParseError)

   Shared body of the OptionalBegin/ParamBegin cases: run the sub-parse,
   validate it, and either splice the result in or — when inside a string
   literal — backtrack the failed clause to literal text."
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:348"}
  [strict sub validate ^java.lang.String text more strict2 state acc]
  (let [{optional-level :optional-level param-level :param-level in-string :in-string mode :mode} state
        validated (if (instance? Ok sub)
                    (let [inner (nth (:value sub) 0) rest' (nth (:value sub) 1) subject (validate strict2 inner)]
                      (if (instance? Ok subject)
                        (let [frags (:value subject)]
                          (p/->Ok [frags rest']))
                        (let [e (:value subject)]
                          (p/->Error e))))
                    (let [e (:value sub)]
                      (p/->Error e)))]
    (if (instance? Ok validated)
      (let [frags (nth (:value validated) 0) rest' (nth (:value validated) 1)]
        (parse-tokens strict
                      rest'
                      optional-level
                      param-level
                      in-string
                      mode
                      (prepend-reversed frags acc)))
      (let [e (:value validated)]
        (if in-string
          (parse-tokens strict
                        more
                        optional-level
                        param-level
                        in-string
                        mode
                        (list* (->Literal text) acc))
          (p/->Error e))))))

(defn- parse-tokens
  "parse_tokens(strict: Bool, tokens: List(Piece), optional_level: Int, param_level: Int, in_string: Bool, mode: Mode, acc: List(Fragment)) -> Result(#(List(Fragment), List(Piece)), ParseError)

   The state machine. `acc` is built in reverse. Returns the fragments of
   the current scope plus the unconsumed tokens."
  {:gleam/src "./src/metabase/lib/parse_impl.gleam:203"}
  [strict tokens optional-level param-level in-string mode acc]
  (cond
    (empty? tokens)
    (let [subject (or (> optional-level 0) (> param-level 0))]
      (if subject
        (p/->Error (->Unterminated))
        (p/->Ok [(list/reverse acc) (list)])))

    (and (seq tokens) (instance? Str (first tokens)))
    (let [more (rest tokens) s (:value (first tokens))]
      (recur strict more optional-level param-level in-string mode (list* (->Literal s) acc)))

    (and (seq tokens) (instance? Tok (first tokens)))
    (let [token (:f0 (first tokens)) text (:f1 (first tokens)) more (rest tokens)]
      (cond
        (instance? OptionalBegin token)
        (if (instance? NoComment mode)
          (enter-clause strict
                        (parse-tokens strict
                                      more
                                      (+' optional-level 1)
                                      param-level
                                      in-string
                                      mode
                                      (list))
                        make-optional
                        text
                        more
                        strict
                        (tokens-state optional-level
                                      param-level
                                      in-string
                                      mode)
                        acc)
          (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc)))

        (instance? ParamBegin token)
        (if (instance? NoComment mode)
          (enter-clause strict
                        (parse-tokens strict
                                      more
                                      optional-level
                                      (+' param-level 1)
                                      in-string
                                      mode
                                      (list))
                        make-param
                        text
                        more
                        strict
                        (tokens-state optional-level
                                      param-level
                                      in-string
                                      mode)
                        acc)
          (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc)))

        (instance? LineCommentBegin token)
        (enter-comment strict
                       (->LineMode)
                       text
                       more
                       optional-level
                       param-level
                       in-string
                       mode
                       acc)

        (instance? BlockCommentBegin token)
        (enter-comment strict
                       (->BlockMode)
                       text
                       more
                       optional-level
                       param-level
                       in-string
                       mode
                       acc)

        (instance? BlockCommentEnd token)
        (if (instance? BlockMode mode)
          (p/->Ok [(list/reverse (list* (->Literal text) acc)) more])
          (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc)))

        (instance? Newline token)
        (if (instance? LineMode mode)
          (p/->Ok [(list/reverse (list* (->Literal text) acc)) more])
          (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc)))

        (instance? OptionalEnd token)
        (let [subject (> optional-level 0)]
          (if subject
            (p/->Ok [(list/reverse acc) more])
            (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc))))

        (instance? ParamEnd token)
        (let [subject (> param-level 0)]
          (if subject
            (p/->Ok [(list/reverse acc) more])
            (recur strict more optional-level param-level in-string mode (list* (->Literal text) acc))))

        (instance? SingleQuote token)
        (recur strict more optional-level param-level (not in-string) mode (list* (->Literal text) acc))))))

(defn parse
  "parse(s: String, handle_sql_comments: Bool, strict: Bool) -> Result(List(Fragment), ParseError)

   Parse parameters in `s`, returning literal fragments interleaved with
   Param and Optional fragments."
  {:malli/schema [:=> [:cat :string :boolean :boolean]
                  (p/result-of [:sequential (Fragment-schema)] (ParseError-schema))]
   :gleam/src "./src/metabase/lib/parse_impl.gleam:427"}
  [^java.lang.String s handle-sql-comments strict]
  (let [subject (tokenize s handle-sql-comments)]
    (cond
      (empty? subject)
      (p/->Ok (list))

      (and (= (count subject) 1) (instance? Str (first subject)))
      (p/->Ok (list (->Literal s)))

      :else
      (let [pieces subject subject (parse-tokens strict pieces 0 0 false (->NoComment) (list))]
        (if (instance? Ok subject)
          (let [frags (nth (:value subject) 0)]
            (p/->Ok (combine-adjacent frags)))
          (let [e (:value subject)]
            (p/->Error e)))))))
