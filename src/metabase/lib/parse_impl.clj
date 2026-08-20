;; GENERATED FILE — do not edit by hand.
;; Compiled from the sibling parse.gleam by gleam-clj
;; (github.com/escherize/gleam-clj). Regenerate:
;;   gleam-to-clj build <project-with-src/metabase/lib/parse_impl.gleam> <out>
(ns metabase.lib.parse-impl
  (:require
   [gleam.list :as list]
   [gleam.prelude :as p]
   [gleam.string :as string])
  (:import (gleam.prelude Ok)))

;; type Token
(defrecord OptionalBegin [])
(defn OptionalBegin? [v] (instance? OptionalBegin v))
(defrecord OptionalEnd [])
(defn OptionalEnd? [v] (instance? OptionalEnd v))
(defrecord ParamBegin [])
(defn ParamBegin? [v] (instance? ParamBegin v))
(defrecord ParamEnd [])
(defn ParamEnd? [v] (instance? ParamEnd v))
(defrecord SingleQuote [])
(defn SingleQuote? [v] (instance? SingleQuote v))
(defrecord BlockCommentBegin [])
(defn BlockCommentBegin? [v] (instance? BlockCommentBegin v))
(defrecord BlockCommentEnd [])
(defn BlockCommentEnd? [v] (instance? BlockCommentEnd v))
(defrecord LineCommentBegin [])
(defn LineCommentBegin? [v] (instance? LineCommentBegin v))
(defrecord Newline [])
(defn Newline? [v] (instance? Newline v))

;; type Piece
(defrecord Str [value])
(defn Str? [v] (instance? Str v))
(defrecord Tok [f0 f1])
(defn Tok? [v] (instance? Tok v))

;; type Fragment
(defrecord Literal [value])
(defn Literal? [v] (instance? Literal v))
(defrecord Param [value])
(defn Param? [v] (instance? Param v))
(defrecord Optional [value])
(defn Optional? [v] (instance? Optional v))

;; type ParseError
(defrecord Unterminated [])
(defn Unterminated? [v] (instance? Unterminated v))
(defrecord InvalidParamName [])
(defn InvalidParamName? [v] (instance? InvalidParamName v))
(defrecord EmptyParam [])
(defn EmptyParam? [v] (instance? EmptyParam v))
(defrecord OptionalWithoutParam [])
(defn OptionalWithoutParam? [v] (instance? OptionalWithoutParam v))

;; type Pattern
(defrecord Lit [f0 f1])
(defn Lit? [v] (instance? Lit v))
(defrecord ParamBeginPattern [])
(defn ParamBeginPattern? [v] (instance? ParamBeginPattern v))

;; type Mode
(defrecord NoComment [])
(defn NoComment? [v] (instance? NoComment v))
(defrecord LineMode [])
(defn LineMode? [v] (instance? LineMode v))
(defrecord BlockMode [])
(defn BlockMode? [v] (instance? BlockMode v))

;; type State
(defrecord State [optional-level param-level in-string mode])
(defn State? [v] (instance? State v))

(defn- base-patterns []
  (list (->Lit "[[" (->OptionalBegin)) (->Lit "]]" (->OptionalEnd)) (->ParamBeginPattern) (->Lit "}}" (->ParamEnd)) (->Lit "'" (->SingleQuote))))

(defn- sql-patterns []
  (list/append (list (->Lit "/*" (->BlockCommentBegin)) (->Lit "*/" (->BlockCommentEnd)) (->Lit "--" (->LineCommentBegin)) (->Lit "\n" (->Newline)))
               (base-patterns)))

(defn- split-literal [s pat token acc]
  (let [subject (string/split-once s pat)]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (list/reverse (list* (->Str s) acc))
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1)]
        (recur after pat token (list* (->Tok token pat) (->Str before) acc))))))

(defn- find-param-begin
  "Find the first `{{` that is not followed by a third `{`; returns the text
  before it and the text after it."
  [s before-acc]
  (let [subject (string/split-once s "{{")]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (p/->Error nil)
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1) subject (string/starts-with after "{")]
        (if (not subject)
          (p/->Ok [(str before-acc before) after])
          (recur (str "{" after) (str (str before-acc before) "{")))))))

