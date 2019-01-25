(ns metabase.query-processor.middleware.check-features
  (:require [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.mbql.util :as mbql.u]
            [metabase.util.i18n :refer [tru]]))

;; `assert-driver-supports` doesn't run check when `*driver*` is unbound (e.g., when used in the REPL)
;; Allows flexibility when composing queries for tests or interactive development
(defn assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when driver/*driver*
    (when-not (driver/supports? driver/*driver* feature)
      (throw (Exception. (str (tru "{0} is not supported by this driver." (name feature))))))))

;; TODO - definitely a little incomplete. It would be cool if we cool look at the metadata in the schema namespace and
;; auto-generate this logic
(defn- query->required-features [query]
  (mbql.u/match (:query query)
    [:stddev _] :standard-deviation-aggregations
    [:fk-> _ _] :foreign-keys))

(defn- check-features* [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (u/prog1 query
      (doseq [required-feature (query->required-features query)]
        (assert-driver-supports required-feature)))))

(defn check-features
  "Middleware that checks that drivers support the `:features` required to use certain clauses, like `:stddev`."
  [qp]
  (comp qp check-features*))
