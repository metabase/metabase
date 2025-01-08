(ns metabase.search.appdb.specialization.mysql
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmethod specialization/->db-type :mysql [t]
  (get {:pk :int, :timestamp (keyword "timestamp(6)")} t t))

(defmethod specialization/table-schema :mysql [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         [:search_terms :text]
         [:native_search_terms :text]]
        base-schema))

(defmethod specialization/post-create-statements :mysql [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)"]))

(defmethod specialization/batch-upsert! :mysql [table entries]
  (when (seq entries)
    (let [update-keys (remove #{:id :model :model_id} (keys (first entries)))]
      (t2/query
       {:insert-into             table
        :values                  entries
        :on-duplicate-key-update (into {}
                                       (for [k update-keys]
                                         [k [:values k]]))}))))

(defn- wildcard-tokens [search-term]
  (->> (str/split search-term #"\s+")
       (map #(u/lower-case-en (str/trim %)))
       (remove str/blank?)
       (map (fn [s] (str "%" s "%")))))

(defmethod specialization/base-query :mysql
  [active-table search-term search-ctx select-items]
  (let [search-column (if (:search-native-query search-ctx)
                        :search_index.native_search_terms
                        :search_index.search_terms)]
    (cond-> {:select select-items
             :from   [[active-table :search_index]]}
      (not (str/blank? search-term))
      (sql.helpers/where (into [:and] (for [pattern (wildcard-tokens search-term)]
                                        [:like [:lower search-column] pattern]))))))

(defmethod specialization/extra-entry-fields :mysql [entity]
  {:search_terms        (or (:searchable_text entity) "")
   :native_search_terms (str/join " " (keep entity [:searchable_text :native_query]))})

(defmethod specialization/text-score :mysql [_search-ctx]
  [:inline 1])

(defmethod specialization/view-count-percentile-query :mysql
  [index-table p-value]
  ;; Similar to h2 for now - absolutely incorrect, but no `percentile_cont` in mysql.
  ;; In theory we can write a custom window function.
  {:select   [:search_index.model [[:* [:inline (math/pow p-value 10)] [:max :view_count]] :vcp]]
   :from     [[index-table :search_index]]
   :group-by [:search_index.model]})
