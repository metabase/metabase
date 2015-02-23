(ns metabase.driver.postgres
  (:require [clojure.core.match :refer [match]]
            [metabase.db :refer [sel]]
            (metabase.models [hydrate :refer :all]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.util :refer [assoc*]]))

(declare build-query
         generate-sql)

(defn annotate-column
  "Add the following keys to COLUMN (used internally):
  *  `:keyword` Used for keying some internal maps (?)
  *  `:qualified-name` Name to be used in the `SELECT` statement, e.g. `\"main_guide\".\"user_id\"`
  *  `:alias` Alias for the field in `SELECT` statements (needed in some cases where we cast fields such as Dates)
  *  `:select` Combined qualified name/alias form to use in `SELECT` statement, e.g. `\"main_guide\".\"user_id\" AS `\"main_guide\"`"
  [table column]
  (let [{:keys [name base_type]} column
        qualified-name (format "\"%s\".\"%s\"" (:name table) name)
        alias (match base_type
                "DateTimeField" (format "%s_date" name)
                :else name)
        format-str (match base_type
                     "DateTimeField" "DATE(%s) AS %s"
                     :else nil)
        select (if format-str (format format-str qualified-name alias)
                   qualified-name)]
    (assoc column
           :keyword (keyword name)
           :qualified-name qualified-name
           :alias alias
           :select select)))

(defn annotate-column-with-id
  "Fetch `Field` with COLUMN-ID and call `annotate-column`."
  [table column-id]
  {:pre [(integer? column-id)]}
  (annotate-column table (sel :one Field :id column-id)))

(defn annotate-special-column [column]
  (match column
    "count" {:name "Count"
             :keyword :count
             :alias :count
             :select "COUNT(*)"
             :base_type "IntegerField"
             :special_type "number"
             :table_id nil
             :extra_info nil
             :id nil
             :description nil}))

(defn is-special-aggregation?
  "Is this aggregation clause a 'special' case such as `sum`?"
  [aggregation]
  (match (first aggregation)
    "rows" true
    "sum" true
    :else false))

(defn apply-special-aggregation [{:keys [source_table table aggregation] :as query}]
  (case (first aggregation)
    "rows" (->> (sel :many Field :table_id source_table) ; aggregation: ["rows"] just means return all rows
                (map (partial annotate-column table)))
    "sum" (let [{:keys [name] :as field} (annotate-column-with-id table (second aggregation))]
            (->> (assoc field
                       :name (format "Sum (%s)" name)
                       :keyword :sum
                       :alias :sum
                       :select (format "SUM(\"%s\".\"%s\")" (:name table) name))
                 vector))))

(defn get-columns
  "Return an array of column info dictionaries for QUERY."
  [{:keys [source_table table breakout aggregation] :as query}]
  {:post [sequential?]}
  (if (is-special-aggregation? aggregation) (apply-special-aggregation query)
      (->> (concat breakout aggregation)
           (filter identity)
           (map (fn [column]
                  (case (integer? column)
                    true (annotate-column-with-id table column)
                    false (annotate-special-column column)))))))

(defn process [{:keys [source_table] :as query}]
  (assoc* query
          :table (sel :one Table :id source_table)
          :database (:db (-> (:source_table <>)
                             (hydrate :db)))
          :columns (get-columns <>)
          :column-name->column (->> (:columns <>)
                                    (map (fn [{:keys [keyword] :as col}]
                                           {keyword col}))
                                    (reduce merge {}))
          :column-id->column (->> (:columns <>)
                                  (filter :id)
                                  (map (fn [{:keys [id] :as col}]
                                         {id col}))
                                  (reduce merge {}))
          :ordered-columns (map :keyword (:columns <>))
          :ordered-aliases (map #(keyword (:alias %)) (:columns <>))
          :sql (->> <>
                    build-query
                    generate-sql)))

(defn apply-breakout [query fields]
  (let [field-names (->> fields
                  (map (:column-id->column query))
                  (map :alias)
                  (interpose ", ")
                  (apply str))]
    {:group-by field-names
     :order-by field-names}))

(defn apply-clause [query [clause-name clause-value]]
  (case clause-name
    :filter nil
    :breakout (apply-breakout query clause-value)
    :limit (when clause-value
             {:limit clause-value})
    :aggregation nil
    :page (when-let [{:keys [page items]} clause-value]
            {:offset (* items (- page 1))
             :limit items})))

(defn build-query [{:keys [table columns] :as query}]
  (let [q (->> (select-keys query [:filter :breakout :limit :aggregation :page])
               (map (partial apply-clause query))
               (filter identity)
               (apply merge {}))]
    (assoc q
           :select (->> (map :select columns)
                        (interpose ", ")
                        (apply str))
           :from (format "\"%s\"" (:name table)))))

(defn format-result [row]
  (->> row
       (map (fn [value]
              (if-not (= (type value) java.sql.Date) value
                      (.toString value))))))

(defn generate-sql [query]
  (println "QUERY: ")
  (clojure.pprint/pprint query)
  (letfn [(sqlwhen [kw sql-str]
            (let [val (-> (kw query)
                          str)]
              (when-not (empty? val) (str sql-str "\n" val))))]
    (->> [(sqlwhen :select "SELECT")
          (sqlwhen :from "FROM")
          (sqlwhen :group-by "GROUP BY")
          (sqlwhen :order-by "ORDER BY")
          (sqlwhen :offset "OFFSET")
          (sqlwhen :limit "LIMIT")]
         (filter identity)
         (interpose "\n")
         (apply str))))

(defn process-and-run [{:keys [database] :as query}]
  (let [{:keys [sql columns ordered-columns column-name->column] :as query-dict} (process (:query query))
        db (sel :one Database :id database)
        results ((:native-query db) sql)]
    (println "----------------------------------------\n"
             "DRIVER GENERATED SQL:\n"
             sql
             "\n----------------------------------------")
    {:status :completed
     :row_count (count results)
     :data {:rows (->> results
                       (mapv #(mapv % (:ordered-aliases query-dict)))
                       (mapv format-result))
            :columns (mapv :name columns)
            :cols (mapv column-name->column
                        ordered-columns)}}))
