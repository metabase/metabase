(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require [colorize.core :as color]
            (monger [core :as mg]
                    [db :as mdb]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-db-connection *db-connection*]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

(declare apply-clause
         annotate-results
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
                      (annotate-results query)))
        :native :TODO))))

(defn process-structured [{:keys [source_table] :as query}]
  (binding [*query* query]
    (let [collection-name (sel :one :field [Table :name] :id source_table)]
      `(doall (with-collection *db-connection* ~collection-name
                (find {})
                ~@(doall (mapcat apply-clause query)))))))

;; ## ANNOTATION

(defn annotate-results [{:keys [source_table] :as query} results]
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
                            :filter nil,
                            :aggregation ["rows"],
                            :breakout [nil],
                            :limit nil,
                            :page {:page 2, :items 20}
                            :order_by [[307 "ascending"]
                                       [310 "ascending"]]}}))

(defn y []
  (driver/process-and-run {:database 44,
                           :type "query",
                           :query
                           {:source_table 59,
                            :filter nil,
                            :aggregation ["rows"],
                            :breakout [nil],
                            :limit nil,
                            :page {:page 2, :items 20}}}))

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
         (println ~(format "Failed to apply clause '%s':" clause-kw) e#))))) ; TODO - log/error

;; TODO - this should throw an Exception once QP is finished
(defmethod apply-clause :default [[clause-kw value]]
  (println "TODO: Don't know how to apply-clause" clause-kw "with value:" value))

;; ### aggregation (TODO)
(defclause :aggregation [value]
  nil)

;; ### breakout (TODO)
(defclause :breakout [value]
  nil)

;; ### filter (TODO)
(defclause :filter [value]
  nil)

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
