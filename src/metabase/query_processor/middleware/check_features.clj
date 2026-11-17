(ns metabase.query-processor.middleware.check-features
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- assert-driver-supports
  "Assert that the driver/database supports keyword `feature`."
  [metadata-providerable feature]
  (let [database (lib.metadata/database metadata-providerable)]
    (when-not (driver.u/supports? driver/*driver* feature database)
      (throw (ex-info (tru "{0} is not supported by {1} driver." (name feature) (name driver/*driver*))
                      {:type    qp.error-type/unsupported-feature
                       :feature feature
                       :driver  driver/*driver*})))))

;; TODO - definitely a little incomplete. It would be cool if we cool look at the metadata in the schema namespace and
;; auto-generate this logic
(mu/defn- query->required-features
  [query :- ::lib.schema/query]
  (let [required-features (volatile! (transient #{}))]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (when (lib/clause-of-type? clause :stddev)
         (vswap! required-features conj! :standard-deviation-aggregations))
       nil))
    (lib.walk/walk
     query
     (fn [_query path-type _path join]
       (when (= path-type :lib.walk/join)
         (vswap! required-features conj! (:strategy join)))
       nil))
    (persistent! @required-features)))

(defn check-features
  "Middleware that checks that drivers support the `:features` required to use certain clauses, like `:stddev`."
  [query]
  (u/prog1 query
    (doseq [required-feature (query->required-features query)]
      (assert-driver-supports query required-feature))))
