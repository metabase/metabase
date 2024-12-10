(ns metabase.search.appdb.specialization.h2
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmethod specialization/table-schema :h2 [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         [:search_terms :text]
         [:native_search_terms :text]]
        base-schema))

(defmethod specialization/post-create-statements :h2 [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)"]))

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
       (map (fn [s] (str "%" s "%")))))

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

(defmethod specialization/view-count-percentile-query :h2
  [index-table p-value]
  ;; Since H2 doesn't support calculating percentiles, we just scale the max >_<
  ;; We take the power of the p-value to simulate a one-sided, long-tailed distribution
  {:select   [:search_index.model [[:* [:inline (math/pow p-value 10)] [:max :view_count]] :vcp]]
   :from     [[index-table :search_index]]
   :group-by [:search_index.model]})
