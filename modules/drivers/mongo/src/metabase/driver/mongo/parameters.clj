(ns metabase.driver.mongo.parameters
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.time ZoneOffset)
   (java.time.temporal Temporal)
   (metabase.driver.common.parameters Date)))

(set! *warn-on-reflection* true)

(defn- ->utc-instant [t]
  (t/instant
   (condp instance? t
     java.time.LocalDate     (t/zoned-date-time t (t/local-time "00:00") (t/zone-id "UTC"))
     java.time.LocalDateTime (t/zoned-date-time t (t/zone-id "UTC"))
     t)))

(defn- param-value->str
  [{coercion :coercion-strategy, :as field} x]
  (cond
    ;; #30136: Provide a way of using dashboard filter as a variable.
    (and (sequential? x) (= (count x) 1))
    (recur field (first x))

    ;; sequences get converted to `$in`
    (sequential? x)
    (format "{$in: [%s]}" (str/join ", " (map (partial param-value->str field) x)))

    ;; Date = the Parameters Date type, not an java.util.Date or java.sql.Date type
    ;; convert to a `Temporal` instance and recur
    (instance? Date x)
    (recur field (u.date/parse (:s x)))

    (and (instance? Temporal x)
         (isa? coercion :Coercion/UNIXSeconds->DateTime))
    (long (/ (t/to-millis-from-epoch (->utc-instant x)) 1000))

    (and (instance? Temporal x)
         (isa? coercion :Coercion/UNIXMilliSeconds->DateTime))
    (t/to-millis-from-epoch (->utc-instant x))

    ;; convert temporal types to ISODate("2019-12-09T...") (etc.)
    (instance? Temporal x)
    (format "ISODate(\"%s\")" (u.date/format x))

    ;; for everything else, splice it in as its string representation
    :else
    (pr-str x)))

(mu/defn ^:private field->name
  ([field]
   (field->name field true))

  ([field :- ::lib.schema.metadata/column
    pr?]
   ;; for native parameters we serialize and don't need the extra pr
   (cond-> (mongo.qp/field->name field ".")
     pr? pr-str)))

(defn- substitute-one-field-filter-date-range [{field :field, {value :value} :value}]
  (let [{:keys [start end]} (params.dates/date-string->range value {:inclusive-end? false})
        start-condition     (when start
                              (format "{%s: {$gte: %s}}"
                                      (field->name field)
                                      (param-value->str field (u.date/parse start ZoneOffset/UTC))))
        end-condition       (when end
                              (format "{%s: {$lt: %s}}"
                                      (field->name field)
                                      (param-value->str field (u.date/parse end ZoneOffset/UTC))))]
    (if (and start-condition end-condition)
      (format "{$and: [%s, %s]}" start-condition end-condition)
      (or start-condition
          end-condition))))

;; Field filter value is either params/no-value (handled in `substitute-param`, a map with `:type` and `:value`, or a
;; sequence of those maps.
(defn- substitute-one-field-filter [{field :field, {param-type :type, value :value} :value, :as field-filter}]
  ;; convert relative dates to approprate date range representations
  (cond
    (params.dates/not-single-date-type? param-type)
    (substitute-one-field-filter-date-range field-filter)

    ;; a `date/single` like `2020-01-10`
    (and (params.dates/date-type? param-type)
         (string? value))
    (let [t (u.date/parse value)]
      (format "{$and: [%s, %s]}"
              (format "{%s: {$gte: %s}}" (field->name field) (param-value->str field t))
              (format "{%s: {$lt: %s}}"  (field->name field) (param-value->str field (u.date/add t :day 1)))))

    :else
    (format "{%s: %s}" (field->name field) (param-value->str field value))))

(mu/defn ^:private substitute-field-filter
  [{field :field, {:keys [value]} :value, :as field-filter} :- [:map
                                                                [:field ::lib.schema.metadata/column]
                                                                [:value [:map [:value :any]]]]]
  (if (sequential? value)
    (format "{%s: %s}" (field->name field) (param-value->str field value))
    (substitute-one-field-filter field-filter)))

(defn- substitute-native-query-snippet [[acc missing] v]
  (let [{:keys [content]} v]
    [(conj acc content) missing]))

(defn- substitute-param [param->value [acc missing] in-optional? {:keys [k], :as _param}]
  (let [v (get param->value k)]
    (cond
      (not (contains? param->value k))
      [acc (conj missing k)]

      (params/FieldFilter? v)
      (let [no-value? (= (:value v) params/no-value)]
        (cond
          (params.ops/operator? (get-in v [:value :type]))
          (let [param (:value v)
                compiled-clause (-> (assoc param
                                           :target
                                           [:template-tag
                                            [:field (field->name (:field v) false)
                                             {:base-type (get-in v [:field :base-type])}]])
                                    params.ops/to-clause
                                    ;; desugar only impacts :does-not-contain -> [:not [:contains ... but it prevents
                                    ;; an optimization of [:= 'field 1 2 3] -> [:in 'field [1 2 3]] since that
                                    ;; desugars to [:or [:= 'field 1] ...].
                                    mbql.u/desugar-filter-clause
                                    qp.wrap-value-literals/wrap-value-literals-in-mbql
                                    mongo.qp/compile-filter
                                    json/generate-string)]
            [(conj acc compiled-clause) missing])
          ;; no-value field filters inside optional clauses are ignored and omitted entirely
          (and no-value? in-optional?) [acc (conj missing k)]
          ;; otherwise replace it with a {} which is the $match equivalent of 1 = 1, i.e. always true
          no-value?                    [(conj acc "{}") missing]
          :else                        [(conj acc (substitute-field-filter v))
                                        missing]))

      (params/ReferencedQuerySnippet? v)
      (substitute-native-query-snippet [acc missing] v)

      (params/ReferencedCardQuery? v)
      (throw (ex-info (tru "Cannot run query: MongoDB doesn''t support saved questions reference: {0}" k)
                      {:type qp.error-type/invalid-query}))

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
                {:type qp.error-type/driver}))))
   [[] nil]
   xs))

(defn- substitute [param->value xs]
  (let [[replaced missing] (substitute* param->value xs false)]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run query: missing required parameters: {0}" (set missing))
               {:type qp.error-type/invalid-query})))
    (when (seq replaced)
      (str/join replaced))))

(defn- parse-and-substitute [param->value x]
  (if-not (string? x)
    x
    (u/prog1 (substitute param->value (params.parse/parse x false))
      (when-not (= x <>)
        (log/debugf "Substituted %s -> %s" (pr-str x) (pr-str <>))))))

(defn substitute-native-parameters
  "Implementation of [[metabase.driver/substitute-native-parameters]] for MongoDB."
  [_driver inner-query]
  (let [param->value (params.values/query->params-map inner-query)]
    (update inner-query :query (partial walk/postwalk (partial parse-and-substitute param->value)))))
