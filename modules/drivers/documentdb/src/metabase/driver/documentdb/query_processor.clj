(ns metabase.driver.documentdb.query-processor
  "MBQL compilation for DocumentDB aggregation pipelines."
  (:refer-clojure :exclude [mapv some])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver-api.core :as driver-api]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [mapv some]]))

(set! *warn-on-reflection* true)

(defn- field-path
  [query field]
  (let [{:keys [nfc-path parent-id], field-name :name} field]
    (cond
      (seq nfc-path) nfc-path
      parent-id (conj (field-path query (driver-api/field query parent-id)) field-name)
      :else [field-name])))

(defn- field-metadata
  [query [_tag _opts id-or-name :as field-ref]]
  (if (pos-int? id-or-name)
    (driver-api/field query id-or-name)
    (let [opts (lib/options field-ref)]
      {:name (or (driver-api/qp.add.source-alias opts) (name id-or-name))})))

(defn- field-name
  [query field-ref]
  (str/join \. (field-path query (field-metadata query field-ref))))

(defn- output-name
  [query [_tag opts id-or-name :as field-ref]]
  (or (driver-api/qp.add.desired-alias opts)
      (:name opts)
      (if (pos-int? id-or-name)
        (field-name query field-ref)
        (name id-or-name))))

(declare expression)

(defn- temporal-value
  [value]
  (cond
    (t/instant? value) value
    (t/local-date? value) (t/instant (t/zoned-date-time value (t/local-time "00:00") (t/zone-id "UTC")))
    (t/local-date-time? value) (t/instant value (t/zone-id "UTC"))
    (t/zoned-date-time? value) (t/instant value)
    (t/offset-date-time? value) (t/instant value)
    :else value))

(defn- date-trunc
  [field-ref value]
  (let [unit (:temporal-unit (lib/options field-ref))]
    (if (and unit (not= unit :default))
      {"$dateTrunc" {:date value
                     :unit (name unit)
                     :timezone (driver-api/results-timezone-id)
                     :startOfWeek (name (driver-api/start-of-week))}}
      value)))

(defn- expression
  [query clause]
  (if-not (vector? clause)
    (temporal-value clause)
    (let [[tag _opts & args] clause]
      (case tag
        :field (date-trunc clause (str "$" (field-name query clause)))
        :metadata/column (str "$" (str/join \. (field-path query (second clause))))
        :value (temporal-value (first args))
        :absolute-datetime (temporal-value (first args))
        :time (temporal-value (first args))
        :+ {"$add" (mapv (partial expression query) args)}
        :- {"$subtract" (mapv (partial expression query) args)}
        :* {"$multiply" (mapv (partial expression query) args)}
        :/ {"$divide" (mapv (partial expression query) args)}
        :coalesce {"$ifNull" (mapv (partial expression query) args)}
        :lower {"$toLower" (expression query (first args))}
        :upper {"$toUpper" (expression query (first args))}
        :trim {"$trim" {:input (expression query (first args))}}
        (throw (ex-info (tru "DocumentDB does not support expression {0}." tag)
                        {:type driver-api/qp.error-type.unsupported-feature
                         :clause clause}))))))

(defn- comparison
  [query operator field value]
  (let [field-value (expression query field)
        value-value (expression query value)]
    (if (and (string? field-value) (str/starts-with? field-value "$"))
      {(subs field-value 1) (if (= operator "$eq") value-value {operator value-value})}
      {"$expr" {operator [field-value value-value]}})))

(declare filter-clause)

(defn- string-filter
  [query field value prefix suffix case-sensitive?]
  (let [value (expression query value)]
    (when-not (string? value)
      (throw (ex-info (tru "DocumentDB string filters require a literal string.")
                      {:type driver-api/qp.error-type.unsupported-feature})))
    {(field-name query field)
     {"$regex" (str prefix (java.util.regex.Pattern/quote value) suffix)
      "$options" (if case-sensitive? "" "i")}}))

(defn- filter-clause
  [query [tag opts & args :as clause]]
  (case tag
    := (apply comparison query "$eq" args)
    :!= (apply comparison query "$ne" args)
    :< (apply comparison query "$lt" args)
    :<= (apply comparison query "$lte" args)
    :> (apply comparison query "$gt" args)
    :>= (apply comparison query "$gte" args)
    :between (let [[field lower upper] args]
               {"$and" [(comparison query "$gte" field lower)
                        (comparison query "$lte" field upper)]})
    :and {"$and" (mapv (partial filter-clause query) args)}
    :or {"$or" (mapv (partial filter-clause query) args)}
    :not {"$nor" [(filter-clause query (first args))]}
    :is-null (comparison query "$eq" (first args) nil)
    :not-null (comparison query "$ne" (first args) nil)
    :contains (apply string-filter query (concat args ["" "" (get opts :case-sensitive true)]))
    :starts-with (apply string-filter query (concat args ["^" "" (get opts :case-sensitive true)]))
    :ends-with (apply string-filter query (concat args ["" "$" (get opts :case-sensitive true)]))
    (throw (ex-info (tru "DocumentDB does not support filter {0}." tag)
                    {:type driver-api/qp.error-type.unsupported-feature
                     :clause clause}))))

