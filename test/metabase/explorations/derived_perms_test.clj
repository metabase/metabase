(ns metabase.explorations.derived-perms-test
  "Thread-granularity rollup of the per-snapshot data-access gate. The sandbox/impersonation/routing
  lens dimensions are covered end-to-end in `metabase-enterprise.sandbox.explorations-test`; these
  cover the rollup itself — the fail-closed default (which the creator gets no exemption from), and
  the batching that must not merge snapshots requiring different permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.core :as documents]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-query
  "A count metric over `table-kw`, so different tables mean genuinely different required perms."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
                           (lib/aggregate (lib/count))))))

(defn- thread-with-snapshots!
  "A thread whose queries are each finalized (`dataset_query` + `data_access_token` stamped, as the
  runner's `finalize-row!` does) and backed by one StoredResult built from `snapshot-specs`
  (`{:creator-id, :table, :token}`, or `:query` in place of `:table` for a shape `count-query`
  can't express). Returns the thread id."
  [snapshot-specs]
  (let [creator (mt/user->id :lucky)
        card    (t2/insert-returning-pk! :model/Card
                                         {:name "m" :type :metric :creator_id creator
                                          :database_id (mt/id) :dataset_query (count-query :venues)
                                          :display "table" :visualization_settings {}})
        expl    (t2/insert-returning-pk! :model/Exploration {:name "derived" :creator_id creator})
        thread  (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id expl :position 0})
        block   (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id thread})]
    (doseq [[i {:keys [creator-id table token query]}] (map-indexed vector snapshot-specs)]
      (let [dq   (or query (count-query table))
            page (t2/insert-returning-pk! :model/ExplorationPage
                                          {:exploration_block_id block :card_id card
                                           :dimension_id "d1" :query_type "default"})
            q    (t2/insert-returning-pk! :model/ExplorationQuery
                                          {:exploration_thread_id thread :card_id card
                                           :database_id (mt/id) :page_id page
                                           :dimension_id "d1" :dataset_query dq
                                           :data_access_token token
                                           :status "done" :position i})
            sr   (t2/insert-returning-pk! :model/StoredResult
                                          {:result_data       (byte-array [0])
                                           :creator_id        creator-id
                                           :database_id       (mt/id)
                                           :dataset_query     dq
                                           :row_count         1
                                           :data_access_token token})]
        (t2/insert! :model/ExplorationQueryResult
                    {:exploration_query_id q :stored_result_id sr})))
    thread))

(defn- visible? [thread-id user-kw]
  (request/with-current-user (mt/user->id user-kw)
    (contains? (derived-perms/thread-ids-with-visible-derived-data [thread-id]) thread-id)))

(defn- drilled-thread!
  "What `POST /:id/explore-further` persists: a thread whose `name` embeds the warehouse value the
  drilling user clicked, stamped with the lens they saw it under, plus the copied block carrying the
  metric Card the value was read from. Its one query is finalized under the same lens. Returns the
  thread id."
  [token]
  (let [creator (mt/user->id :lucky)
        card    (t2/insert-returning-pk! :model/Card
                                         {:name "m" :type :metric :creator_id creator
                                          :database_id (mt/id) :dataset_query (count-query :venues)
                                          :display "table" :visualization_settings {}})
        expl    (t2/insert-returning-pk! :model/Exploration {:name "drill" :creator_id creator})
        src     (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id expl :position 0})
        srcblk  (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id src})
        srcpage (t2/insert-returning-pk! :model/ExplorationPage
                                         {:exploration_block_id srcblk :card_id card
                                          :dimension_id "d1" :query_type "default"})
        thread  (t2/insert-returning-pk! :model/ExplorationThread
                                         {:exploration_id    expl
                                          :position          1
                                          :name              "Number of Orders → Customer: ACME Corp"
                                          :source_page_id    srcpage
                                          :data_access_token token})
        block   (t2/insert-returning-pk! :model/ExplorationBlock
                                         {:exploration_thread_id thread
                                          :metrics               [{:card_id card}]
                                          :position              0})
        page    (t2/insert-returning-pk! :model/ExplorationPage
                                         {:exploration_block_id block :card_id card
                                          :dimension_id "d1" :query_type "default"})]
    (t2/insert! :model/ExplorationQuery
                {:exploration_thread_id thread :card_id card
                 :database_id (mt/id) :page_id page
                 :dimension_id "d1" :dataset_query (count-query :venues)
                 :data_access_token token
                 :status "done" :position 0})
    thread))

