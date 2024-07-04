(ns metabase.query-processor.middleware.check-features
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defn assert-driver-supports
  "Assert that the driver/database supports keyword `feature`."
  [feature]
  (when-not (driver.u/supports? driver/*driver* feature (lib.metadata/database (qp.store/metadata-provider)))
    (throw (ex-info (tru "{0} is not supported by this driver." (name feature))
                    {:type    qp.error-type/unsupported-feature
                     :feature feature}))))

;; TODO - definitely a little incomplete. It would be cool if we cool look at the metadata in the schema namespace and
;; auto-generate this logic
(defn- query->required-features [query]
  (into
   #{}
   (mbql.u/match (:query query)
     :stddev
     :standard-deviation-aggregations

     (join :guard (every-pred map? (comp mbql.s/join-strategies :strategy)))
     (let [{:keys [strategy]} join]
       (assert-driver-supports strategy)))))

(defn check-features
  "Middleware that checks that drivers support the `:features` required to use certain clauses, like `:stddev`."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (u/prog1 query
      (doseq [required-feature (query->required-features query)]
        (assert-driver-supports required-feature)))))
