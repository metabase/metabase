(ns metabase-enterprise.data-testing.subject.card
  "The `:card` subject: a question, model or metric, whose result set expectation SQL names as `{{output}}`."
  (:require
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase.lib.core :as lib]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private output-token
  "{{output}}")

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
                    (tru "The query under test could not be compiled to SQL: {0}" (ex-message e))
                    {}
                    e))))]
    {:database      database
     :compiled      {:query sql :params params}
     ;; A card has no table of its own, so expectation SQL names its result by the token, which
     ;; [[data-testing.compile/replace-tables]] turns into this reserved name.
     :output-tables [{:schema nil :name data-testing.compile/output-name}]
     :output-token  output-token
     :output-label  card-name}))
