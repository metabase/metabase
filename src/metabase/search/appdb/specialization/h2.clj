(ns metabase.search.appdb.specialization.h2
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmethod specialization/table-schema :h2 []
  [[:id :bigint :auto-increment :primary-key ]
   ;; entity
   [:model_id :int :not-null]
   ;; TODO We could shrink this to just what we need.
   [:model [:varchar 254] :not-null]
   [:name :text :not-null]
   ;; search
   [:search_terms :text]
   [:native_search_terms :text]
   ;; results
   [:display_data :text :not-null]
   [:legacy_input :text :not-null]
   ;; scoring related
   [:dashboardcard_count :int]
   [:last_viewed_at :timestamp-with-time-zone]
   [:official_collection :boolean]
   [:pinned :boolean]
   [:verified :boolean]
   [:view_count :int]
   ;; permission related entities
   [:collection_id :int]
   [:database_id :int]
   ;; filter related
   [:archived :boolean :not-null [:default false]]
   [:creator_id :int]
   [:last_edited_at :timestamp-with-time-zone]
   [:last_editor_id :int]
   [:model_created_at :timestamp-with-time-zone]
   [:model_updated_at :timestamp-with-time-zone]
   ;; useful for tracking the speed and age of the index
   [:created_at :timestamp-with-time-zone
    [:default [:raw "CURRENT_TIMESTAMP"]]
    :not-null]
   [:updated_at :timestamp-with-time-zone :not-null]])

(defmethod specialization/post-create-statements :h2 [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)"
    ;; indexes on text?
    ]))

(defmethod specialization/batch-upsert! :h2 [table entries]
  ;; it's in memory, let's just do it quick and dirty (HoneySQL can't speak MERGE WITH)
  ;; TODO just generate raw SQL
  (when (seq entries)
    (doseq [{:keys [model model_id]} entries]
      (t2/delete! table :model model :model_id model_id))
    (t2/insert! table entries)))

(defn- wildcard-tokens [search-term]
  (->> (str/split search-term #"\s+")
       (map #(u/lower-case-en (str/trim %)))
       (remove str/blank?)
       (map #(str "%" % "%"))))

(defmethod specialization/base-query :h2
  [active-table search-term search-ctx select-items]
  (let [search-column (if (:search-native-query search-ctx)
                        :search_index.native_search_terms
                        :search_index.search_terms)]
    (cond-> {:select select-items
             :from   [[active-table :search_index]]}
      (not (str/blank? search-term))
      (sql.helpers/where (into [:and] (for [pattern (wildcard-tokens search-term)]
                                        [:like [:lower search-column] pattern]))))))

(defmethod specialization/extra-entry-fields :h2 [entity]
  {:search_terms        (:searchable_text entity)
   :native_search_terms (str/join " " (keep entity [:searchable_text :native_query]))})

(defmethod specialization/text-score :h2 []
  [:inline 1])
