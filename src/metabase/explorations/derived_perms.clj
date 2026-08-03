(ns metabase.explorations.derived-perms
  "Decides whether the *current user* may see an exploration thread's derived read-data — its
  queries, the block/page tree built from them, the thread name, and the AI Summary document's
  content. All of these embed verbatim values from results computed under the exploration
  creator's data-access lens (sandboxing / connection impersonation / database routing), so a
  viewer whose lens is incompatible with the creator's must not see them.

  The per-artifact rule is exactly the gate the results themselves are streamed through
  ([[metabase.queries.cached-result]]): superusers pass unconditionally; any other viewer must hold
  the data perms to run the underlying query AND a lens compatible with the one the artifact was
  produced under (nil token or token computation throwing => denied). The gate is applied to *every*
  viewer, the creator included — being the creator once is not a permanent pass, since their own
  permissions may have narrowed since.

  What this namespace adds is *which rows* to adjudicate: the ones stamped with a lens when their
  content was produced. Those stamps live on `exploration_thread` and `exploration_query`, which
  outlive the snapshots they produce — restarting a thread deletes its query rows, and a thread whose
  every query errors never produces one at all. Taking the verdict from a `stored_result` instead
  would let its absence read as \"nothing to hide\"."
  (:require
   [clojure.set :as set]
   [metabase.lib-be.core :as lib-be]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- visibility-key
  "The inputs [[metabase.queries.cached-result/viewer-can-view-cached-result?]] actually depends on,
  so a batch can evaluate the verdict once per distinct key instead of once per artifact. The verdict
  turns on the artifact's database, its captured lens token, and the perms its query requires — not
  on who created it, so `creator_id` is deliberately absent from the key (two creators' artifacts
  over the same table + lens share a verdict).

  Keying on the `dataset_query` itself would never dedupe: an exploration's charts are variants
  over one metric card, so their queries differ textually while requiring identical permissions.

  The verdict's two halves project the query *differently*, so the key has to carry both or it is not
  a partition. `can-run-query?` derives its perms from the raw query via `query->source-ids`, while
  the lens comparison resolves the query first (`query->resolved-source-table-ids` preprocesses, which
  expands implicit joins and card chains). An FK-traversed breakout is the case that separates them:
  it reads an extra table while leaving the raw projection identical to a plain breakout on the same
  source, and metric dimensions are built with `:include-implicitly-joinable? true`, so a thread
  mixing the two is ordinary planner output rather than an exotic shape. Keyed on the raw projection
  alone, those two share a group, one representative decides for both, and a viewer restricted on the
  joined table is handed the one they cannot read.

  Neither projection accounts for every query — a raw source-card reference (`\"card__1\"`) matches
  none of `query->source-ids`'s patterns and yields nothing, and resolution *throws* on an
  unpreprocessable query (a deleted card in the source chain). Both fall back to a value that merges
  nothing it shouldn't: the whole query in the first case, and in the second a marker shared only
  with other unresolvable artifacts, which the lens check denies without exception.

  `resolve-tables` is the resolving half, passed in so a batch can share one memo — resolution is a
  pure function of the query (it runs as admin with the per-user lens skipped), so repeats are free
  to collapse."
  [resolve-tables {:keys [database_id dataset_query data_access_token]}]
  (let [source-ids (some-> dataset_query query-perms/query->source-ids)]
    [database_id data_access_token (resolve-tables dataset_query)
     (if (or (seq (:table-ids source-ids)) (seq (:card-ids source-ids)))
       source-ids
       dataset_query)]))

(defn- table-resolver
  "A memoized [[metabase.query-permissions.core/query->resolved-source-table-ids]] for one batch.
  Throws are absorbed into a marker rather than propagated: an unpreprocessable query (a deleted card
  in its source chain) is one the lens check denies anyway, and it must not take the batch down with
  it."
  []
  (memoize (fn [query]
             (try
               (some-> query query-perms/query->resolved-source-table-ids)
               (catch Throwable _ ::unresolvable)))))

(defn- finalized-queries
  "The `exploration_query` rows for `thread-ids` that can be adjudicated, in the shape the gate takes.

  A row becomes adjudicable when it has a `dataset_query`: the gate needs one for both the data-perms
  check and the lens comparison, and throws without it. That is also the step that stamps the token,
  so a row that has one but no token is a write-path bug — adjudicated and denied, not skipped."
  [thread-ids]
  (t2/select [:model/ExplorationQuery
              :id :exploration_thread_id :database_id :dataset_query :data_access_token]
             :exploration_thread_id [:in thread-ids]
             :dataset_query [:not= nil]
             {:order-by [[:id :asc]]}))

(defn- lens-stamped-threads
  "The `exploration_thread` rows for `thread-ids` carrying a tracked lens, in the shape the gate takes.

  A thread row, unlike a query row, has no query of its own, so the stamp is the only thing marking
  it as needing adjudication. Whatever wrote the token decided the row's content had to be held to a
  lens; this only enforces that.

  The query adjudicated is the thread's metric Card — what the token was computed over when it was
  stamped, and, unlike the thread's queries, not deleted by a restart."
  [thread-ids]
  (when-let [threads (seq (t2/select [:model/ExplorationThread :id :data_access_token]
                                     :id [:in thread-ids]
                                     :data_access_token [:not= nil]))]
    (let [blocks    (t2/select [:model/ExplorationBlock :exploration_thread_id :metrics]
                               :exploration_thread_id [:in (map :id threads)]
                               {:order-by [[:position :desc] [:id :desc]]})
          ;; descending order + `into {}` (later pairs win) leaves the thread's *first* block
          ;; standing, whose metric is the one the token was computed over.
          card-id   (into {} (keep (fn [b]
                                     (when-let [cid (:card_id (first (:metrics b)))]
                                       [(:exploration_thread_id b) cid])))
                          blocks)
          cards     (when (seq card-id)
                      ;; `:card_schema` is mandatory in any explicit Card column list
                      (u/index-by :id (t2/select [:model/Card :id :card_schema :database_id :dataset_query]
                                                 :id [:in (distinct (vals card-id))])))]
      (keep (fn [{thread-id :id :as thread}]
              (when-let [card (get cards (get card-id thread-id))]
                {:id                    thread-id
                 :exploration_thread_id thread-id
                 :database_id           (:database_id card)
                 :dataset_query         (:dataset_query card)
                 :data_access_token     (:data_access_token thread)}))
            threads))))

(defn- blocked-thread-ids
  "Thread ids with at least one artifact the current user may not see.

  Artifacts sharing a [[visibility-key]] share a verdict by construction, so grouping by it lets
  the expensive check run once per group rather than once per artifact."
  [artifacts]
  (->> (group-by (partial visibility-key (table-resolver)) artifacts)
       (remove (fn [[_key [representative]]]
                 (queries/viewer-can-view-cached-result? representative)))
       (mapcat val)
       (map :exploration_thread_id)
       set))

(defn thread-ids-with-visible-derived-data
  "The subset of `thread-ids` whose derived read-data the current user may see: every row carrying
  text derived from warehouse values must pass the gate
  ([[metabase.queries.cached-result/viewer-can-view-cached-result?]]) for the *current* user — the
  creator included. A thread carrying no such text yet stays visible, because there is nothing on it
  that was computed under anyone's lens. Returns a set.

  Held inside one metadata-provider cache: [[visibility-key]] preprocesses each artifact's query, and
  a thread's charts are variants over the same card, so they read the same tables and fields over and
  over. REST requests already arrive with a cache bound and the macro leaves it alone; this is for the
  callers that don't, such as the document-content gate below."
  [thread-ids]
  (let [thread-ids (set thread-ids)]
    (if (empty? thread-ids)
      #{}
      (lib-be/with-metadata-provider-cache
        (set/difference thread-ids
                        (blocked-thread-ids (concat (finalized-queries thread-ids)
                                                    (lens-stamped-threads thread-ids))))))))

(defn doc-content-visible-to-current-user?
  "Content-visibility gate installed via
  [[metabase.documents.core/register-doc-content-visibility-fn!]] at init: a document owned by
  an exploration thread (the AI Summary) embeds verbatim result values, so its content follows
  the thread's derived-data visibility. Documents outside explorations are unaffected."
  [document]
  (if-let [thread-id (:exploration_thread_id document)]
    (contains? (thread-ids-with-visible-derived-data [thread-id]) thread-id)
    true))
