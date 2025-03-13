(ns metabase.search.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.util Queue)))

(set! *warn-on-reflection* true)

;; Currently we use a single queue, even if multiple engines are enabled, but may want to revisit this.
(defonce ^:private ^Queue queue (queue/delay-queue))

;; Perhaps this config move up somewhere more visible? Conversely, we may want to specialize it per engine.

(def ^:private delay-ms
  "The minimum time we must wait before updating the index. This delay exists to dedupe and batch changes efficiently."
  100)

(def ^:private max-batch-items
  "The maximum number of update messages to process together.
  Note that each message can correspond to multiple documents, for example there would be 1 message for updating all
  the tables within a given database when it is renamed."
  50)

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (->> (:search-terms (search.spec/spec (:model m)))
       (keep m)
       (map str/trim)
       (remove str/blank?)
       (str/join " ")))

(defn- display-data [m]
  (select-keys m [:name :display_name :description :collection_name]))

(defn- ->document [m]
  (-> m
      (select-keys
       (into [:model] search.spec/attr-columns))
      (update :archived boolean)
      (assoc
       :display_data (display-data m)
       :legacy_input (dissoc m :pinned :view_count :last_viewed_at :native_query)
       :searchable_text (searchable-text m))))

(defn- attrs->select-items [attrs]
  (for [[k v] attrs :when v]
    (let [as (keyword (u/->snake_case_en (name k)))]
      (if (true? v) as [v as]))))

(defn- spec-index-query*
  [search-model]
  (let [spec (search.spec/spec search-model)]
    (u/remove-nils
     {:select    (search.spec/qualify-columns :this
                                              (concat
                                               (:search-terms spec)
                                               (mapcat (fn [k] (attrs->select-items (get spec k)))
                                                       [:attrs :render-terms])))
      :from      [[(t2/table-name (:model spec)) :this]]
      :where     (:where spec [:inline [:= 1 1]])
      :left-join (when (:joins spec)
                   (into []
                         cat
                         (for [[join-alias [join-model join-condition]] (:joins spec)]
                           [[(t2/table-name join-model) join-alias]
                            join-condition])))})))

(def ^{:private true, :arglists '([search-model])} spec-index-query
  (memoize spec-index-query*))

(defn- spec-index-query-where [search-model where-clause]
  (-> (spec-index-query search-model)
      (sql.helpers/where where-clause)))

(defn- spec-index-reducible [search-model & [where-clause]]
  (->> (spec-index-query-where search-model where-clause)
       t2/reducible-query
       (eduction (map #(assoc % :model search-model)))))

(defn- search-items-reducible []
  (reduce u/rconcat [] (map spec-index-reducible search.spec/search-models)))

(defn- query->documents [query-reducible]
  (->> query-reducible
       (eduction
        (comp
         (map t2.realize/realize)
         ;; It's possible to get redundant entries from the indexed-entities table.
         ;; We remove duplicates to avoid creating invalid insert statements.
         (m/distinct-by (juxt :id :model))
         (map ->document)))))

(defn populate-index!
  "Go over all searchable items and populate the index with them."
  [engine]
  (search.engine/consume! engine (query->documents (search-items-reducible))))

(def ^:dynamic *force-sync*
  "Force ingestion to happen immediately, on the same thread."
  false)

(def ^:dynamic *disable-updates*
  "Used by tests to disable updates, for example when testing migrations, where the schema is wrong."
  false)

(defn consume!
  "Update all active engines' indexes with the given documents"
  [documents-reducible]
  (when-let [engines (seq (search.engine/active-engines))]
    (if (= 1 (count engines))
      (search.engine/consume! (first engines) documents-reducible)
      ;; TODO um, multiplexing over the reducible awkwardly feels strange. We at least use a magic number for now.
      (doseq [batch (eduction (partition-all 150) documents-reducible)
              e     engines]
        (search.engine/consume! e batch)))))

(defn bulk-ingest!
  "Process the given search model updates. Returns the number of search index entries that get updated as a result."
  [updates]
  (->> (for [[search-model where-clauses] (u/group-by first second updates)]
         (spec-index-reducible search-model (into [:or] (distinct where-clauses))))
       ;; init collection is only for clj-kondo, as we know that the list is non-empty
       (reduce u/rconcat [])
       query->documents
       consume!))

(defn- track-queue-size! []
  (analytics/set! :metabase-search/queue-size (.size queue)))

(defn ingest-maybe-async!
  "Update or create any search index entries related to the given updates.
  Will be async if the worker exists, otherwise it will be done synchronously on the calling thread.
  Can also be forced to run synchronously for testing."
  ([updates]
   (ingest-maybe-async! updates *force-sync*))
  ([updates sync?]
   (when-not *disable-updates*
     (if sync?
       (bulk-ingest! updates)
       (do
         (doseq [update updates]
           (log/trace "Queuing update" update)
           (queue/put-with-delay! queue delay-ms update))
         (track-queue-size!)
         true)))))

(defn- report->prometheus! [duration report]
  (analytics/inc! :metabase-search/index-ms duration)
  (doseq [[model cnt] report]
    (analytics/inc! :metabase-search/index {:model model} cnt)))

(queue/listen! {:listener-name   "search-index-update"
                :queue           queue
                :handler         bulk-ingest!
                :result-handler  (fn [result duration _]
                                   (when (seq result)
                                     (report->prometheus! duration result)
                                     (log/debugf "Indexed search entries in %.0fms %s" duration (sort-by (comp - val) result))))
                :err-handler   #(analytics/inc! :metabase-search/index-error)
                :finally-handler track-queue-size!
                :max-batch-items max-batch-items})