(defn- split-param-begin [s acc]
  (let [subject (find-param-begin s "")]
    (if (and (instance? gleam.prelude.Error subject) (nil? (:value subject)))
      (list/reverse (list* (->Str s) acc))
      (let [before (nth (:value subject) 0) after (nth (:value subject) 1)]
        (recur after (list* (->Tok (->ParamBegin) "{{") (->Str before) acc))))))

(defn- apply-pattern [pieces pattern]
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
  {:malli/schema [:=> [:cat :string :boolean]
                  [:sequential [:or [:fn Str?] [:fn Tok?]]]]}
  [s handle-sql-comments]
  (let [patterns (if handle-sql-comments (sql-patterns) (base-patterns))]
    (list/fold patterns (list (->Str s)) apply-pattern)))

(defn- combine-adjacent [frags]
  (cond
    (and (<= 2 (count frags)) (instance? Literal (first frags)) (instance? Literal (nth frags 1)))
    (let [a (:value (first frags)) b (:value (nth frags 1)) rest' (nthrest frags 2)]
      (recur (list* (->Literal (str a b)) rest')))

    (seq frags)
    (let [f (first frags) rest' (rest frags)]
      (list* f (combine-adjacent rest')))

    (empty? frags)
    (list)))

(defn- invalid [strict error]
  (if strict (p/->Error error) (p/->Ok (list))))

(defn- make-param [strict contents]
  (let [subject (combine-adjacent contents)]
    (if (and (= (count subject) 1) (instance? Literal (first subject)))
      (let [k (:value (first subject)) subject (string/is-empty (string/trim k))]
        (if subject
          (invalid strict (->EmptyParam))
          (p/->Ok (list (->Param k)))))
      (invalid strict (->InvalidParamName)))))

(defn- make-optional [strict contents]
  (let [has-param (list/any contents
                            (fn [f] (if (instance? Param f) true false)))]
    (if has-param
      (p/->Ok (list (->Optional (combine-adjacent contents))))
      (invalid strict (->OptionalWithoutParam)))))

(defn- prepend-reversed [frags acc]
  (list/fold frags acc (fn [a f] (list* f a))))

(defn- tokens-state [optional-level param-level in-string mode]
  (->State optional-level param-level in-string mode))

(declare enter-comment enter-clause parse-tokens)

(defn- enter-comment [strict comment-mode text more optional-level param-level in-string mode acc]
  (let [in-clause (or (> optional-level 0) (> param-level 0)) subject (or (or (not= mode (->NoComment)) in-clause) in-string)]
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
  "Shared body of the OptionalBegin/ParamBegin cases: run the sub-parse,
  validate it, and either splice the result in or — when inside a string
  literal — backtrack the failed clause to literal text."
  [strict sub validate text more strict2 state acc]
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
  "The state machine. `acc` is built in reverse. Returns the fragments of
  the current scope plus the unconsumed tokens."
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
  "Parse parameters in `s`, returning literal fragments interleaved with
  Param and Optional fragments."
  {:malli/schema [:=> [:cat :string :boolean :boolean]
                  [:or [:fn p/Ok?] [:fn p/Error?]]]}
  [s handle-sql-comments strict]
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

(defn main
  {:malli/schema [:=> [:cat] [:or [:fn p/Ok?] [:fn p/Error?]]]}
  []
  (p/let-assert (p/->Ok (list (->Literal "select 1")))
                (parse "select 1" true true))
  (p/let-assert (p/->Ok (list (->Literal "a=") (->Param "x")))
                (parse "a={{x}}" true true))
  (p/let-assert (p/->Ok (list (->Literal "a ") (->Optional (list (->Literal "b ") (->Param "x")))))
                (parse "a [[b {{x}}]]" true true))
  (p/let-assert (p/->Ok (list (->Literal "SELECT -- {{foo}}")))
                (parse "SELECT -- {{foo}}" true true))
  (p/let-assert (p/->Ok (list (->Literal "'{{}}'")))
                (parse "'{{}}'" true true))
  (p/let-assert (p/->Ok (list (->Literal "'") (->Param "x") (->Literal "'")))
                (parse "'{{x}}'" true true))
  (p/let-assert (p/->Ok (list (->Literal "{x: {y: \"") (->Param "param") (->Literal "\"}}")))
                (parse "{x: {y: \"{{param}}\"}}" true true))
  (p/let-assert (p/->Error (->Unterminated)) (parse "select {{x" true true))
  (p/let-assert (p/->Error (->OptionalWithoutParam))
                (parse "[[no params]]" true true)))

(defn -main [& _]
  (main))
