(ns metabase.metabot.util
  ""
  (:require
   [clojure.string :as str]
   [metabase.db.query :as mdb.query]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util.add-alias-info :as add]
   [toucan2.core :as t2]))

(defn normalize-name
  "Normalize model and column names to SLUG_CASE.
  The current bot responses do a terrible job of creating all kinds of SQL from a table or column name.
  Example: 'Created At', CREATED_AT, \"created at\" might all come back in the response.
  Standardization of names produces dramatically better results."
  [s]
  (some-> s
          str/upper-case
          (str/replace #"[^\p{Alnum}]+" "_")))

(defn- aliases
  "Create a seq of aliases to be used to make model columns more human friendly"
  [{:keys [dataset_query result_metadata]}]
  (let [alias-map (update-vals
                   (into {} (map (juxt :id :display_name) result_metadata))
                   (fn [v] (cond-> v
                             (str/includes? v " ")
                             normalize-name)))
        {:keys [query]} (let [driver (driver.u/database->driver (:database (qp/preprocess dataset_query)))]
                          (let [qp (qp.reducible/combine-middleware
                                    (vec qp/around-middleware)
                                    (fn [query _rff _context]
                                      (add/add-alias-info
                                       (#'qp/preprocess* query))))]
                            (qp dataset_query nil nil)))
        {:keys [fields]} query]
    (for [field fields
          :let [[_ id m] field
                alias (::add/desired-alias m)]]
      [alias (alias-map id)])))

(defn- fix-model-reference
  "The formatter may expand the parameterized model (e.g. {{#123}} -> { { # 123 } }).
  This function fixes that."
  [sql]
  (str/replace
   sql
   #"\{\s*\{\s*#\s*\d+\s*\}\s*\}\s*"
   (fn [match] (str/replace match #"\s*" ""))))

(defn inner-query
  "Produce a SELECT * over the parameterized model with columns aliased to normalized display names.
  This can be used in a CTE such that an outer query can be called on this query."
  [{:keys [id] :as model}]
  (let [column-aliases (->> (aliases model)
                            (map (partial apply format "\"%s\" AS %s"))
                            (str/join ","))]
    (->> (format "SELECT %s FROM {{#%s}}" column-aliases id)
         mdb.query/format-sql
         fix-model-reference)))

(defn denormalize-field [{:keys [display_name id base_type] :as field}]
  (let [field-vals (when (not= :type/Boolean base_type)
                     (t2/select-one-fn :values FieldValues :field_id id))]
    (-> (cond-> field
          (seq field-vals)
          (assoc :possible_values (vec field-vals)))
        (assoc :sql_name (normalize-name display_name))
        (dissoc :field_ref :id))))

(defn denormalize-model [{model-name :name :as model}]
  (-> model
      (update :result_metadata #(mapv denormalize-field %))
      (assoc :sql_name (normalize-name model-name))
      (assoc :inner_query (inner-query model))
      (dissoc :creator_id :dataset_query :table_id :collection_position)))

(defn denormalize-database [{database-name :name db_id :id :as database}]
  (let [models (t2/select Card :database_id db_id :dataset true)]
    (-> database
        (assoc :sql_name (normalize-name database-name))
        (assoc :models (mapv denormalize-model models)))))

(defn bot-sql->final-sql
  "Produce the final query usable by the UI but converting the model to a CTE
  and calling the bot sql on top of it."
  [{:keys [inner_query sql_name] :as _denormalized-model} outer-query]
  (let [model-with-cte (format "WITH %s AS (%s) %s" sql_name inner_query outer-query)]
    (fix-model-reference model-with-cte)))
