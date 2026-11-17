(ns metabase-enterprise.data-testing.subject.card
  "The `:card` subject: a question, model or metric, whose result set expectation SQL names as `{{output}}`."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase.lib.core :as lib]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private output-token
  "{{output}}")

(defn- parameters-needing-a-value
  "The names, sorted, of the parameters that the compile failure `e` says need a value. Empty when the failure has
  another cause."
  [e]
  (when (qp.error-type/missing-required-parameter? e)
    (->> (u/full-exception-chain e)
         (map ex-data)
         ;; Only the errors of that type name a parameter without a value: a wrapper names the card tag that includes
         ;; the failing card, and `:tags` lists every tag of the query.
         (filter #(= qp.error-type/missing-required-parameter (:type %)))
         (mapcat (fn [{:keys [tag missing]}]
                   (cons (:name tag) missing)))
         (remove nil?)
         distinct
         sort)))

(mu/defmethod data-testing.subject/subject-plan :card :- ::data-testing.subject/subject-plan
  [_subject-type
   {query :dataset_query card-name :name} :- ::data-testing.subject/card]
  (let [database (data-testing.subject/testable-database (lib/database-id query))
        {sql :query params :params}
        (try
          ;; The same preparation a transform's query gets: remaps would add joins to tables the test does
          ;; not declare, and the default row limit would cut the result set. A persisted model in the query
          ;; stays its query: its cache table is not a table the test can declare, and the test is of the query.
          (model-persistence/with-persisted-substituion-disabled
            (qp.compile/compile (transforms-base.u/massage-sql-query query)))
          (catch Exception e
            (throw (data-testing.errors/ex
                    ::data-testing.errors/uncompilable-subject
                    ;; A test has no way to give a parameter a value.
                    (if-let [tag-names (seq (parameters-needing-a-value e))]
                      (tru "This card''s query has a parameter that needs a value and has no default: {0}. Card tests cannot set parameter values."
                           (str/join ", " tag-names))
                      (tru "The query under test could not be compiled to SQL: {0}" (ex-message e)))
                    {}
                    e))))]
    {:database      database
     :compiled      {:query sql :params params}
     ;; A card has no table of its own, so expectation SQL names its result by the token, which
     ;; [[data-testing.compile/replace-tables]] turns into this reserved name.
     :output-tables [{:schema nil :name data-testing.compile/output-name}]
     :output-token  output-token
     :output-label  card-name}))
