(ns metabase.search.appdb.specialization.mysql
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [toucan2.core :as t2]))

;;; honeysql extensions

(defn- format-match-against [_ [cols pattern]]
  (let [cols-sql (if (vector? cols)
                   (str/join ", " (map sql/sql-kw cols))
                   (sql/sql-kw cols))
        [pattern-sql & pattern-params] (sql/format-expr pattern)]
    (into [(str "MATCH(" cols-sql ") AGAINST(" pattern-sql " IN BOOLEAN MODE)")]
          pattern-params)))

(sql/register-fn! :match-against format-match-against)

;;; mysql-specific logic

(defmethod specialization/->db-type :mysql [t]
  (get {:pk :int, :timestamp (keyword "timestamp(6)")} t t))

(defmethod specialization/table-schema :mysql [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         [:search_text :text]
         [:native_query_text :text]]
        base-schema))

(defmethod specialization/post-create-statements :mysql [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)"
    "CREATE FULLTEXT INDEX %s_search_text_idx ON %s (search_text) WITH PARSER ngram"
    "CREATE FULLTEXT INDEX %s_native_query_idx ON %s (native_query_text) WITH PARSER ngram"]))

(defmethod specialization/batch-upsert! :mysql [table entries]
  (when (seq entries)
    (let [update-keys (remove #{:id :model :model_id} (keys (first entries)))]
      (t2/query
       {:insert-into             table
        :values                  entries
        :on-duplicate-key-update (into {}
                                       (for [k update-keys]
                                         [k [:values k]]))}))))

(defn- quote* [s]
  (str "\""
       (-> (str/replace s #"^\"|\"$" "")
           (str/replace "\"" "\"\""))
       "\""))

(defn- process-phrase [phrase]
  (cond
    ;; trailing quotation mark
    (= phrase "\"")               nil
    ;; negation
    (str/starts-with? phrase "-") (str "-" (quote* (subs phrase 1)))
    ;; quoted or unquoted
    :else                         (quote* phrase)))

(defn- to-mysql-expr
  "Given the user input, construct a query in MySQL query language."
  [input]
  (str
   (when-let [input (some-> input str/trim not-empty)]
     (->> (postgres/split-preserving-quotes input)
          (remove str/blank?)
          (map process-phrase)
          (str/join " ")))))

(defmethod specialization/base-query :mysql
  [active-table search-string search-ctx select-items]
  (let [search-column (if (:search-native-query search-ctx)
                        [:search_index.search_text :search_index.native_query_text]
                        :search_index.search_text)]
    (cond-> {:select select-items
             :from   [[active-table :search_index]]}
      (not (str/blank? search-string))
      (sql.helpers/where [:match-against search-column (to-mysql-expr search-string)]))))

(defmethod specialization/extra-entry-fields :mysql [entity]
  {:search_text       (or (:searchable_text entity) "")
   :native_query_text (or (:native_query entity) "")})

(defmethod specialization/text-score :mysql [_search-ctx]
  [:inline 1])

(defmethod specialization/view-count-percentile-query :mysql
  [index-table p-value]
  ;; Similar to h2 for now - absolutely incorrect, but no `percentile_cont` in mysql.
  ;; In theory we can write a custom window function.
  {:select   [:search_index.model [[:* [:inline (math/pow p-value 10)] [:max :view_count]] :vcp]]
   :from     [[index-table :search_index]]
   :group-by [:search_index.model]})
