(ns metabase.explorations.derived-perms
  "Decides whether the *current user* may see an exploration thread's derived read-data — its
  queries, the block/page tree built from them, the thread name, and the Summary document's
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
   [metabase.api.common :as api]
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

  The verdict's halves project the query *differently*, so the key has to carry each of them or it is
  not a partition. The lens comparison resolves the query first (`query->resolved-source-ids`
  preprocesses, expanding implicit joins and card chains); `can-run-query?` needs both the raw
  projection and the resolved one — the latter because `:card-ids` only exist after preprocessing and
  each one costs a read-permission check on that card's collection.

  Two cases separate them, both ordinary planner output rather than exotic shapes. An FK-traversed
  breakout reads an extra table while leaving the raw projection identical to a plain breakout on the
  same source (metric dimensions are built with `:include-implicitly-joinable? true`). A join to a
  saved card over that same table agrees on *both* table projections while requiring read permission
  on a collection the plain query does not. Miss either and those pairs share a group, one
  representative decides for both, and a viewer is handed the one they cannot read.

  Neither projection accounts for every query, and each failure falls back to a value that merges
  nothing it shouldn't:

  - a raw source-card reference (`\"card__1\"`) matches none of `query->source-ids`'s patterns and
    yields nothing => key on the whole query, which groups only with an identical one;
  - resolution *throws* on an unpreprocessable query (a deleted card in the source chain) =>
    `::unresolvable`, shared only with other unresolvable artifacts, which the lens check denies;
  - the raw projection throws (`merge-source-ids` does so explicitly) => `::unprojectable`, likewise
    shared only with other throwers, which the perms check denies for the same reason it threw.

  `resolve-source-ids` is the resolving half, passed in so a batch can share one memo — resolution is
  a pure function of the query (it runs as admin with the per-user lens skipped), so repeats are free
  to collapse."
  [resolve-source-ids {:keys [database_id dataset_query data_access_token]}]
  (let [source-ids (try
                     (some-> dataset_query query-perms/query->source-ids)
                     (catch Throwable _ ::unprojectable))]
    [database_id data_access_token (resolve-source-ids dataset_query)
     (cond
       (= ::unprojectable source-ids)                                  ::unprojectable
       (or (seq (:table-ids source-ids)) (seq (:card-ids source-ids))) source-ids
       :else                                                           dataset_query)]))

(defn- source-ids-resolver
  "A memoized [[metabase.query-permissions.core/query->resolved-source-ids]] for one batch.
  Throws are absorbed into a marker rather than propagated: an unpreprocessable query (a deleted card
  in its source chain) is one the lens check denies anyway, and it must not take the batch down with
  it."
  []
  (memoize (fn [query]
             (try
               (some-> query query-perms/query->resolved-source-ids)
               (catch Throwable _ ::unresolvable)))))

