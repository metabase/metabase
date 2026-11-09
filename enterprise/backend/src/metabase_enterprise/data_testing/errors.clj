(ns metabase-enterprise.data-testing.errors
  "The `:error-type` vocabulary for tests, and [[ex]], the constructor every typed throw goes through.

  A refusal and a failure are different outcomes, and a caller that confuses them either gives up
  on a real bug or chases one that does not exist. Everything here is a refusal: the run did not
  happen, or could not be completed. A failing expectation is not an error — it is a result, and
  it rides back on the expectation that produced it."
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private error-types
  "Every `:error-type` a test run can throw, and the HTTP status it carries.

  400 — the test is wrong, and its author can fix it.
  422 — the test is fine; the subject or its database prevents a run here.
  501 — the test asks for something not built yet."
  {;; 400 — authoring
   ::unknown-column             400  ; An expectation names a column the output does not have.
   ::ambiguous-column           400  ; An expectation names a column that matches several, case aside.
   ::missing-inputs             400  ; The query under test reads a table with no declared input.
   ::unused-inputs              400  ; An input is declared for a table the query under test never reads.
   ::duplicate-input-table      400  ; Two inputs stand in for the same table.
   ::unparseable-source         400  ; The SQL of the query under test could not be parsed to find what it reads.
   ::unremapped-reference       400  ; A real table survived the rewrite into the test's SQL.
   ::no-expectations            400  ; The test checks nothing.

   ;; 422 — the subject or its environment
   ::unsupported-transform      422  ; Not a query transform (Python, say).
   ::unsupported-driver         422  ; The database does not support testing.
   ::uncompilable-subject       422  ; The subject's query does not compile to SQL.
   ::query-failed               422  ; The query under test would not run.
   ::duplicate-output-columns   422  ; The output of the query under test has two columns of one name, case aside.
   ::setup-failed               422  ; A test input could not be materialized.
   ::expectation-failed         422  ; An expectation's own query failed to execute.

   ;; 501 — not built yet
   ::unsupported-format         501}); The expectation asks for a form that is not implemented.

(def all
  "Every declared `:error-type`."
  (set (keys error-types)))

(mu/defn checked :- :keyword
  "Return `error-type` iff it is a member of [[all]]; otherwise throw."
  [error-type :- :keyword]
  (when-not (contains? all error-type)
    (throw (ex-info (str error-type " is not a declared test error type; see"
                         " metabase-enterprise.data-testing.errors/all.")
                    {:invalid-error-type error-type})))
  error-type)

(defmacro ex
  "Construct (not throw) a typed test ExceptionInfo. `error-type` is assoc'd into `data`
  under `:error-type` and must be a member of [[all]] — a literal keyword is checked at
  macro-expansion time, so a typo fails the build; a computed one is checked at runtime."
  ([error-type msg data]
   `(ex ~error-type ~msg ~data nil))
  ([error-type msg data cause]
   (if (keyword? error-type)
     (do (checked error-type)
         `(ex-info ~msg (assoc ~data :error-type ~error-type) ~cause))
     `(ex-info ~msg (assoc ~data :error-type (checked ~error-type)) ~cause))))

(mu/defn code :- :string
  "The public wire spelling of `error-type` under `prefix`, the endpoint family that refused: `<prefix>.<name>`. A client
  switches on it."
  [prefix     :- :string
   error-type :- :keyword]
  ;; From the keyword's name, so the two cannot drift; the keyword's namespace is a source location, not vocabulary.
  (str prefix "." (name error-type)))

(mu/defn status-code :- :int
  "The HTTP status for `error-type`, or 500 for an untyped or unknown one."
  [error-type :- [:maybe :keyword]]
  (get error-types error-type 500))

(mu/defn refusing
  "Call `thunk`, rethrowing a typed refusal with the status of its type and its `:error-code` under `prefix`. Any other
  exception passes through unchanged."
  [prefix :- :string
   thunk  :- ifn?]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if-let [error-type (:error-type (ex-data e))]
        (throw (ex-info (ex-message e)
                        (assoc (dissoc (ex-data e) :error-type)
                               :status-code (status-code error-type)
                               :error-code  (code prefix error-type))))
        (throw e)))))

(mu/defn remap-message :- [:maybe :string]
  "`message` with every temp-table name in `temp->logical` replaced by the name the author wrote.

  Matching ignores case because Snowflake and H2 upper-case the generated names. A nil message
  stays nil."
  [message       :- [:maybe :string]
   temp->logical :- [:map-of :string :string]]
  (when message
    (reduce (fn [^String msg [temp logical]]
              (.replaceAll msg (str "(?i)\\b" (java.util.regex.Pattern/quote temp) "\\b")
                           (java.util.regex.Matcher/quoteReplacement logical)))
            (str message)
            temp->logical)))
