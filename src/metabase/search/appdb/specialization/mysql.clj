(ns metabase.search.appdb.specialization.mysql
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.search.appdb.specialization.api :as specialization]
   [toucan2.core :as t2]))

(defmethod specialization/table-schema :mysql [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         [:search_text :text :not-null]
         [:with_native_query_text :text :not-null]]
        (->> base-schema
             (map (fn [cdef] (if (some #{:timestamp-with-time-zone} cdef)
                               (mapv #(if (= % :timestamp-with-time-zone) :timestamp %) cdef)
                               cdef))))))

(defmethod specialization/post-create-statements :mysql [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["ALTER TABLE %s ADD UNIQUE INDEX %s_identity_idx (model, model_id)"
    "CREATE FULLTEXT INDEX %s_search_text_idx ON %s (search_text)"
    "CREATE FULLTEXT INDEX %s_native_fulltext_idx ON %s (with_native_query_text)"
    "CREATE INDEX %s_model_archived_idx ON %s (model, archived)"
    "CREATE INDEX %s_archived_idx ON %s (archived)"]))

(defmethod specialization/batch-upsert! :mysql [table entries]
  (when (seq entries)
    (let [update-keys (vec (disj (set (keys (first entries))) :id :model :model_id))]
      (t2/query
       {:insert-into             table
        :values                  entries
        :on-duplicate-key-update (into {} (map (fn [c] [c [:values c]]) update-keys))}))))

(defn- quote* [s]
  (str "\"" (str/replace s "\"" "\"\"") "\""))

(defn- format-match-against [_ [cols pattern]]
  (let [cols-sql (if (vector? cols)
                   (str/join ", " (map sql/sql-kw cols))
                   (sql/sql-kw cols))
        [pattern-sql & pattern-params] (sql/format-expr pattern)]
    (into [(str "MATCH(" cols-sql ") AGAINST(" pattern-sql ")")]
          pattern-params)))

(sql/register-fn! :match-against format-match-against)

(defmethod specialization/base-query :mysql
  [active-table search-term search-ctx select-items]
  {:select select-items
   :from   [[active-table :search_index]]
   :where  (if (str/blank? search-term)
             [:= [:inline 1] [:inline 1]]
             [:match-against
              (if (:search-native-query search-ctx) :with_native_query_text [:search_main :search_text])
              search-term])})

(defmethod specialization/extra-entry-fields :mysql [entity]
  {:search_text            (:searchable_text entity "")
   :with_native_query_text (keep entity [:searchable_text :native_query])})

(defmethod specialization/text-score :mysql
  []
  [:inline 1]
  #_[:match-against [:search_main :search_text]]
  #_[:match [:raw "search_vector"] [:raw "query"] [:raw match-relevance-mode]])

(defmethod specialization/view-count-percentile-query :mysql
  [index-table p-value]
  ;; Similar to h2 for now, in theory percentile can be done by writing window function
  {:select   [:search_index.model [[:* [:inline (math/pow p-value 10)] [:max :view_count]] :vcp]]
   :from     [[index-table :search_index]]
   :group-by [:search_index.model]})
