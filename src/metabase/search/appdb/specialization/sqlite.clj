(ns metabase.search.appdb.specialization.sqlite
  "Substring search for single-instance SQLite application databases. Text is normalized at ingestion so
  matching includes Unicode lowercasing without depending on SQLite's ASCII-only LOWER function."
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.db :as search.db]
   [metabase.search.scoring :as scoring]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]))

(defmethod specialization/table-schema :sqlite [base-schema]
  (into [[:id :integer :primary-key]
         [:search_terms :text]
         [:native_search_terms :text]
         [:normalized_name :text]]
        (map (fn [[column type & constraints]]
               (into [column (if (= type :timestamp-with-time-zone) :timestamp type)]
                     (if (= column :created_at)
                       [[:default (h2x/current-datetime-honeysql-form :sqlite)] :not-null]
                       constraints))))
        base-schema))

(defmethod specialization/post-create-statements :sqlite [prefix table-name]
  [(format "CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)" prefix table-name)])

(defmethod specialization/batch-upsert! :sqlite [table entries]
  ;; SQLite implements the same ON CONFLICT ... DO UPDATE syntax as Postgres. Unlike REPLACE, this preserves
  ;; the document's id and created_at. Keep batches below SQLite's parameter limit even on older builds.
  (doseq [batch (partition-all (max 1 (quot 999 (max 1 (count (set (mapcat keys entries)))))) entries)]
    (search.db/postgres-batch-upsert! table batch)))

(defmethod specialization/base-query :sqlite [table search-term search-ctx select-items]
  (let [column (if (:search-native-query search-ctx)
                 :search_index.native_search_terms
                 :search_index.search_terms)
        tokens (remove str/blank? (str/split (u/lower-case-en (or search-term "")) #"\s+"))]
    (cond-> {:select select-items :from [[table :search_index]]}
      (seq tokens) (sql.helpers/where (into [:and] (map (fn [token] [:> [:instr column token] 0]) tokens))))))

(defmethod specialization/extra-entry-fields :sqlite [entity]
  {:search_terms        (u/lower-case-en (or (:searchable_text entity) ""))
   :native_search_terms (u/lower-case-en (str/join " " (keep entity [:searchable_text :native_query])))
   :normalized_name     (scoring/normalize-text (or (:name entity) ""))})

(defmethod specialization/text-score :sqlite []
  [:inline 1])

(defmethod specialization/view-count-percentile-query :sqlite [index-table p-value]
  ;; Match the inexpensive approximation used by the H2 preview engine.
  {:select [:search_index.model [[:* [:inline (math/pow p-value 10)] [:max :view_count]] :vcp]]
   :from [[index-table :search_index]]
   :group-by [:search_index.model]})

(defmethod specialization/index-size-estimate :sqlite [table-name]
  (search.db/index-entry-count table-name))
