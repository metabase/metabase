(ns metabase.driver.mongo.parameters
  (:refer-clojure :exclude [get-in])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.parameters.operators :as params.ops]
   [metabase.query-processor.parameters.values :as params.values]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf :refer [get-in]])
  (:import
   (java.time ZoneOffset)
   (java.time.temporal Temporal)))

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
    (lib/parsed-date-param? x)
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

(mu/defn- field->name
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   field                 :- driver-api/schema.metadata.column
   column-alias          :- [:maybe :string]]
  (let [name (if (str/blank? column-alias)
               (mongo.qp/field->name metadata-providerable field ".")
               column-alias)]
    (pr-str name)))

(mu/defn- substitute-one-field-filter-date-range
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {field :field, alias :alias, {value :value} :value}]
  (let [{:keys [start end]} (params.dates/date-string->range value {:inclusive-end? false})
        start-condition     (when start
                              (format "{%s: {$gte: %s}}"
                                      (field->name metadata-providerable field alias)
                                      (param-value->str field (u.date/parse start ZoneOffset/UTC))))
        end-condition       (when end
                              (format "{%s: {$lt: %s}}"
                                      (field->name metadata-providerable field alias)
                                      (param-value->str field (u.date/parse end ZoneOffset/UTC))))]
    (if (and start-condition end-condition)
      (format "{$and: [%s, %s]}" start-condition end-condition)
      (or start-condition
          end-condition))))

;; Field filter value is either lib/parsed-param-no-value-placeholder (handled in `substitute-param`, a map with `:type` and `:value`, or a
;; sequence of those maps.
(mu/defn- substitute-one-field-filter
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [field alias], {param-type :type, value :value} :value, :as field-filter} :- :metabase.lib.parameters.parse.types/field-filter]
  ;; convert relative dates to appropriate date range representations
  (cond
    (params.dates/not-single-date-type? param-type)
    (substitute-one-field-filter-date-range metadata-providerable field-filter)

    ;; a `date/single` like `2020-01-10`
    (and (params.dates/date-type? param-type)
         (string? value))
    (let [t (u.date/parse value)]
      (format "{$and: [%s, %s]}"
              (format "{%s: {$gte: %s}}" (field->name metadata-providerable field alias) (param-value->str field t))
              (format "{%s: {$lt: %s}}"  (field->name metadata-providerable field alias) (param-value->str field (u.date/add t :day 1)))))

    :else
    (format "{%s: %s}" (field->name metadata-providerable field alias) (param-value->str field value))))

(mu/defn- substitute-field-filter
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {field :field, alias :alias, {:keys [value]} :value, :as field-filter} :- :metabase.lib.parameters.parse.types/field-filter]
  (if (sequential? value)
    (format "{%s: %s}" (field->name metadata-providerable field alias) (param-value->str field value))
    (substitute-one-field-filter metadata-providerable field-filter)))

(mu/defn- substitute-native-query-snippet
  [[acc missing]
   {:keys [content]} :- :metabase.lib.parameters.parse.types/referenced-query-snippet]
  [(conj acc content) missing])