(deftest thread-with-no-results-stays-visible-test
  (testing "a thread with nothing materialized has no values computed under anyone's lens"
    (let [thread (thread-with-snapshots! [])]
      (is (true? (visible? thread :rasta))))))

(deftest drill-named-thread-verdict-survives-losing-its-queries-test
  (testing "an \"Explore further\" thread is named for the warehouse value the creator clicked, and
            that name is durable in a way the thread's queries are not: restart deletes every
            `exploration_query` row, and a thread whose queries all error never produces a result at
            all. Neither changes any viewer's permissions, so neither may change the verdict — it
            has to come from the lens stamped on the thread itself."
    (testing "control — a viewer whose lens matches the one the value was seen under"
      (let [thread (drilled-thread! {})]
        (is (true? (visible? thread :rasta)))))
    (let [thread (drilled-thread! {:sandbox {1 "creators-sandbox-digest"}})]
      (testing "an incompatible lens is blocked while the thread's queries are intact"
        (is (false? (visible? thread :rasta))))
      (testing "and stays blocked once they are gone — the state restart leaves behind"
        (t2/delete! :model/ExplorationQuery :exploration_thread_id thread)
        (is (false? (visible? thread :rasta))
            "the drilled value outlives the queries, so the verdict protecting it must too")
        (is (true? (visible? thread :crowberto)) "superuser")))))

(deftest drill-named-thread-stays-blocked-when-its-metric-card-is-deleted-test
  (testing "the thread stamp is adjudicated against its metric Card, but that Card does not outlive a
            delete: `exploration_query.card_id` and `exploration_page.card_id` both cascade, so
            deleting the Card destroys exactly the rows the gate reads while leaving the drilled name
            (and the block's `explore_filters`) behind. Resolving no Card must therefore deny, not
            drop the thread from adjudication — dropping it reads as \"nothing to hide\", the same
            absence-means-visible mistake this namespace exists to avoid."
    (let [thread  (drilled-thread! {:sandbox {1 "creators-sandbox-digest"}})
          card-id (-> (t2/select-one :model/ExplorationBlock :exploration_thread_id thread)
                      :metrics first :card_id)]
      (testing "control — blocked while the Card is intact"
        (is (false? (visible? thread :rasta))))
      (testing "and stays blocked once the Card (and with it every query row) is gone"
        (t2/delete! :model/Card :id card-id)
        (is (empty? (t2/select :model/ExplorationQuery :exploration_thread_id thread))
            "sanity: the card FK cascaded the query rows away")
        (is (some? (t2/select-one-fn :name :model/ExplorationThread :id thread))
            "sanity: the drilled name survived, so there is still something to protect")
        (is (false? (visible? thread :rasta))
            "deleting a Card is not a permission change; it must not unblock the drilled value")
        (is (true? (visible? thread :crowberto)) "superuser")))))

(deftest nil-token-is-fail-closed-including-for-the-creator-test
  (testing "a snapshot with no captured lens can't be compared against, so it is fail-closed for
            everyone but an admin. Being the snapshot's creator is NOT an exemption: the creator's
            permissions may have changed since the snapshot, and with no token we can't tell — so a
            non-admin creator is denied exactly like any other non-admin viewer."
    (let [creator-thread (thread-with-snapshots! [{:creator-id (mt/user->id :rasta) :table :venues :token nil}])]
      (is (false? (visible? creator-thread :rasta))
          "the creator gets no bypass — a nil token is fail-closed for them too")
      (is (true? (visible? creator-thread :crowberto)) "superuser"))
    (let [other-thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token nil}])]
      (is (false? (visible? other-thread :rasta)) "and for a non-creator")
      (is (true? (visible? other-thread :crowberto)) "superuser"))))

(deftest batching-does-not-merge-snapshots-needing-different-perms-test
  (testing "the rollup evaluates one verdict per distinct permission shape rather than per snapshot.
            Two snapshots in a thread that differ ONLY by source table must not share a verdict: if
            the viewer can query one table but not the other, the thread is blocked"
    (mt/with-no-data-perms-for-all-users!
      (let [group (perms-group/all-users)]
        (perms/set-table-permission! group (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder)
        (testing "control: a thread backed only by the readable table is visible"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}])]
            (is (true? (visible? thread :rasta)))))
        (testing "a second snapshot over an unreadable table blocks the whole thread"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}
                                                {:creator-id (mt/user->id :lucky) :table :checkins :token {}}])]
            (is (false? (visible? thread :rasta))
                "if the two snapshots were collapsed into one verdict this would wrongly pass")))))))

