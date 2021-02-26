(ns metabase.query-processor.middleware.validate-temporal-bucketing
  (:require [clojure.set :as set]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]))

(def ^:private valid-date-units
  #{:default :day :day-of-week :day-of-month :day-of-year
    :week :week-of-year :month :month-of-year :quarter :quarter-of-year :year})

(def ^:private valid-time-units
  #{:default :millisecond :second :minute :minute-of-hour :hour :hour-of-day})

(def ^:private valid-datetime-units (set/union valid-date-units valid-time-units))

;; TODO -- this should be changed to `:effective-type` once we finish the metadata changes.
(defmulti ^:private valid-units-for-base-type
  {:arglists '([base-type])}
  keyword)

;; for stuff like UNIX timestamps -- skip validation for now. (UNIX timestamp should be bucketable with any unit
;; anyway). Once `:effective-type` is in place, we can actually check those Fields here.
(defmethod valid-units-for-base-type :type/*        [_] valid-datetime-units)
(defmethod valid-units-for-base-type :type/Date     [_] valid-date-units)
(defmethod valid-units-for-base-type :type/Time     [_] valid-time-units)
(defmethod valid-units-for-base-type :type/DateTime [_] valid-datetime-units)

(defn- validate-temporal-bucketing* [query]
  (doseq [[_ id-or-name {:keys [temporal-unit base-type]} :as clause] (mbql.u/match query [:field _ (_ :guard :temporal-unit)])]
    (let [base-type (if (integer? id-or-name)
                      (:base_type (qp.store/field id-or-name))
                      base-type)
          valid-units (valid-units-for-base-type base-type)]
      (when-not (valid-units temporal-unit)
        (throw (ex-info (tru "Unsupported temporal bucketing: You can''t bucket a {0} Field by {1}."
                             base-type temporal-unit)
                        {:type        qp.error-type/invalid-query
                         :field       clause
                         :base-type   base-type
                         :unit        temporal-unit
                         :valid-units valid-units}))))))

(defn validate-temporal-bucketing
  "Make sure temporal bucketing of Fields (i.e., `:datetime-field` clauses) in this query is valid given the combination
  of Field base-type and unit. For example, you should not be allowed to bucket a `:type/Date` Field by `:minute`."
  [qp]
  (fn [query rff context]
    (validate-temporal-bucketing* query)
    (qp query rff context)))
