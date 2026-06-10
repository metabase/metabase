(ns metabase.explorations.document-perms
  "Gate the *content* of exploration-attached documents (the AI Summary) by the viewer's
  data-access lens. The summary embeds verbatim values from the creator's (possibly
  sandboxed/impersonated/routed) query results, so a collaborator whose lens differs must not read
  it — even though they can see the exploration shell via collection perms.

  Installed into the documents module's `can-read?`/`can-write?` chokepoint at init. The module
  dependency only runs one way (explorations -> documents), so documents calls back in through a
  registered hook rather than requiring explorations directly."
  (:require
   [metabase.api.common :as api]
   [metabase.queries.core :as queries]
   [toucan2.core :as t2]))

(defn- thread-stored-results
  "All `stored_result`s feeding exploration thread `thread-id` (one per completed query).
  Pending/errored queries have no stored_result and contribute nothing to the AI summary."
  [thread-id]
  (let [eq-ids (t2/select-pks-set :model/ExplorationQuery :exploration_thread_id thread-id)
        sr-ids (when (seq eq-ids)
                 (t2/select-fn-set :stored_result_id :model/ExplorationQueryResult
                                   :exploration_query_id [:in eq-ids]))]
    (when (seq sr-ids)
      (t2/select :model/StoredResult :id [:in sr-ids]))))

(defn doc-content-visible-to-current-user?
  "True when the current user may see the derived content of `doc`. Documents not attached to an
  exploration thread are always visible; for exploration-attached documents, the viewer's
  data-access lens must be compatible with EVERY query result the thread synthesizes (the AI
  summary mixes values across all of them). The exploration's creator always sees their own
  summary. Takes the whole `doc` so the policy can later be narrowed to specific document kinds."
  [doc]
  (or (nil? (:exploration_thread_id doc))
      (let [stored-results (thread-stored-results (:exploration_thread_id doc))]
        (every? (fn [sr]
                  (or (= api/*current-user-id* (:creator_id sr))
                      (queries/viewer-can-view-cached-result? sr)))
                stored-results))))
