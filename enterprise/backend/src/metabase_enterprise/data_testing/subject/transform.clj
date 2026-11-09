(ns metabase-enterprise.data-testing.subject.transform
  "The `:transform` subject: a saved query transform, whose output expectations name by its target table."
  (:require
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.validator :as data-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defmethod data-testing.subject/subject-plan :transform :- ::data-testing.subject/subject-plan
  [_subject-type
   transform :- ::transforms.schema/transform]
  (when-not (transforms-base.u/query-transform? transform)
    (throw (data-testing.errors/ex
            ::data-testing.errors/unsupported-transform
            (tru "Only query transforms can be tested.")
            {})))
  (let [database               (data-testing.subject/testable-database
                                (transforms-base.u/transform-source-database transform))
        target                 (select-keys (:target transform) [:schema :name])
        {:keys [query params]} (transforms-base.u/compile-source transform nil)]
    {:database      database
     :compiled      {:query query :params params}
     :output-tables [target]
     :output-token  nil
     :output-label  (data-testing.validator/table-label target)}))
