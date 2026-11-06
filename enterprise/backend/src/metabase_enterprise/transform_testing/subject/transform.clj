(ns metabase-enterprise.transform-testing.subject.transform
  "The `:transform` subject: a query transform, whose output expectations name by its target table."
  (:require
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.subject :as transform-testing.subject]
   [metabase-enterprise.transform-testing.validator :as transform-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defmethod transform-testing.subject/subject-plan :transform :- ::transform-testing.subject/subject-plan
  [_subject-type
   transform :- ::transforms.schema/transform.definition]
  (when-not (transforms-base.u/query-transform? transform)
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/unsupported-transform
            (tru "Only query transforms can be tested.")
            {})))
  (let [database               (transform-testing.subject/testable-database
                                (transforms-base.u/transform-source-database transform))
        target                 (select-keys (:target transform) [:schema :name])
        {:keys [query params]} (transforms-base.u/compile-source transform nil)]
    {:database      database
     :compiled      {:query query :params params}
     :output-tables [target]
     :output-token  nil
     :output-label  (transform-testing.validator/table-label target)}))
