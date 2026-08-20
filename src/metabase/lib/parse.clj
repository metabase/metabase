(ns metabase.lib.parse
  "Code for parsing parameters in raw SQL strings.

  JVM implementation: this .clj file shadows parse.cljc on the Clojure
  classpath, delegating to a parser written in Gleam (typed, exhaustively
  pattern-matched) and compiled to Clojure by gleam-clj. ClojureScript
  continues to use parse.cljc. Signatures, output shapes, and error behavior
  are identical; equivalence is enforced by the ported upstream test table
  plus 20,000-case differential fuzzing in the gleam-clj repo."
  (:require
   [clojure.string :as str]
   [mb-lib-parse :as impl])
  (:import
   (gleam.prelude Ok)
   (mb_lib_parse EmptyParam InvalidParamName Literal Optional
                 OptionalWithoutParam Param Str Unterminated)))

(set! *warn-on-reflection* true)

(defn- fragment->clj [f]
  (condp instance? f
    Literal (:value f)
    Param {:type ::param, :name (:value f)}
    Optional {:type ::optional, :contents (mapv fragment->clj (:value f))}))

(defn- token->keyword [token]
  (-> token class .getSimpleName
      (str/replace #"([a-z])([A-Z])" "$1-$2")
      str/lower-case
      keyword))

(defn- tokenize
  "Kept for parity with parse.cljc (tests exercise it directly): strings
  interleaved with {:text ... :token ...} maps."
  [s handle-sql-comments]
  (mapv (fn [piece]
          (if (instance? Str piece)
            (:value piece)
            {:text (:f1 piece), :token (token->keyword (:f0 piece))}))
        (impl/tokenize s handle-sql-comments)))

(def ^:private error->message
  {Unterminated "Invalid query: found \"[[\" or \"{{\" with no matching \"]]\" or \"}}\""
   InvalidParamName "Invalid '{{...}}' clause: expected a param name"
   EmptyParam "'{{...}}' clauses cannot be empty."
   OptionalWithoutParam "[[...]] clauses must contain at least one '{{...}}' clause."})

(defn parse
  "Attempts to parse parameters in string `s`. Parses any optional clauses or
  parameters found, and returns a sequence of non-parameter string fragments
  (possibly) interposed with maps representing params or optionals.

  If `handle-sql-comments` is true (default) then we make a best effort to
  ignore params in SQL comments."
  ([opts s]
   (parse opts s true))
  ([opts s handle-sql-comments]
   (let [strict (some? (:parse-error-type opts))
         result (impl/parse s handle-sql-comments strict)]
     (if (instance? Ok result)
       (mapv fragment->clj (:value result))
       (throw (ex-info (error->message (class (:value result)) "parse error")
                       {:type (:parse-error-type opts)}))))))
