(ns metabase.search.ingestion
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.app-db.core :as mdb]
   [metabase.lib-be.core :as lib-be]
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

(def max-searchable-value-length
  "The maximum length of a searchable value. This is mostly driven by postgresql max-lengths on tsvector columns.
  And is about half of postgresql's max, since we concat two values together often. That is likely aggressive, but being safe until we can better understand normal data shapes"
  500000)

(defn searchable-value-trim-sql
  "Returns the honeysql expression to trim a searchable value to the max length.
  The passed column should be a keyword that is qualified as needed.
  Uses a slightly larger value that what will be stored in the db so we can better use word boundaries on the actual end"
  [column]
  (if (#{:postgres :h2} (mdb/db-type))
    [:left
     column
     [:cast (+ max-searchable-value-length 100) :integer]]
    column))

(defn- searchable-text [m]
  ;; For now, we never index the native query content
  (let [search-terms (:search-terms (search.spec/spec (:model m)))
        getter       (if (map? search-terms)
                       (fn [[k tx]]
                         (let [tx (if (true? tx) identity tx)]
                           (some-> (get m k) tx)))
                       m)
        xf           (comp (keep getter)
                           (map str/trim)
                           (remove str/blank?))]
    (->> (into [] xf search-terms)
         (str/join " "))))

(defn- embeddable-text
  "Generate labeled text for semantic search embeddings.
  Format:
    [model]
    field1: value1
    field2: value2

  Note: Unlike searchable-text, transformation functions in search-terms
  (e.g., explode-camel-case) are NOT applied. Transformations like camel-case
  explosion are specific to full-text search optimization."
  [m]
  (let [search-terms (:search-terms (search.spec/spec (:model m)))
        field-keys   (cond-> search-terms (map? search-terms) keys)
        header       (str "[" (:model m) "]")
        fields        (keep (fn [k]
                              (let [v (get m k)]
                                (when (not (str/blank? (str v)))
                                  (str (name k) ": " (str/trim (str v))))))
                            field-keys)]
    (str header "\n" (str/join "\n" fields))))

(defn- search-term-columns
  "Extract column names from search-terms spec for SQL query generation"
  [search-terms]
  (if (map? search-terms) (keys search-terms) search-terms))

(defn- display-data [m]
  (perf/select-keys m [:name :display_name :description :collection_name]))

(defn- execute-function-attr
  "Execute a single function attribute and return the result"
  [attr-key attr-def record]
  (try
    (let [f (:fn attr-def)
          fields (:fields attr-def)
          input (if fields
                  (select-keys record fields)
                  record)]
      (f input))
    (catch Exception e
      (log/warn e "Function execution failed for attribute" attr-key)
      false)))

(defn- execute-all-function-attrs
  "Execute all function attributes for a given spec and return computed values"
  [spec record]
  (reduce-kv
   (fn [acc attr-key attr-def]
     (if (search.spec/function-attr? attr-def)
       (let [snake-key (keyword (u/->snake_case_en (name attr-key)))]
         (assoc acc snake-key (execute-function-attr attr-key attr-def record)))
       acc))
   {}
   (:attrs spec)))

(defn- ->document [m]
  (let [spec (search.spec/spec (:model m))
        fn-results (execute-all-function-attrs spec m)
        sql-results (-> m
                        (perf/select-keys
                         (into [:model] search.spec/attr-columns))
                        (update :archived boolean)
                        (assoc
                         :display_data (display-data m)
                         :legacy_input (dissoc m :pinned :view_count :last_viewed_at :native_query)
                         :searchable_text (searchable-text m)
                         :embeddable_text (embeddable-text m)))]
    (merge fn-results sql-results)))

(defn- attrs->select-items [attrs]
  (for [[k v] attrs
        :when (and v (not (search.spec/function-attr? v)))]
    (let [as (keyword (u/->snake_case_en (name k)))]
      (if (true? v) as [v as]))))

(defn- spec-index-query*
  [search-model]
  (let [spec         (search.spec/spec search-model)
        fn-deps      (search.spec/collect-fn-attr-req-fields spec)
        fn-selects   (map (fn [field]
                            [(keyword (str "this." (name field))) field])
                          fn-deps)
        search-terms (set (search-term-columns (:search-terms spec)))]
    (u/remove-nils
     {:select    (search.spec/qualify-columns :this
                                              (concat
                                               (map (fn [term] [(searchable-value-trim-sql (keyword (str "this." (name term))))
                                                                term])
                                                    search-terms)
                                               (mapcat (fn [k] (attrs->select-items
                                                                (->> (get spec k)
                                                                     (remove (comp search-terms key)))))
                                                       [:attrs :render-terms])
                                               fn-selects))
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
  (let [models search.spec/search-models
        ;; we're pushing indexed entities last in the search items reducible
        ;; so that more important models gets indexed first, making the partial
        ;; index more usable earlier
        sorted-models (cond-> models
                        (contains? models "indexed-entity")
                        (-> (disj "indexed-entity") (concat ["indexed-entity"])))]
    (reduce u/rconcat [] (map spec-index-reducible sorted-models))))

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

(defn search-items-count
  "Returns a count of all searchable items in the database."
  []
  (->> (for [model search.spec/search-models]
         (-> (spec-index-query-where model nil)
             (assoc :select [[:%count.* :count]])
             t2/query
             first
             :count))
       (filter some?)
       (reduce + 0)))

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
    (let [timer (u/start-timer)
          update-report (reduce (fn [_ batch] (search.engine/update! e batch)) nil
                                (eduction (partition-all 150) documents-reducible))
          delete-report (reduce (fn [acc batch]
                                  (->> batch
                                       (remove nil?)
                                       (u/group-by first second)
                                       (map (fn [[group ids]] (search.engine/delete! e group ids)))
                                       (apply merge-with + acc))) {}
                                (eduction (partition-all 1000) removed-models-reducible))
          duration (u/since-ms timer)]
      (log/debugf "Updated search entries in %.0fms Updated: %s Deleted: %s" duration (sort-by (comp - val) update-report) (sort-by (comp - val) delete-report))
      (analytics/inc! :metabase-search/index-update-ms duration)
      (prometheus/observe! :metabase-search/index-update-duration-ms duration)
      (doseq [[model cnt] (merge-with + update-report delete-report)]
        (analytics/inc! :metabase-search/index-updates {:model model} cnt)))))

(comment
  (u/group-by first second [["metric" 124] ["dataset" 124] ["metric" 124] ["other" 5]]))

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
  "Process the given search model updates."
  [updates]
  (lib-be/with-metadata-provider-cache
    (if (seq (search.engine/active-engines))
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

        (update! documents to-delete))
      {})))

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

(defn start-listener!
  "Starts the ingestion listener on the queue"
  []
  (when (seq (search.engine/active-engines))
    (queue/listen! listener-name queue bulk-ingest!
                   {:success-handler     (fn [_result _duration _]
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
                    :max-next-ms       100})))
