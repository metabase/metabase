(ns metabase.driver.mongo.parameters
  (:require [clojure
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver.common.parameters :as params]
            [metabase.driver.common.parameters
             [dates :as date-params]
             [parse :as parse]
             [values :as values]]
            [metabase.driver.mongo.query-processor :as mongo.qp]
            [metabase.query-processor
             [error-type :as error-type]
             [store :as qp.store]]
            [metabase.util :as u]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]])
  (:import java.time.temporal.Temporal
           [metabase.driver.common.parameters CommaSeparatedNumbers Date]))

(defn- ->utc-instant [t]
  (t/instant
   (condp instance? t
     java.time.LocalDate     (t/zoned-date-time t (t/local-time "00:00") (t/zone-id "UTC"))
     java.time.LocalDateTime (t/zoned-date-time t (t/zone-id "UTC"))
     t)))

(defn- param-value->str
  [{special-type :special_type, :as field} x]
  (cond
    ;; sequences get converted to `$in`
    (sequential? x)
    (format "{$in: [%s]}" (str/join ", " (map (partial param-value->str field) x)))

    ;; Date = the Parameters Date type, not an java.util.Date or java.sql.Date type
    ;; convert to a `Temporal` instance and recur
    (instance? Date x)
    (param-value->str field (u.date/parse (:s x)))

    (and (instance? Temporal x)
         (isa? special-type :type/UNIXTimestampSeconds))
    (long (/ (t/to-millis-from-epoch (->utc-instant x)) 1000))

    (and (instance? Temporal x)
         (isa? special-type :type/UNIXTimestampMilliseconds))
    (t/to-millis-from-epoch (->utc-instant x))

    ;; convert temporal types to ISODate("2019-12-09T...") (etc.)
    (instance? Temporal x)
    (format "ISODate(\"%s\")" (u.date/format x))

    ;; there's a special record type for sequences of numbers; pull the sequence it wraps out and recur
    (instance? CommaSeparatedNumbers x)
    (param-value->str field (:numbers x))

    ;; for everything else, splice it in as its string representation
    :else
    (pr-str x)))

(defn- field->name [field]
  ;; store parent Field(s) if needed, since `mongo.qp/field->name` attempts to look them up using the QP store
  (letfn [(store-parent-field! [{parent-id :parent_id}]
            (when parent-id
              (qp.store/fetch-and-store-fields! #{parent-id})
              (store-parent-field! (qp.store/field parent-id))))]
    (store-parent-field! field))
  (pr-str (mongo.qp/field->name field ".")))

(defn- substitute-one-field-filter-date-range [{field :field, {param-type :type, value :value} :value}]
  (let [{:keys [start end]} (date-params/date-string->range value {:inclusive-end? false})
        start-condition     (when start
                              (format "{%s: {$gte: %s}}" (field->name field) (param-value->str field (u.date/parse start))))
        end-condition       (when end
                              (format "{%s: {$lt: %s}}" (field->name field) (param-value->str field (u.date/parse end))))]
    (if (and start-condition end-condition)
      (format "{$and: [%s, %s]}" start-condition end-condition)
      (or start-condition
          end-condition))))

;; Field filter value is either params/no-value (handled in `substitute-param`, a map with `:type` and `:value`, or a
;; sequence of those maps.
(defn- substitute-one-field-filter [{field :field, {param-type :type, value :value} :value, :as field-filter}]
  ;; convert relative dates to approprate date range representations
  (cond
    (date-params/date-range-type? param-type)
    (substitute-one-field-filter-date-range field-filter)

    ;; a `date/single` like `2020-01-10`
    (and (date-params/date-type? param-type)
         (string? value))
    (let [t (u.date/parse value)]
      (format "{$and: [%s, %s]}"
              (format "{%s: {$gte: %s}}" (field->name field) (param-value->str field t))
              (format "{%s: {$lt: %s}}"  (field->name field) (param-value->str field (u.date/add t :day 1)))))

    :else
    (format "{%s: %s}" (field->name field) (param-value->str field value))))

(defn- substitute-field-filter [{field :field, {:keys [value]} :value, :as field-filter}]
  (if (sequential? value)
    (format "{%s: %s}" (field->name field) (param-value->str field value))
    (substitute-one-field-filter field-filter)))

(defn- substitute-param [param->value [acc missing] in-optional? {:keys [k], :as param}]
  (let [v (get param->value k)]
    (cond
      (not (contains? param->value k))
      [acc (conj missing k)]

      (params/FieldFilter? v)
      (let [no-value? (= (:value v) params/no-value)]
        (cond
          ;; no-value field filters inside optional clauses are ignored and omitted entirely
          (and no-value? in-optional?) [acc (conj missing k)]
          ;; otherwise replace it with a {} which is the $match equivalent of 1 = 1, i.e. always true
          no-value?                    [(conj acc "{}") missing]
          :else                        [(conj acc (substitute-field-filter v))
                                        missing]))

      (= v params/no-value)
      [acc (conj missing k)]

      :else
      [(conj acc (param-value->str nil v)) missing])))

(declare substitute*)

(defn- substitute-optional [param->value [acc missing] {subclauses :args}]
  (let [[opt-acc opt-missing] (substitute* param->value subclauses true)]
    (if (seq opt-missing)
      [acc missing]
      [(into acc opt-acc) missing])))

(defn- substitute*
  "Returns a sequence of `[[replaced...] missing-parameters]`."
  [param->value xs in-optional?]
  (reduce
   (fn [[acc missing] x]
     (cond
       (string? x)
       [(conj acc x) missing]

       (params/Param? x)
       (substitute-param param->value [acc missing] in-optional? x)

       (params/Optional? x)
       (substitute-optional param->value [acc missing] x)

       :else
       (throw (ex-info (tru "Don''t know how to substitute {0} {1}" (.getName (class x)) (pr-str x))
                {:type error-type/driver}))))
   [[] nil]
   xs))

(defn- substitute [param->value xs]
  (let [[replaced missing] (substitute* param->value xs false)]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run query: missing required parameters: {0}" (set missing))
               {:type error-type/invalid-query})))
    (when (seq replaced)
      (str/join replaced))))

(defn- parse-and-substitute [param->value x]
  (if-not (string? x)
    x
    (u/prog1 (substitute param->value (parse/parse x))
      (when-not (= x <>)
        (log/debug (tru "Substituted {0} -> {1}" (pr-str x) (pr-str <>)))))))

(defn substitute-native-parameters
  "Implementation of `driver/substitute-native-parameters` for MongoDB."
  [driver inner-query]
  (let [param->value (values/query->params-map inner-query)]
    (update inner-query :query (partial walk/postwalk (partial parse-and-substitute param->value)))))
