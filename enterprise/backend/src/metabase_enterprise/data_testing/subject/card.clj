(ns metabase-enterprise.data-testing.subject.card
  "The `:card` subject: a question, model or metric, whose result set expectation SQL names as `{{output}}`."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase.lib.core :as lib]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

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
   {query :dataset_query card-name :name} :- ::data-testing.subject/card
   _inputs]
  ;; The database first: a database that cannot run tests is refused before the query compiles.
  (let [database (data-testing.subject/testable-database (lib/database-id query))]
    (data-testing.subject/query-output-plan
     database
     (data-testing.subject/compile-query
      query
      (fn [e]
        ;; A test has no way to give a parameter a value.
        (if-let [tag-names (seq (parameters-needing-a-value e))]
          (tru "This card''s query has a parameter that needs a value and has no default: {0}. Card tests cannot set parameter values."
               (str/join ", " tag-names))
          (data-testing.subject/compile-failure-message e))))
     card-name)))
