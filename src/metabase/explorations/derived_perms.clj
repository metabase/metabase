(ns metabase.explorations.derived-perms
  "Decides whether the *current user* may see an exploration thread's derived read-data — its
  queries, the block/page tree built from them, the thread name, and the AI Summary document's
  content. All of these embed verbatim values from results computed under the exploration
  creator's data-access lens (sandboxing / connection impersonation / database routing), so a
  viewer whose lens is incompatible with the creator's must not see them.

  The per-result rule is exactly the cached-read gate the results themselves are streamed
  through ([[metabase.queries.cached-result]]): the viewer must hold the data perms to run the
  underlying query AND a lens compatible with the one the snapshot was computed under (nil
  token => creator+admin-only; token computation throwing => deny). This namespace only rolls
  that per-`StoredResult` verdict up to thread granularity: a thread's derived data is visible
  when every stored result backing it is, so a viewer never sees a tree whose labels embed
  values from a result they couldn't stream."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.queries.core :as queries]
   [toucan2.core :as t2]))

(defn- stored-result-visible?
  "Whether the current user may see values derived from `stored-result`. The creator always may —
  the snapshot was computed under their own lens (the runner binds them for the QP run)."
  [stored-result]
  (or (= (:creator_id stored-result) api/*current-user-id*)
      (queries/viewer-can-view-cached-result? stored-result)))

(defn thread-ids-with-visible-derived-data
  "The subset of `thread-ids` whose derived read-data the current user may see: every
  `StoredResult` backing the thread's materialized queries must pass
  [[stored-result-visible?]]. Threads with no materialized results yet have nothing computed
  under anyone's lens, so they stay visible. Returns a set."
  [thread-ids]
  (let [thread-ids (set thread-ids)]
    (if (empty? thread-ids)
      #{}
      (let [queries      (t2/select [:model/ExplorationQuery :id :exploration_thread_id]
                                    :exploration_thread_id [:in thread-ids])
            thread-id-of (into {} (map (juxt :id :exploration_thread_id)) queries)
            links        (when (seq queries)
                           (t2/select [:model/ExplorationQueryResult
                                       :exploration_query_id :stored_result_id]
                                      :exploration_query_id [:in (map :id queries)]))
            sr-visible?  (if (seq links)
                           (into {}
                                 (map (juxt :id stored-result-visible?))
                                 (t2/select [:model/StoredResult
                                             :id :creator_id :database_id
                                             :dataset_query :data_access_token]
                                            :id [:in (into #{} (map :stored_result_id) links)]))
                           {})
            blocked      (into #{}
                               (comp (remove #(get sr-visible? (:stored_result_id %) false))
                                     (keep #(thread-id-of (:exploration_query_id %))))
                               links)]
        (set/difference thread-ids blocked)))))

(defn doc-content-visible-to-current-user?
  "Content-visibility gate installed via
  [[metabase.documents.core/register-doc-content-visibility-fn!]] at init: a document owned by
  an exploration thread (the AI Summary) embeds verbatim result values, so its content follows
  the thread's derived-data visibility. Documents outside explorations are unaffected."
  [document]
  (if-let [thread-id (:exploration_thread_id document)]
    (contains? (thread-ids-with-visible-derived-data [thread-id]) thread-id)
    true))
