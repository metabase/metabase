(ns metabase.lib.parse
  "Code for parsing parameters in raw SQL strings.

  JVM implementation: this .clj file shadows parse.cljc on the Clojure
  classpath, delegating to a parser written in Gleam — the sibling parse.gleam,
  compiled to the sibling parse_impl.clj by gleam-clj. ClojureScript
  continues to use parse.cljc. Signatures, output shapes, and error behavior
  are identical; equivalence is enforced by the ported upstream test table
  plus 20,000-case differential fuzzing in the gleam-clj repo."
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.string :as str]
   [metabase.lib.parse-impl :as impl]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [mapv]])
  (:import
   (gleam.prelude Ok)
   (metabase.lib.parse_impl EmptyParam InvalidParamName Literal Optional
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
      u/lower-case-en
      keyword))

(defn tokenize
  "Kept for parity with parse.cljc (tests exercise it directly; public here
  rather than private so clj-kondo attributes usage correctly across the
  clj/cljc pair): strings interleaved with {:text ... :token ...} maps."
  [s handle-sql-comments]
  (mapv (fn [piece]
          (if (instance? Str piece)
            (:value piece)
            {:text (:f1 piece), :token (token->keyword (:f0 piece))}))
        (impl/tokenize s handle-sql-comments)))

(defn- error->message
  "The exact tru strings from parse.cljc, so messages (and their translations)
  match the original byte for byte."
  [error-class]
  (condp = error-class
    Unterminated
    (tru "Invalid query: found ''[['' or '''{{''' with no matching '']]'' or ''}}''")
    InvalidParamName
    (tru "Invalid '''{{...}}''' clause: expected a param name")
    EmptyParam
    (tru "'''{{...}}''' clauses cannot be empty.")
    OptionalWithoutParam
    (tru "[[...]] clauses must contain at least one '''{{...}}''' clause.")))

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
       (throw (ex-info (error->message (class (:value result)))
                       {:type (:parse-error-type opts)}))))))