(defn- aggregation
  [query stage-number clause]
  (let [[tag _opts & args] clause]
    (case tag
      :count {"$sum" 1}
      :sum {"$sum" (expression query (first args))}
      :avg {"$avg" (expression query (first args))}
      :min {"$min" (expression query (first args))}
      :max {"$max" (expression query (first args))}
      :distinct {"$addToSet" (expression query (first args))}
      (throw (ex-info (tru "DocumentDB does not support aggregation {0}." tag)
                      {:type driver-api/qp.error-type.unsupported-feature
                       :clause clause
                       :stage-number stage-number})))))

(defn- assoc-field-path
  [m dotted-name value]
  (assoc-in m (str/split dotted-name #"\.") value))

(defn- breakout-group
  [query breakouts]
  (reduce (fn [group field-ref]
            (assoc-field-path group (output-name query field-ref) (expression query field-ref)))
          {}
          breakouts))

(defn- aggregation-stages
  [query stage-number breakouts aggregations]
  (let [group-id    (when (seq breakouts) (breakout-group query breakouts))
        group-stage (reduce (fn [group clause]
                              (assoc group
                                     (driver-api/mbql-5-aggregation-name query stage-number clause)
                                     (aggregation query stage-number clause)))
                            {"_id" group-id}
                            aggregations)
        project     (reduce (fn [projection field-ref]
                              (let [alias (output-name query field-ref)]
                                (assoc projection alias (str "$_id." alias))))
                            {"_id" false}
                            breakouts)
        project     (reduce (fn [projection clause]
                              (let [alias (driver-api/mbql-5-aggregation-name query stage-number clause)]
                                (assoc projection alias
                                       (if (= :distinct (first clause)) {"$size" (str "$" alias)} true))))
                            project
                            aggregations)]
    [{"$group" group-stage}
     {"$project" project}]))

(defn- projection-stage
  [query fields]
  (when (seq fields)
    {"$project" (reduce (fn [projection field-ref]
                          (assoc projection (output-name query field-ref) (expression query field-ref)))
                        {"_id" false}
                        fields)}))

(defn- sort-stage
  [query stage-number order-bys aggregations?]
  (when (seq order-bys)
    {"$sort" (into {}
                   (map (fn [[direction _opts clause]]
                          [(if (= :aggregation (first clause))
                             (driver-api/mbql-5-aggregation-name query stage-number clause)
                             (if aggregations?
                               (output-name query clause)
                               (field-name query clause)))
                           (case direction :asc 1 :desc -1)]))
                   order-bys)}))

(defn- stage-pipeline
  [query stage-number]
  (let [filters      (lib/filters query stage-number)
        breakouts    (lib/breakouts query stage-number)
        aggregations (lib/aggregations query stage-number)
        fields       (lib/fields query stage-number)
        order-bys    (lib/order-bys query stage-number)
        limit        (lib/current-limit query stage-number)
        page         (lib/current-page query stage-number)]
    (cond-> []
      (seq filters) (conj {"$match" (if (= 1 (count filters))
                                      (filter-clause query (first filters))
                                      {"$and" (mapv (partial filter-clause query) filters)})})
      (or (seq breakouts) (seq aggregations)) (into (aggregation-stages query stage-number breakouts aggregations))
      (seq fields) (conj (projection-stage query fields))
      (seq order-bys) (conj (sort-stage query stage-number order-bys (boolean (or (seq breakouts) (seq aggregations)))))
      limit (conj {"$limit" limit})
      page (into (let [offset (* (:items page) (dec (:page page)))]
                   (cond-> []
                     (pos? offset) (conj {"$skip" offset})
                     true (conj {"$limit" (:items page)})))))))

(defn- collection-name
  [query]
  (if-let [table-id (lib/primary-source-table-id query)]
    (:name (driver-api/table query table-id))
    (some #(:collection (lib/query-stage query %))
          (range (lib/stage-count query)))))

(defn- stage-projections
  [query stage-number]
  (let [fields       (lib/fields query stage-number)
        breakouts    (lib/breakouts query stage-number)
        aggregations (lib/aggregations query stage-number)]
    (cond
      (or (seq breakouts) (seq aggregations))
      (into (mapv (partial output-name query) breakouts)
            (map #(driver-api/mbql-5-aggregation-name query stage-number %))
            aggregations)

      (seq fields)
      (mapv (partial output-name query) fields))))

(defn mbql->native
  "Compiles an MBQL query to a DocumentDB aggregation pipeline and collection name."
  [query]
  (let [query      (driver-api/add-alias-info query)
        collection (collection-name query)
        stage-numbers (range (lib/stage-count query))]
    (when-not collection
      (throw (ex-info (tru "A collection is required for a DocumentDB query.")
                      {:type driver-api/qp.error-type.invalid-query})))
    {:collection collection
     :query (into [] (mapcat (partial stage-pipeline query)) stage-numbers)
     :projections (or (some #(stage-projections query %) (reverse stage-numbers)) [])
     :mbql? true}))