(mu/defn- substitute-param
  [query        :- ::lib.schema/query
   stage-number :- :int
   param->value
   [acc missing]
   in-optional?
   {:keys [k], :as _param} :- :metabase.lib.parameters.parse.types/param]
  (let [v (get param->value k)]
    (cond
      (not (contains? param->value k))
      [acc (conj missing k)]

      (lib/parsed-field-filter-param? v)
      (let [no-value? (= (:value v) lib/parsed-param-no-value-placeholder)]
        (cond
          (params.ops/operator? (get-in v [:value :type]))
          (let [param (:value v)
                field-name (if (str/blank? (:alias v))
                             (mongo.qp/field->name query (:field v) ".")
                             (:alias v))
                compiled-clause (-> (assoc param
                                           :target
                                           [:dimension
                                            [:field field-name
                                             {:base-type (get-in v [:field :base-type])}]])
                                    params.ops/to-clause
                                    ;; desugar only impacts
                                    ;;
                                    ;;    :does-not-contain -> [:not [:contains ...]]
                                    ;;
                                    ;; but it prevents an optimization of
                                    ;;
                                    ;;    [:= <field> 1 2 3] -> [:in <field> [1 2 3]]
                                    ;;
                                    ;; since that desugars to
                                    ;;
                                    ;;    [:or [:= <field> 1] ...].
                                    lib/desugar-filter-clause
                                    driver-api/wrap-value-literals-in-mbql5
                                    (->> (mongo.qp/compile-filter query stage-number))
                                    json/encode)]
            [(conj acc compiled-clause) missing])
          ;; no-value field filters inside optional clauses are ignored and omitted entirely
          (and no-value? in-optional?) [acc (conj missing k)]
          ;; otherwise replace it with a {} which is the $match equivalent of 1 = 1, i.e. always true
          no-value?                    [(conj acc "{}") missing]
          :else                        [(conj acc (substitute-field-filter query v))
                                        missing]))

      (lib/parsed-referenced-query-snippet-param? v)
      (substitute-native-query-snippet [acc missing] v)

      (lib/parsed-referenced-card-query-param? v)
      (throw (ex-info (tru "Cannot run query: MongoDB doesn''t support saved questions reference: {0}" k)
                      {:type driver-api/qp.error-type.invalid-query}))

      (= v lib/parsed-param-no-value-placeholder)
      [acc (conj missing k)]

      :else
      [(conj acc (param-value->str nil v)) missing])))

(declare substitute*)

(mu/defn- substitute-optional
  [query        :- ::lib.schema/query
   stage-number :- :int
   param->value
   [acc missing]
   {subclauses :args} :- :metabase.lib.parameters.parse.types/optional]
  (let [[opt-acc opt-missing] (substitute* query stage-number param->value subclauses true)]
    (if (seq opt-missing)
      [acc missing]
      [(into acc opt-acc) missing])))

(mu/defn- substitute*
  "Returns a sequence of `[[replaced...] missing-parameters]`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   param->value
   xs
   in-optional?]
  (reduce
   (fn [[acc missing] x]
     (cond
       (string? x)
       [(conj acc x) missing]

       (lib/parsed-param? x)
       (substitute-param query stage-number param->value [acc missing] in-optional? x)

       (lib/parsed-optional-param? x)
       (substitute-optional query stage-number param->value [acc missing] x)

       :else
       (throw (ex-info (tru "Don''t know how to substitute {0} {1}" (.getName (class x)) (pr-str x))
                       {:type driver-api/qp.error-type.driver}))))
   [[] nil]
   xs))

(mu/defn- substitute
  [query        :- ::lib.schema/query
   stage-number :- :int
   param->value :- [:maybe [:map-of :string :any]]
   xs]
  (let [[replaced missing] (substitute* query stage-number param->value xs false)]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run query: missing required parameters: {0}" (set missing))
                      {:type driver-api/qp.error-type.invalid-query})))
    (when (seq replaced)
      (str/join replaced))))

(mu/defn- parse-and-substitute
  [query        :- ::lib.schema/query
   stage-number :- :int
   param->value
   x]
  (if-not (string? x)
    x
    (u/prog1 (substitute query stage-number param->value (lib/parse-parameters x false))
      (when-not (= x <>)
        (log/debugf "Substituted %s -> %s" (pr-str x) (pr-str <>))))))

(mu/defn substitute-native-parameters :- ::lib.schema/query
  "Implementation of [[metabase.driver/substitute-native-parameters]] for MongoDB."
  [_driver      :- :keyword
   query        :- ::lib.schema/query
   stage-number :- :int]
  (let [param->value (params.values/stage->params-map query (lib/query-stage query stage-number))
        update-stage (fn [native-stage]
                       (perf/postwalk (partial parse-and-substitute query stage-number param->value)
                                      native-stage))]
    (lib/update-query-stage query stage-number update :native update-stage)))
