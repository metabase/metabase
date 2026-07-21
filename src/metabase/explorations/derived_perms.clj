(ns metabase.explorations.derived-perms
  "Decides whether the *current user* may see an exploration thread's derived read-data — its
  queries, the block/page tree built from them, the thread name, and the AI Summary document's
  content. All of these embed verbatim values from results computed under the exploration
  creator's data-access lens (sandboxing / connection impersonation / database routing), so a
  viewer whose lens is incompatible with the creator's must not see them.

  The per-result rule is exactly the cached-read gate the results themselves are streamed
  through ([[metabase.queries.cached-result]]): the viewer must hold the data perms to run the
  underlying query AND a lens compatible with the one the snapshot was computed under (nil
  token => admin-only; token computation throwing => deny). The gate is applied to *every*
  viewer, the snapshot's creator included — being the creator once is not a permanent pass, since
  the creator's own permissions may have narrowed since the snapshot was taken. This namespace
  only rolls that per-`StoredResult` verdict up to thread granularity: a thread's derived data is
  visible when every stored result backing it is, so a viewer never sees a tree whose labels embed
  values from a result they couldn't stream."
  (:require
   [clojure.set :as set]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [toucan2.core :as t2]))

(defn- visibility-key
  "The inputs [[metabase.queries.cached-result/viewer-can-view-cached-result?]] actually depends on,
  so a batch can evaluate the verdict once per distinct key instead of once per snapshot. The verdict
  turns on the snapshot's database, its captured lens token, and the perms its query requires — not
  on who created it, so `creator_id` is deliberately absent from the key (two creators' snapshots
  over the same table + lens share a verdict).

  Keying on the `dataset_query` itself would never dedupe: an exploration's charts are variants
  over one metric card, so their queries differ textually while requiring identical permissions.
  `query->source-ids` is the pure, no-DB projection that `required-perms-for-query` derives table
  and card perms from, so two snapshots sharing it require the same perms.

  It cannot account for every query — a raw source-card reference (`\"card__1\"`) matches none of
  its patterns and yields nothing. When it accounts for no source at all, we fall back to keying on
  the whole query so those snapshots are never merged with each other."
  [{:keys [database_id dataset_query data_access_token]}]
  (let [source-ids (some-> dataset_query query-perms/query->source-ids)]
    [database_id data_access_token
     (if (or (seq (:table-ids source-ids)) (seq (:card-ids source-ids)))
       source-ids
       dataset_query)]))

(defn- backing-snapshots
  "One row per (thread, backing `StoredResult`) pair for `thread-ids`, carrying the columns the
  verdict needs. `:dataset_query` is fetched separately by [[with-dataset-queries]] — it is a large
  blob and most callers here are polling."
  [thread-ids]
  (t2/select [:model/StoredResult
              :stored_result.id :stored_result.database_id
              :stored_result.data_access_token
              [:exploration_query.exploration_thread_id :exploration_thread_id]]
             {:join  [:exploration_query_result
                      [:= :exploration_query_result.stored_result_id :stored_result.id]
                      :exploration_query
                      [:= :exploration_query.id :exploration_query_result.exploration_query_id]]
              :where [:in :exploration_query.exploration_thread_id thread-ids]}))

(defn- with-dataset-queries
  "Attach `:dataset_query` to every snapshot. The verdict needs it for both the data-perms check and
  the lens comparison, so it is read for all of them — the poller's own snapshots included, since
  being the creator no longer exempts a snapshot from the gate. Fetched here rather than in
  [[backing-snapshots]] because it is a large blob, and read once per distinct `StoredResult` id so a
  blob shared across a thread's queries isn't fetched repeatedly."
  [snapshots]
  (let [ids   (into #{} (map :id) snapshots)
        by-id (when (seq ids)
                (t2/select-fn->fn :id :dataset_query
                                  [:model/StoredResult :id :dataset_query] :id [:in ids]))]
    (mapv #(cond-> % (contains? by-id (:id %)) (assoc :dataset_query (by-id (:id %))))
          snapshots)))

(defn- blocked-thread-ids
  "Thread ids with at least one backing snapshot the current user may not see.

  Snapshots sharing a [[visibility-key]] share a verdict by construction, so grouping by it lets
  the expensive check run once per group rather than once per snapshot."
  [snapshots]
  (->> (group-by visibility-key snapshots)
       (remove (fn [[_key [representative]]]
                 (queries/viewer-can-view-cached-result? representative)))
       (mapcat val)
       (map :exploration_thread_id)
       set))

(defn thread-ids-with-visible-derived-data
  "The subset of `thread-ids` whose derived read-data the current user may see: every
  `StoredResult` backing the thread's materialized queries must pass the cached-read gate
  ([[metabase.queries.cached-result/viewer-can-view-cached-result?]]) for the *current* user — the
  creator included. Threads with no materialized results yet have nothing computed under anyone's
  lens, so they stay visible. Returns a set."
  [thread-ids]
  (let [thread-ids (set thread-ids)]
    (if (empty? thread-ids)
      #{}
      (set/difference thread-ids
                      (-> (backing-snapshots thread-ids)
                          with-dataset-queries
                          blocked-thread-ids)))))

(defn doc-content-visible-to-current-user?
  "Content-visibility gate installed via
  [[metabase.documents.core/register-doc-content-visibility-fn!]] at init: a document owned by
  an exploration thread (the AI Summary) embeds verbatim result values, so its content follows
  the thread's derived-data visibility. Documents outside explorations are unaffected."
  [document]
  (if-let [thread-id (:exploration_thread_id document)]
    (contains? (thread-ids-with-visible-derived-data [thread-id]) thread-id)
    true))
