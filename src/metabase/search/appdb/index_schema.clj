(ns metabase.search.appdb.index-schema
  "The engine-independent column definitions of the search index table. Lives below `metabase.search.db`, which
  creates the table, so it can't be part of `metabase.search.appdb.index`."
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]))

(defn- ->db-type [t]
  (get {:pk :int, :timestamp :timestamp-with-time-zone} t t))

(defn- ->db-column [c]
  (or (get {:id         :model_id
            :created-at :model_created_at
            :updated-at :model_updated_at}
           c)
      (keyword (u/->snake_case_en (name c)))))

(def ^:private not-null
  #{:archived :name})

(def ^:private default
  {:archived false})

;; If this fails, we'll need to increase the size of :model below
(assert (>= 32 (transduce (map (comp count name)) max 0 search.config/all-models)))

(def base-schema
  "The columns of the search index table, before the active engine specialization adds its own."
  (into [[:model [:varchar 32] :not-null]
         [:display_data :text :not-null]
         [:legacy_input :text :not-null]
         ;; useful for tracking the speed and age of the index
         [:created_at :timestamp-with-time-zone
          [:default ^:allow-raw-sql [:raw "CURRENT_TIMESTAMP"]]
          :not-null]
         [:updated_at :timestamp-with-time-zone :not-null]]
        (keep (fn [[k t]]
                (when t
                  (into [(->db-column k) (->db-type t)]
                        (concat
                         (when (not-null k)
                           [:not-null])
                         (when-some [d (default k)]
                           [[:default d]]))))))
        search.spec/attr-types))