(defn- finalized-queries
  "The `exploration_query` rows for `thread-ids` that can be adjudicated, in the shape the gate takes.

  A row becomes adjudicable when it has a `dataset_query`: the gate needs one for both the data-perms
  check and the lens comparison, and throws without it. That is also the step that stamps the token,
  so a row that has one but no token is a write-path bug — adjudicated and denied, not skipped."
  [thread-ids]
  (t2/select [:model/ExplorationQuery
              :id :exploration_thread_id :database_id :dataset_query :data_access_token]
             'exploration_thread_id [:in thread-ids]
             'dataset_query [:not= nil]
             {'order-by [['id 'asc]]}))

(defn- lens-stamped-threads
  "The `exploration_thread` rows for `thread-ids` carrying a tracked lens, in the shape the gate takes.

  A thread row, unlike a query row, has no query of its own, so the stamp is the only thing marking
  it as needing adjudication. Whatever wrote the token decided the row's content had to be held to a
  lens; this only enforces that.

  The query adjudicated is the thread's metric Card — what the token was computed over when it was
  stamped, and, unlike the thread's queries, not deleted by a restart. A thread whose Card cannot be
  resolved is still returned, marked [[::indeterminate]] so it denies."
  [thread-ids]
  (when-let [threads (seq (t2/select [:model/ExplorationThread :id :data_access_token]
                                     'id [:in thread-ids]
                                     'data_access_token [:not= nil]))]
    (let [blocks    (t2/select [:model/ExplorationBlock :exploration_thread_id :metrics]
                               'exploration_thread_id [:in (map :id threads)]
                               {'order-by [['position 'desc] ['id 'desc]]})
          ;; descending order + `into {}` (later pairs win) leaves the thread's *first* block
          ;; standing, whose metric is the one the token was computed over.
          card-id   (into {} (keep (fn [b]
                                     (when-let [cid (:card_id (first (:metrics b)))]
                                       [(:exploration_thread_id b) cid])))
                          blocks)
          cards     (when (seq card-id)
                      ;; `:card_schema` is mandatory in any explicit Card column list
                      (u/index-by :id (t2/select [:model/Card :id :card_schema :database_id :dataset_query]
                                                 'id [:in (distinct (vals card-id))])))]
      (map (fn [{thread-id :id :as thread}]
             (let [card (get cards (get card-id thread-id))]
               (cond-> {:id                    thread-id
                        :exploration_thread_id thread-id
                        :database_id           (:database_id card)
                        :dataset_query         (:dataset_query card)
                        :data_access_token     (:data_access_token thread)}
                 ;; The Card is what the stamp was computed over, and it does not outlive a delete:
                 ;; both `exploration_query.card_id` and `exploration_page.card_id` cascade, so
                 ;; deleting it strips every other adjudicable row while the thread's name survives.
                 ;; Dropping the thread here would let that absence read as "nothing to hide".
                 (nil? card) (assoc ::indeterminate true))))
           threads))))

(defn- artifact-visible?
  "The gate's verdict for one artifact.

  An artifact marked [[::indeterminate]] has no query left to adjudicate, so the gate cannot be asked
  (it throws without a `:dataset_query`). It denies instead, leaving only the superuser exemption the
  gate itself would have applied — the same fail-closed choice [[source-ids-resolver]] makes for a
  query it cannot resolve."
  [artifact]
  (if (::indeterminate artifact)
    (boolean api/*is-superuser?*)
    (queries/viewer-can-view-cached-result? artifact)))

(defn- blocked-thread-ids
  "Thread ids with at least one artifact the current user may not see.

  Artifacts sharing a [[visibility-key]] share a verdict by construction, so grouping by it lets
  the expensive check run once per group rather than once per artifact."
  [artifacts]
  (->> (group-by (partial visibility-key (source-ids-resolver)) artifacts)
       (remove (fn [[_key [representative]]]
                 (artifact-visible? representative)))
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
  over. REST requests already arrive with a cache bound and the macro leaves it alone; this is for any
  caller that doesn't."
  [thread-ids]
  (let [thread-ids (set thread-ids)]
    (if (empty? thread-ids)
      #{}
      (lib-be/with-metadata-provider-cache
        (set/difference thread-ids
                        (blocked-thread-ids (concat (finalized-queries thread-ids)
                                                    (lens-stamped-threads thread-ids))))))))

(defn- exploration-content-visible?
  "The gate's verdict for a document owned by `exploration-id` (nil => not a Summary, unaffected)."
  [exploration-id]
  (if (nil? exploration-id)
    true
    (let [thread-ids (t2/select-pks-set :model/ExplorationThread 'exploration_id exploration-id)]
      (or (empty? thread-ids)
          (= thread-ids (thread-ids-with-visible-derived-data thread-ids))))))

(defn doc-content-visible-to-current-user?
  "Content-visibility gate installed via
  [[metabase.documents.core/register-doc-content-visibility-fn!]] at init: a document owned by
  an exploration (the Summary) embeds verbatim result values, so its content follows the
  exploration's threads' derived-data visibility. Documents outside explorations are unaffected."
  [document]
  (cond
    (contains? document :exploration_id)
    (exploration-content-visible? (:exploration_id document))

    (:id document)
    (exploration-content-visible?
     (t2/select-one-fn :exploration_id :model/Document 'id (:id document)))

    :else
    false))

(defn gate-comment-contexts
  "Withhold `:context` from `comments` on `exploration-id` whose data the current user may not see.

  A comment's context carries the identity of the chart point it is anchored to, including dimension
  values read out of the creator's result set — the same material
  [[metabase.explorations.api/gate-threads-derived-data]] redacts from the exploration itself. The
  comments endpoint cannot rely on its read check to cover that: an Exploration is read-checked on
  collection permissions alone, since the derived-data gate is applied by its read endpoints rather
  than by `can-read?`.

  The comment itself is left in place — conversations stay visible, only the values they carry are
  withheld. A comment anchored to a page of a thread the viewer can see keeps its context; anything
  else (a Summary block, an unanchored comment, or a page of a gated thread) loses it."
  [exploration-id comments]
  (let [thread-ids (t2/select-pks-set :model/ExplorationThread 'exploration_id exploration-id)]
    (if (or (empty? thread-ids) (not-any? :context comments))
      comments
      (let [visible (thread-ids-with-visible-derived-data thread-ids)]
        (if (= thread-ids visible)
          comments
          (let [page->thread (into {}
                                   (map (juxt :id :thread_id))
                                   (t2/query {'select [['p.id 'id] ['b.exploration_thread_id 'thread_id]]
                                              'from   [['exploration_page 'p]]
                                              'join   [['exploration_block 'b]
                                                       ['= 'b.id 'p.exploration_block_id]]
                                              'where  ['in 'b.exploration_thread_id (vec thread-ids)]}))]
            (mapv (fn [comment]
                    ;; A non-numeric `child_target_id` is a Summary block uuid, and a nil one is
                    ;; unanchored; both parse to nil and so fall through to the deny branch.
                    (let [thread-id (get page->thread (parse-long (str (:child_target_id comment))))]
                      (if (contains? visible thread-id)
                        comment
                        (dissoc comment :context))))
                  comments)))))))
