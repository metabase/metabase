(ns metabase.transform-testing.errors
  "The `:error-type` vocabulary for transform tests, and [[ex]], the constructor every typed throw
  goes through.

  A refusal and a failure are different outcomes, and a caller that confuses them either gives up
  on a real bug or chases one that does not exist. Everything here is a refusal: the run did not
  happen, or could not be completed. A failing expectation is not an error — it is a result, and
  it rides back on the expectation that produced it.")

(set! *warn-on-reflection* true)

(def ^:private error-types
  "Every `:error-type` a transform test run can throw, and the HTTP status it carries.

  400 — the test is wrong, and its author can fix it.
  422 — the test is fine; the transform or its database prevents a run here.
  501 — the test asks for something not built yet."
  {;; 400 — authoring
   ::unknown-column             400  ; An expectation names a column the output does not have.
   ::ambiguous-column           400  ; An expectation names a column that matches several, case aside.
   ::missing-inputs             400  ; The transform reads a table with no declared input.
   ::unused-inputs              400  ; An input is declared for a table the transform never reads.
   ::duplicate-input-table      400  ; Two inputs stand in for the same table.
   ::unparseable-source         400  ; The transform's SQL could not be parsed to find what it reads.
   ::unremapped-reference       400  ; A real table survived the rewrite into the test's SQL.

   ;; 422 — the transform or its environment
   ::unsupported-transform      422  ; Not a query transform (Python, say).
   ::unsupported-driver         422  ; The database does not support transform testing.
   ::transform-failed           422  ; The transform under test would not run.
   ::setup-failed               422  ; A test input could not be materialized.
   ::expectation-failed         422  ; An expectation's own query failed to execute.

   ;; 501 — not built yet
   ::unsupported-format         501}); The expectation asks for a form that is not implemented.

(def all
  "Every declared `:error-type`."
  (set (keys error-types)))

(defn checked
  "Return `error-type` iff it is a member of [[all]]; otherwise throw."
  [error-type]
  (when-not (contains? all error-type)
    (throw (ex-info (str error-type " is not a declared transform-test error type; see"
                         " metabase.transform-testing.errors/all.")
                    {:invalid-error-type error-type})))
  error-type)

(defmacro ex
  "Construct (not throw) a typed transform-test ExceptionInfo. `error-type` is assoc'd into `data`
  under `:error-type` and must be a member of [[all]] — a literal keyword is checked at
  macro-expansion time, so a typo fails the build; a computed one is checked at runtime."
  ([error-type msg data]
   `(ex ~error-type ~msg ~data nil))
  ([error-type msg data cause]
   (if (keyword? error-type)
     (do (checked error-type)
         `(ex-info ~msg (assoc ~data :error-type ~error-type) ~cause))
     `(ex-info ~msg (assoc ~data :error-type (checked ~error-type)) ~cause))))

(defn status-code
  "The HTTP status for `error-type`, or 500 for an untyped or unknown one."
  [error-type]
  (get error-types error-type 500))

(defn remap-message
  "`message` with every temp-table name in `temp->logical` replaced by the name the author wrote.

  Matching ignores case because Snowflake and H2 upper-case the generated names. A nil message
  stays nil."
  [message temp->logical]
  (when message
    (reduce (fn [^String msg [temp logical]]
              (.replaceAll msg (str "(?i)\\b" (java.util.regex.Pattern/quote temp) "\\b")
                           (java.util.regex.Matcher/quoteReplacement logical)))
            (str message)
            temp->logical)))