(defn- fk-breakout-query
  "A venues count broken out through an FK, so it *reads* `categories` while its raw source-ids stay
  `#{venues}` — only preprocessing surfaces the second table. The mechanical planner emits these
  routinely: metric dimensions are computed with `:include-implicitly-joinable? true`."
  []
  (let [mp   (mt/metadata-provider)
        base (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                 (lib/aggregate (lib/count)))]
    (lib/->legacy-MBQL
     (lib/breakout base (first (filter :fk-field-id (lib/breakoutable-columns base)))))))

(deftest batching-does-not-merge-a-plain-breakout-with-an-fk-traversed-one-test
  (testing "the two halves of the verdict project the query differently — perms from the raw query,
            the lens from the resolved one. A plain breakout and an FK-traversed breakout on the same
            source share a raw projection while reading different tables, so a key built from the raw
            projection alone would collapse them into one verdict and hand the viewer a chart reading
            a table they are blocked on."
    (mt/with-no-data-perms-for-all-users!
      (let [group (perms-group/all-users)]
        (perms/set-table-permission! group (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder)
        (testing "control: the plain breakout alone is visible"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}])]
            (is (true? (visible? thread :rasta)))))
        (testing "adding the FK-traversed one blocks the thread"
          (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}
                                                {:creator-id (mt/user->id :lucky) :query (fk-breakout-query) :token {}}])]
            (is (false? (visible? thread :rasta))
                "collapsed into one verdict, whichever row was picked would decide for both")))))))

(defn- plain-table-query
  "A plain, unaggregated query over `table-kw` — a shape that works as a join source."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (lib/query mp (lib.metadata/table mp (mt/id table-kw))))))

(defn- card-joined-query
  "A venues count joined to a saved card that itself reads venues. Both of the key's query
  projections collapse onto `#{venues}` — the raw one never sees the join's `\"card__N\"` source, and
  the resolved one keeps only table ids — yet running this *also* requires read permission on the
  joined card's collection, which is the half of the verdict neither projection carries."
  [joined-card-id]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :aggregation  [[:count]]
              :joins        [{:source-table (str "card__" joined-card-id)
                              :alias        "J"
                              :fields       :none
                              :condition    [:= [:field (mt/id :venues :id) nil]
                                             [:field (mt/id :venues :id) {:join-alias "J"}]]}]}})

(deftest batching-does-not-merge-a-plain-query-with-a-card-joined-one-test
  (testing "the verdict has a third projection the key must carry: `can-run-query?` reads `:card-ids`
            off the *preprocessed* query and checks read perms on each card's collection. A plain
            breakout and one joined to a saved card over the same table agree on both projections the
            key does carry, so keyed on those alone they share a verdict — and a viewer who can query
            the table but cannot read the joined card is handed the card-joined chart's derived text."
    (mt/with-temp [:model/Collection {:as coll coll-id :id} {}
                   :model/Card {joined :id} {:name          "joined"
                                             :type          :question
                                             :collection_id coll-id
                                             :creator_id    (mt/user->id :lucky)
                                             :database_id   (mt/id)
                                             :dataset_query (plain-table-query :venues)
                                             :display       "table"
                                             :visualization_settings {}}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (mt/with-no-data-perms-for-all-users!
          (let [group (perms-group/all-users)]
            (perms/set-table-permission! group (mt/id :venues) :perms/view-data :unrestricted)
            (perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder)
            (testing "sanity: rasta can query venues but cannot read the joined card"
              (is (false? (boolean (request/with-current-user (mt/user->id :rasta)
                                     (mi/can-read? (t2/select-one :model/Card :id joined)))))))
            (testing "control: the plain query alone is visible"
              (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}])]
                (is (true? (visible? thread :rasta)))))
            (testing "adding the card-joined one blocks the thread"
              (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token {}}
                                                    {:creator-id (mt/user->id :lucky)
                                                     :query      (card-joined-query joined)
                                                     :token      {}}])]
                (is (false? (visible? thread :rasta))
                    "collapsed into one verdict, the plain row decides for the card-joined one")))))))))

(deftest verdict-runs-once-per-group-not-once-per-chart-test
  (testing "this rollup runs on polled read paths and the verdict it batches is worth ~a dozen
            app-DB queries every time it runs. Charts sharing a permission shape must resolve to one
            group and be adjudicated once, however many of them a thread grows."
    (let [specs    (fn [n] (repeat n {:creator-id (mt/user->id :lucky) :table :venues :token {}}))
          verdicts (fn [n]
                     (let [thread (thread-with-snapshots! (specs n))
                           calls  (atom 0)]
                       (dynamic-redefs/with-dynamic-fn-redefs
                         [queries/viewer-can-view-cached-result? (fn [_] (swap! calls inc) true)]
                         (request/with-current-user (mt/user->id :rasta)
                           (derived-perms/thread-ids-with-visible-derived-data [thread])))
                       @calls))]
      (is (= 1 (verdicts 2)))
      (is (= 1 (verdicts 25))
          "one verdict for the group — before batching, 25 charts cost 25 of them"))))

