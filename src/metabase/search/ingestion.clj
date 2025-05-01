(ns metabase.search.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.util.concurrent DelayQueue)))

(set! *warn-on-reflection* true)

;; Currently we use a single queue, even if multiple engines are enabled, but may want to revisit this.
(defonce ^:private ^DelayQueue queue (queue/delay-queue))

;; Perhaps this config move up somewhere more visible? Conversely, we may want to specialize it per engine.

(def ^:private message-delay-ms
  "The time a message should wait before coming off the queue.
  This delay exists to ensure the data is fully committed before indexing."
  100)

(def ^:private listener-name
  "The name of the listener that consumes the queue"
  "search-index-update")

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (->> (:search-terms (search.spec/spec (:model m)))
       (keep m)
       (map str/trim)
       (remove str/blank?)
       (str/join " ")))

(defn- display-data [m]
  (perf/select-keys m [:name :display_name :description :collection_name]))

(defn- ->document [m]
  (-> m
      (perf/select-keys
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

(defn searchable-documents
  "Return all existing searchable documents from the database."
  []
  (query->documents (search-items-reducible)))

(def ^:dynamic *force-sync*
  "Force ingestion to happen immediately, on the same thread."
  false)

(def ^:dynamic *disable-updates*
  "Used by tests to disable updates, for example when testing migrations, where the schema is wrong."
  false)

(defn update!
  "Update all active engines' existing indexes with the given documents. Passed remove-documents will be deleted from the index."
  [documents-reducible removed-models-reducible]
  (doseq [e (seq (search.engine/active-engines))]
    ;; We are partitioning the documents into batches at this level and sending each batch to all the engines
    ;; to avoid having to retain the head of the sequences as we work through all the documents.
    ;; Individual engines may also partition the documents further if they prefer
    (reduce (fn [_ batch] (search.engine/update! e batch)) nil
            (eduction (partition-all 150) documents-reducible))
    (reduce (fn [_ batch] (doseq [[group ids] (u/group-by first second batch)]
                            (search.engine/delete! e group ids))) nil
            (eduction (partition-all 1000) removed-models-reducible))))

(defn- extract-model-and-id
  ([update]
   (when-let [[model update-def] update]
     (extract-model-and-id model update-def)))

  ([model update-def]
   (let [operation (first update-def)
         values (rest update-def)]
     (case operation
       := (let [column-def (first (filter keyword? values))
                id (str (first (filter integer? values)))]
            (if (= :this.id column-def)
              [model id]
              nil))

       :and (first (keep (partial extract-model-and-id model) values))))))

(defn bulk-ingest!
  "Process the given search model updates. Returns the number of search index entries that get updated as a result."
  [updates]
  (let [documents (->> (for [[search-model where-clauses] (u/group-by first second updates)]
                         (spec-index-reducible search-model (into [:or] (distinct where-clauses))))
                       ;; init collection is only for clj-kondo, as we know that the list is non-empty
                       (reduce u/rconcat [])
                       query->documents)
        passed-documents (map extract-model-and-id updates)
        indexed-documents (map (juxt :model (comp str :id)) (into [] documents))
        ;; TODO: The list of documents to delete is not completely accurate.
        ;; We are attempting to figure it out based on the ids that are passed in to be indexed vs. the ids of the rows that were actually indexed.
        ;; This will not work for cases like indexed-entries with compound PKs,
        ;; but it's fine for now because that model doesn't have a where clause so never needs to be purged during an update.
        ;; Long-term, we should find a better approach to knowing what to purge.
        to-delete (remove (set indexed-documents) passed-documents)]

    (update! documents to-delete)))

(defn- track-queue-size! []
  (analytics/set! :metabase-search/queue-size (.size queue)))

(defn- index-worker-exists? []
  (queue/listener-exists? listener-name))

(defn ingest-maybe-async!
  "Update or create any search index entries related to the given updates.
  Will be async if the worker exists, otherwise it will be done synchronously on the calling thread.
  Can also be forced to run synchronously for testing."
  ([updates]
   (ingest-maybe-async! updates (or *force-sync* (not (index-worker-exists?)))))
  ([updates sync?]
   (when-not *disable-updates*
     (if sync?
       (bulk-ingest! updates)
       (do
         (doseq [update updates]
           (log/trace "Queuing update" update)
           (queue/put-with-delay! queue message-delay-ms update))
         (track-queue-size!)
         true)))))

(defn report->prometheus!
  "Send a search index update report to Prometheus"
  [duration report]
  (analytics/inc! :metabase-search/index-ms duration)
  (prometheus/observe! :metabase-search/index-duration-ms duration)
  (doseq [[model cnt] report]
    (analytics/inc! :metabase-search/index {:model model} cnt)))

(defn start-listener!
  "Starts the ingestion listener on the queue"
  []
  (queue/listen! listener-name queue bulk-ingest!
                 {:success-handler     (fn [result duration _]
                                         (report->prometheus! duration result)
                                         (log/debugf "Indexed search entries in %.0fms %s" duration (sort-by (comp - val) result))
                                         (track-queue-size!))
                  :err-handler        (fn [err _]
                                        (log/error err "Error indexing search entries")
                                        (analytics/inc! :metabase-search/index-error)
                                        (track-queue-size!))
                  ;; Note that each message can correspond to multiple documents,
                  ;; for example there would be 1 message for updating all
                  ;; the tables within a given database when it is renamed.
                  ;; Messages can also correspond to zero documents,
                  ;; such as when updating a table that is marked as not visible.
                  :max-batch-messages 50
                  :max-next-ms       100}))
