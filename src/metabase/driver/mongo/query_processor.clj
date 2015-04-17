(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require [clojure.core.match :refer [match]]
            [colorize.core :as color]
            (monger [collection :as mc]
                    [core :as mg]
                    [db :as mdb]
                    [operators :refer :all]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-db-connection *db-connection*]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

(declare apply-clause
         annotate-results
         field-id->kw
         process-structured
         process-and-run-structured)

(def ^:dynamic *query* "The structured query we're currently processing (i.e. the `:query` part of the API call body)" nil)

;; (defn fetch-results
;;   {:arglists '([database collection-name])}
;;   [{{connection-string :conn_str} :details} collection-name]
;;   (with-db-connection [db connection-string]
;;     (doall (with-collection db collection-name
;;              (find {})
;;              (limit 20)))))


(defmethod driver/process-and-run :mongo [{query-type :type database-id :database :as query}]
  (let [{{connection-string :conn_str} :details} (sel :one Database :id database-id)]
    (with-db-connection [db connection-string]
      (case (keyword query-type)
        :query (let [generated-query (process-structured (:query query))]
                 ;; ; TODO - log/debug
                 (println (color/magenta "\n******************** Generated Monger Query: ********************\n"
                                         (with-out-str (clojure.pprint/pprint generated-query))
                                         "*****************************************************************\n"))
                 (->> (eval generated-query)
                      (annotate-results (:query query))))
        :native :TODO))))

(defn process-structured [{:keys [source_table aggregation] :as query}]
  (binding [*query* query]
    (let [collection-name (sel :one :field [Table :name] :id source_table)]
      (match aggregation
        ["rows"] `(doall (with-collection *db-connection* ~collection-name
                           ~@(doall (mapcat apply-clause query))))
        ["count"] (let [[[_ & constraints]] (apply-clause [:filter (:filter query)])] ; since only :filter applies to count aggregation
                    `[{:count (mc/count *db-connection* ~collection-name              ; just process filter clause which gives us a form like [(find {...})]
                                        ~@constraints)}])                             ; and pass that directly to the count fn
        [field-aggregation field-id] (let [field (field-id->kw field-id)]
                                       (case field-aggregation
                                         ;; TODO - these ignore clauses like :filter
                                         ;; (is that something we need anyway?)
                                         "avg"      `(->> (mc/aggregate *db-connection* ~collection-name [{$group {"_id" nil
                                                                                                                   "avg" {$avg ~(format "$%s" (name field))}}}])
                                                          (map #(dissoc % :_id)))
                                         "count"    nil ; (THE REST OF THESE ARE TODO)
                                         "distinct" nil
                                         "stddev"   nil
                                         "sum"      nil
                                         "cum_sum"  nil))))))

;; ## ANNOTATION

(defn annotate-results [{:keys [source_table] :as query} results]
  {:pre [(integer? source_table)]}
  (let [field-name->id (sel :many :field->id [Field :name] :table_id source_table)
        column-names (keys (first results))]
    {:row_count (count results)
     :status :completed
     :data {:columns column-names
            :cols (map (fn [column-name]
                         {:name column-name
                          :id (field-name->id (name column-name))
                          :table_id source_table
                          :description nil
                          :base_type :UnknownField
                          :special_type nil
                          :extra_info {}})
                       column-names)
            :rows (map #(map % column-names)
                       results)}}))

;; ## TESTING

(defn x []
  (driver/process-and-run {:database 44,
                           :type "query",
                           :query
                           {:source_table 59,
                            :aggregation ["count"],
                            :breakout [nil],
                            :limit 10,
                            :filter ["<" 307 1000]}}))

(defn y []
  (driver/process-and-run {:database 44,
                           :type "query",
                           :query
                           {:source_table 59,
                            :filter nil,
                            :aggregation ["rows"],
                            :breakout [nil],
                            :limit 25}}))

(defn y2 []
  (with-db-connection [db "mongodb://localhost/test"]
    (doall (with-collection db "zips"
             (limit 10)))))

;; Total count for each state
(defn z []
  (with-db-connection [db "mongodb://localhost/test"]
    (mc/aggregate db "zips" [{$group {"_id" "$state"
                                      "sum" {$sum 1}}}])))

(defn z2 []
  (with-db-connection [db "mongodb://localhost/test"]
    (mc/aggregate db "zips" [{$match {:pop {$lt 5000}}}
                             {$group {"_id" nil
                                      "avg" {$avg "$pop"}}}])))



(defn field-id->kw [field-id]
  (keyword (sel :one :field [Field :name] :id field-id)))


;; ## CLAUSE APPLICATION

(defmulti apply-clause (fn [[clause-kw _]]
                         clause-kw))

(defmacro defclause [clause-kw [value-binding] & body]
  `(defmethod apply-clause ~clause-kw [[_ ~value-binding]]
     (try
       ~@body
       (catch Throwable e#
         (println (color/red ~(format "Failed to apply clause '%s': " clause-kw) (.getMessage e#))))))) ; TODO - log/error

;; TODO - this should throw an Exception once QP is finished
(defmethod apply-clause :default [[clause-kw value]]
  (println "TODO: Don't know how to apply-clause" clause-kw "with value:" value))

;; ### aggregation
(defclause :aggregation [aggregation]
  nil) ; nothing to do here since this is handled by process-structured above

;; ### breakout (TODO)
(defclause :breakout [field-ids]
  (when (seq field-ids)
    nil))

(defn apply-filter-subclause [subclause]
  (match subclause
    ["INSIDE" lat-field-id lon-field-id lat-max lon-min lat-min lon-max] (let [lat-field (field-id->kw lat-field-id)
                                                                               lon-field (field-id->kw lon-field-id)]
                                                                           {$and [{lat-field {$gte lat-min, $lte lat-max}}
                                                                                  {lon-field {$gte lon-min, $lte lon-max}}]})
    [_ field-id & _] {(field-id->kw field-id)
                      (match subclause
                        ["NOT_NULL" _]        {$exists true}
                        ["IS_NULL"]           {$exists false}
                        ["BETWEEN" _ min max] {$gt min, $lt max} ; TODO - is this supposed to be inclusive, or not ?
                        ["="  _ value]        value
                        ["!=" _ value]        {$ne value}
                        ["<"  _ value]        {$lt value}
                        [">"  _ value]        {$gt value}
                        ["<=" _ value]        {$lte value}
                        [">=" _ value]        {$gte value})}))

;; ### filter (TODO)
(defclause :filter [filter-clause]
  (match filter-clause
    nil                  nil
    []                   nil
    [nil nil]            nil
    ["AND"]              nil
    ["AND" & subclauses] `[(find {$and ~(mapv apply-filter-subclause subclauses)})]
    ["OR"  & subclauses] `[(find {$or  ~(mapv apply-filter-subclause subclauses)})]
    subclause            `[(find ~(apply-filter-subclause subclause))]))

;; ### limit
(defclause :limit [value]
  (when value
    `[(limit ~value)]))

;; ### order_by
(defclause :order_by [field-dir-pairs]
  (let [sort-options (mapcat (fn [[field-id direction]]
                               [(field-id->kw field-id) (case (keyword direction)
                                                          :ascending 1
                                                          :descending -1)])
                             field-dir-pairs)]
    (when (seq sort-options)
      `[(sort (array-map ~@sort-options))])))

;; ### page
(defclause :page [{page-num :page items-per-page :items}]
  (let [num-to-skip (* (dec page-num) items-per-page)]
    `[(skip ~num-to-skip)
      (limit ~items-per-page)]))

;; ### source_table
;; Don't need to do anything here since `process-structured` takes care of the `with-collection` bit
(defclause :source_table [value]
  nil)