(deftest verdict-cost-grows-only-with-distinct-chart-shapes-test
  (testing "grouping cannot be free: [[visibility-key]] resolves each chart's query, because the
            lens half of the verdict compares *resolved* tables and two charts can share a raw
            footprint while reading different ones. That resolution is per chart and mostly metadata
            reads, so cost grows — but it must stay far below re-running the verdict itself, which
            would be ~13 queries a chart (~325 for 25)."
    (let [specs   (fn [n] (repeat n {:creator-id (mt/user->id :lucky) :table :venues :token {}}))
          measure (fn [n]
                    (let [thread (thread-with-snapshots! (specs n))]
                      (request/with-current-user (mt/user->id :rasta)
                        (t2/with-call-count [call-count]
                          (derived-perms/thread-ids-with-visible-derived-data [thread])
                          (call-count)))))
          small   (measure 2)
          large   (measure 25)]
      (is (< large (* 2 small))
          (format "resolution must stay cheap (2 charts: %d queries, 25 charts: %d)" small large)))))

;;; --------------------------------- Summary-document content gate ---------------------------------

(defn- doc-content-visible? [document user-kw]
  (request/with-current-user (mt/user->id user-kw)
    (derived-perms/doc-content-visible-to-current-user? document)))

(deftest doc-content-gate-does-not-fail-open-on-a-partial-select-test
  (testing "a Summary document whose exploration the viewer may not see"
    (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token nil}])
          expl   (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread)]
      (mt/with-temp [:model/Document {doc-id :id} {:exploration_id expl :creator_id (mt/user->id :lucky)}]
        (testing "is denied when the instance carries :exploration_id"
          (is (false? (boolean (doc-content-visible? (t2/select-one :model/Document :id doc-id) :rasta)))))
        (testing "is denied on a partial select too — the shape `collection-children-query` produces, which omits :exploration_id"
          (is (false? (boolean (doc-content-visible? (t2/select-one [:model/Document :id :name] :id doc-id) :rasta)))))
        (testing "is denied for an instance carrying neither :exploration_id nor :id — nothing left to adjudicate on"
          (is (false? (boolean (doc-content-visible? {:name "Summary"} :rasta)))))))))

(deftest doc-content-gate-leaves-ordinary-documents-alone-test
  (testing "a document with no owning exploration is visible, on a full or partial select"
    (mt/with-temp [:model/Document {doc-id :id} {:creator_id (mt/user->id :lucky)}]
      (is (true? (boolean (doc-content-visible? (t2/select-one :model/Document :id doc-id) :rasta))))
      (is (true? (boolean (doc-content-visible? (t2/select-one [:model/Document :id :name] :id doc-id) :rasta)))))))

;;; --------------------------- Cards scoped to a gated Summary document ---------------------------

(defn- card-readable? [card-id user-kw]
  (request/with-current-user (mt/user->id user-kw)
    (boolean (mi/can-read? (t2/select-one :model/Card :id card-id)))))

(deftest card-scoped-to-a-gated-document-is-not-readable-test
  (testing "a Card scoped to an exploration Summary document"
    (let [thread (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token nil}])
          expl   (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread)]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document   {doc-id :id}  {:exploration_id expl
                                                      :collection_id  coll-id
                                                      :creator_id     (mt/user->id :lucky)}
                     ;; The ephemeral Summary card: its name and dataset_query are copied from the
                     ;; ExplorationQuery, which embeds dimension values discovered under the
                     ;; creator's lens.
                     :model/Card       {card-id :id} {:collection_id coll-id
                                                      :document_id   doc-id
                                                      :name          "Orders for Customer = ACME Corp over time"}
                     ;; A sibling card in the same collection, owned by no document.
                     :model/Card       {plain-id :id} {:collection_id coll-id :name "Plain card"}]
        ;; Collection read must PASS, so that anything denied below is denied by the content gate
        ;; and not merely by collection permissions.
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (testing "sanity: the owning Summary document is itself gated for this viewer"
          (is (false? (boolean (request/with-current-user (mt/user->id :rasta)
                                 (mi/can-read? (t2/select-one :model/Document :id doc-id)))))))
        (testing "is not readable by a viewer whose data-access lens is incompatible, even though they can read the collection"
          (is (false? (card-readable? card-id :rasta))))
        (testing "is still readable by a superuser, matching the gate's standing exemption"
          (is (true? (card-readable? card-id :crowberto))))
        (testing "leaves cards that belong to no document alone"
          (is (true? (card-readable? plain-id :rasta))))))))

(deftest card-scoped-to-an-ordinary-document-is-unaffected-test
  (testing "a Card scoped to a Document with no owning exploration is readable on collection perms alone"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document   {doc-id :id}  {:collection_id coll-id
                                                    :creator_id    (mt/user->id :lucky)}
                   :model/Card       {card-id :id} {:collection_id coll-id :document_id doc-id}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
      (is (true? (card-readable? card-id :rasta))))))

;;; ------------------------- comment context on a gated exploration -------------------------

(defn- page-id-for-thread [thread-id]
  (t2/select-one-fn :id :model/ExplorationPage
                    {:select [:p.id]
                     :from   [[:exploration_page :p]]
                     :join   [[:exploration_block :b] [:= :b.id :p.exploration_block_id]]
                     :where  [:= :b.exploration_thread_id thread-id]}))

(defn- comment-contexts [exploration-id user-kw]
  (->> (mt/user-http-request user-kw :get 200 "comment/"
                             :target_type "exploration"
                             :target_id exploration-id)
       :comments
       (mapv :context)))

(deftest exploration-comment-context-is-gated-test
  (testing "a comment anchored to a chart point of an exploration the viewer is gated out of"
    (let [thread  (thread-with-snapshots! [{:creator-id (mt/user->id :lucky) :table :venues :token nil}])
          expl-id (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread)
          page-id (page-id-for-thread thread)]
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        ;; Put the exploration somewhere the viewer can read, so anything withheld below is withheld
        ;; by the data-access gate rather than by collection permissions.
        (t2/update! :model/Exploration expl-id {:collection_id coll-id})
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (mt/user-http-request :lucky :post 200 "comment/"
                              {:target_type     "exploration"
                               :target_id       expl-id
                               :child_target_id (str page-id)
                               :content         {:type "doc" :content []}
                               :context         {:highlighted     {:columnName "CATEGORY"
                                                                   :dimensions [{:columnName "CATEGORY"
                                                                                 :value "ACME Corp"}]}
                                                 :highlight_label "ACME Corp"}})
        (testing "keeps its context for a superuser, who is exempt from the gate"
          (is (=? [{:highlighted     {:columnName "CATEGORY"}
                    :highlight_label "ACME Corp"}]
                  (comment-contexts expl-id :crowberto))))
        (testing "is stripped of its context for a viewer whose data-access lens is incompatible —
                  the comment itself remains readable, only the warehouse values it carries are withheld"
          (let [contexts (comment-contexts expl-id :rasta)]
            (is (= 1 (count contexts)) "the comment is still listed")
            (is (= [nil] contexts) "but carries no context")))))))

(deftest content-gate-verdict-is-memoized-within-a-scope-test
  (testing "every Card in a Summary document shares one document, and therefore one verdict. Without
            memoization each card re-runs the whole rollup — ~20 app-DB queries apiece — so a
            document's cards cost N times what one costs. Bulk read paths scope the cache
            themselves; see the callers of `with-content-gate-cache`."
    (let [thread  (thread-with-snapshots! (repeat 5 {:creator-id (mt/user->id :lucky)
                                                     :table :venues :token {}}))
          expl-id (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread)]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document   {doc-id :id} {:exploration_id expl-id
                                                     :collection_id  coll-id
                                                     :creator_id     (mt/user->id :lucky)}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (let [card-ids (vec (for [_ (range 10)]
                              (t2/insert-returning-pk! :model/Card
                                                       {:name "c" :creator_id (mt/user->id :lucky)
                                                        :database_id (mt/id)
                                                        :dataset_query (count-query :venues)
                                                        :display "table" :visualization_settings {}
                                                        :collection_id coll-id :document_id doc-id})))]
          (request/with-current-user (mt/user->id :rasta)
            (let [cards (t2/select :model/Card :id [:in card-ids])
                  measure (fn [instances]
                            (documents/with-content-gate-cache
                              (t2/with-call-count [call-count]
                                (doseq [card instances] (mi/can-read? card))
                                (call-count))))
                  one (measure [(first cards)])
                  ten (measure cards)]
              (is (< ten (* 2 one))
                  (format "one verdict should serve every card (1 card: %d queries, 10 cards: %d)"
                          one ten)))))))))
