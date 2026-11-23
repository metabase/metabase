(ns metabase.collections.models.collection-archive-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.documents.models.document :as document]
   [metabase.events.test-util :as events.tu]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.native-query-snippets.models.native-query-snippet :as native-query-snippet]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.timeline.models.timeline :as timeline]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- archive!
  "Archives or restores the `model` row with `id` through the write function of the model."
  [model id archived?]
  (case model
    :model/Card               (card/update-cards! [{:id id :archived archived?}])
    :model/Collection         (collection/update-collections! [{:id id :archived archived?}] nil)
    :model/Dashboard          (dashboard/update-dashboards! [{:id id :archived archived?}])
    :model/Document           (document/update-documents! [{:id id :archived archived?}] nil)
    :model/Exploration        (exploration/update-explorations! [{:id id :archived archived?}] nil)
    :model/NativeQuerySnippet (native-query-snippet/update-snippets! [{:id id :archived archived?}] nil)))

(defn- row [model id]
  (t2/select-one model :id id))

(deftest archive-and-restore-collection-test
  (mt/with-temp [:model/Collection parent      {}
                 :model/Collection child       {:location (collection/children-location parent)}
                 :model/Collection direct-sub  {:location (collection/children-location parent)}
                 :model/Card       card        {:collection_id (u/the-id parent)}
                 :model/Card       child-card  {:collection_id (u/the-id child)}
                 :model/Card       direct-card {:collection_id (u/the-id parent)}
                 :model/Dashboard  dashboard   {:collection_id (u/the-id parent)}
                 :model/Card       dashboard-q {:collection_id (u/the-id parent) :dashboard_id (u/the-id dashboard)}
                 :model/Document   document    {:collection_id (u/the-id parent)}
                 :model/Card       document-q  {:collection_id (u/the-id parent) :document_id (u/the-id document)}
                 :model/Exploration exploration {:collection_id (u/the-id parent)}
                 :model/Timeline   timeline    {:collection_id (u/the-id parent)}
                 :model/TimelineEvent event    {:timeline_id (u/the-id timeline)}
                 :model/Pulse      pulse       {:collection_id (u/the-id parent)}]
    (archive! :model/Card (u/the-id direct-card) true)
    (archive! :model/Collection (u/the-id direct-sub) true)
    (let [direct-op-id (:archive_operation_id (row :model/Collection (u/the-id direct-sub)))]
      (archive! :model/Collection (u/the-id parent) true)
      (let [parent-op-id (:archive_operation_id (row :model/Collection (u/the-id parent)))]
        (testing "the collection takes the archive on its own and starts an operation"
          (is (=? {:archived true :archived_directly true :archive_operation_id string?}
                  (row :model/Collection (u/the-id parent)))))
        (testing "the collections under it that were live follow it in its operation"
          (is (=? {:archived true :archived_directly false :archive_operation_id parent-op-id}
                  (row :model/Collection (u/the-id child)))))
        (testing "a collection archived before keeps its own cause and operation"
          (is (=? {:archived true :archived_directly true :archive_operation_id direct-op-id}
                  (row :model/Collection (u/the-id direct-sub)))))
        (testing "each kind of item follows"
          (doseq [[model item] [[:model/Card card] [:model/Card child-card] [:model/Dashboard dashboard]
                                [:model/Card dashboard-q] [:model/Document document] [:model/Card document-q]
                                [:model/Exploration exploration] [:model/Timeline timeline] [:model/Pulse pulse]]]
            (is (=? {:archived true :archived_directly false} (row model (u/the-id item)))
                (str model " " (u/the-id item)))))
        (testing "an item archived on its own keeps its cause"
          (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct-card)))))
        (testing "the events of a timeline it carries stay as they were"
          (is (false? (:archived (row :model/TimelineEvent (u/the-id event))))))
        (archive! :model/Collection (u/the-id parent) false)
        (testing "restoring brings back what the archive took down"
          (is (=? {:archived false :archived_directly false :archive_operation_id nil}
                  (row :model/Collection (u/the-id parent))))
          (is (=? {:archived false :archived_directly false :archive_operation_id nil}
                  (row :model/Collection (u/the-id child))))
          (doseq [[model item] [[:model/Card card] [:model/Card child-card] [:model/Dashboard dashboard]
                                [:model/Card dashboard-q] [:model/Document document] [:model/Card document-q]
                                [:model/Exploration exploration] [:model/Timeline timeline] [:model/Pulse pulse]]]
            (is (=? {:archived false :archived_directly false} (row model (u/the-id item)))
                (str model " " (u/the-id item)))))
        (testing "restoring leaves what was archived on its own archived"
          (is (=? {:archived true :archived_directly true :archive_operation_id direct-op-id}
                  (row :model/Collection (u/the-id direct-sub))))
          (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct-card)))))))))

(deftest restore-collection-leaves-what-its-archived-parent-holds-test
  (mt/with-temp [:model/Collection collection {}
                 :model/Dashboard  dashboard  {:collection_id (u/the-id collection)}
                 :model/Card       question   {:collection_id (u/the-id collection) :dashboard_id (u/the-id dashboard)}]
    (archive! :model/Dashboard (u/the-id dashboard) true)
    (archive! :model/Collection (u/the-id collection) true)
    (archive! :model/Collection (u/the-id collection) false)
    (is (=? {:archived true :archived_directly true} (row :model/Dashboard (u/the-id dashboard))))
    (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id question))))))

(deftest archive-and-restore-snippet-collection-test
  (mt/with-temp [:model/Collection parent  {:namespace "snippets"}
                 :model/Collection child   {:namespace "snippets" :location (collection/children-location parent)}
                 :model/NativeQuerySnippet snippet       {:collection_id (u/the-id parent)}
                 :model/NativeQuerySnippet direct        {:collection_id (u/the-id child)}]
    (archive! :model/NativeQuerySnippet (u/the-id direct) true)
    (archive! :model/Collection (u/the-id parent) true)
    (is (=? {:archived true :archived_directly false} (row :model/NativeQuerySnippet (u/the-id snippet))))
    (is (=? {:archived true :archived_directly true} (row :model/NativeQuerySnippet (u/the-id direct))))
    (archive! :model/Collection (u/the-id parent) false)
    (is (=? {:archived false :archived_directly false} (row :model/NativeQuerySnippet (u/the-id snippet))))
    (is (=? {:archived true :archived_directly true} (row :model/NativeQuerySnippet (u/the-id direct))))))

(deftest archive-of-collection-statements-do-not-grow-with-items-test
  (letfn [(calls [n]
            (mt/with-temp [:model/Collection collection {:namespace "snippets"}]
              (dotimes [_ n]
                (t2/insert! :model/NativeQuerySnippet {:name       (str (random-uuid))
                                                       :content    "1 = 1"
                                                       :creator_id (mt/user->id :crowberto)
                                                       :collection_id (u/the-id collection)}))
              (t2/with-call-count [call-count]
                (archive! :model/Collection (u/the-id collection) true)
                (archive! :model/Collection (u/the-id collection) false)
                (call-count))))]
    (calls 1)
    (testing "each snippet costs, in the archive and in the restore, the SELECT of its hook and its UPDATE"
      (is (<= (- (calls 20) (calls 2)) (* 2 2 (- 20 2)))))))

(deftest archive-and-restore-follow-model-parents-test
  (testing "a dashboard archives and restores the questions it holds, but not those archived on their own"
    (mt/with-temp [:model/Dashboard dashboard {}
                   :model/Card      question {:dashboard_id (u/the-id dashboard)}
                   :model/Card      direct   {:dashboard_id (u/the-id dashboard)}]
      (archive! :model/Card (u/the-id direct) true)
      (archive! :model/Dashboard (u/the-id dashboard) true)
      (is (=? {:archived true :archived_directly true} (row :model/Dashboard (u/the-id dashboard))))
      (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id question))))
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct))))
      (archive! :model/Dashboard (u/the-id dashboard) false)
      (is (=? {:archived false :archived_directly false} (row :model/Card (u/the-id question))))
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id direct))))))
  (testing "a document archives and restores the cards in it"
    (mt/with-temp [:model/Document document {}
                   :model/Card     card {:document_id (u/the-id document)}]
      (archive! :model/Document (u/the-id document) true)
      (is (=? {:archived true :archived_directly false} (row :model/Card (u/the-id card))))
      (archive! :model/Document (u/the-id document) false)
      (is (=? {:archived false :archived_directly false} (row :model/Card (u/the-id card))))))
  (testing "a timeline archives and restores its events"
    (mt/with-temp [:model/Timeline      timeline {}
                   :model/TimelineEvent event    {:timeline_id (u/the-id timeline)}]
      (timeline/update-timelines! [{:id (u/the-id timeline) :archived true}] nil)
      (is (true? (:archived (row :model/TimelineEvent (u/the-id event)))))
      (timeline/update-timelines! [{:id (u/the-id timeline) :archived false}] nil)
      (is (false? (:archived (row :model/TimelineEvent (u/the-id event)))))))
  (testing "an exploration archives and restores its summary document"
    (mt/with-temp [:model/Exploration exploration {}
                   :model/Document    summary     {:exploration_id (u/the-id exploration)}]
      (archive! :model/Exploration (u/the-id exploration) true)
      (is (=? {:archived true :archived_directly false} (row :model/Document (u/the-id summary))))
      (archive! :model/Exploration (u/the-id exploration) false)
      (is (=? {:archived false :archived_directly false} (row :model/Document (u/the-id summary)))))))

(deftest archived-cause-test
  (testing "an archive without a cause is on its own, and a restore clears it"
    (mt/with-temp [:model/Card card {}]
      (archive! :model/Card (u/the-id card) true)
      (is (true? (:archived_directly (row :model/Card (u/the-id card)))))
      (archive! :model/Card (u/the-id card) false)
      (is (false? (:archived_directly (row :model/Card (u/the-id card)))))))
  (testing "a write that gives a cause keeps it"
    (mt/with-temp [:model/Card card {}]
      (card/update-cards! [{:id (u/the-id card) :archived true :archived_directly false}])
      (is (=? {:archived true :archived_directly true} (row :model/Card (u/the-id card)))))))

(deftest rows-do-not-go-into-archived-parents-test
  (mt/with-temp [:model/Collection archived  {:archived true}
                 :model/Collection live      {}
                 :model/Card       card      {:collection_id (u/the-id live)}
                 :model/Dashboard  dashboard {:collection_id (u/the-id live)}
                 :model/Card       _in-dash  {:dashboard_id (u/the-id dashboard) :collection_id (u/the-id live)}]
    (testing "a row that is not archived cannot be inserted into an archived collection"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (first (dashboard/create-dashboards! [{:name "d" :creator_id (mt/user->id :rasta) :collection_id (u/the-id archived)}]))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (timeline/create-timelines! [{:name "t" :creator_id (mt/user->id :rasta)
                                                          :collection_id (u/the-id archived)}]))))
    (testing "an archived row can be inserted into an archived collection"
      (is (some? (first (dashboard/create-dashboards! [{:name "d" :creator_id (mt/user->id :rasta) :archived true
                                                        :archived_directly false :collection_id (u/the-id archived)}])))))
    (testing "a row that is not archived cannot be moved into an archived collection"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (card/update-cards! [{:id (u/the-id card) :collection_id (u/the-id archived)}])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (collection/update-collections! [{:id (u/the-id live) :location (collection/children-location archived)}] nil))))
    (testing "a row that is archived can be moved into an archived collection"
      (archive! :model/Card (u/the-id card) true)
      (is (nil? (card/update-cards! [{:id (u/the-id card) :collection_id (u/the-id archived)}]))))
    (testing "a card that is not archived cannot be put in an archived dashboard"
      (archive! :model/Dashboard (u/the-id dashboard) true)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Dashboard"
                            (first (card/create-cards! [(merge {:creator_id (mt/user->id :rasta) :database_id (mt/id) :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))) :display :table :name (mt/random-name) :visualization_settings {}} {:dashboard_id  (u/the-id dashboard)
                                                                                                                                                                                                                                                                                                        :collection_id (u/the-id live)
                                                                                                                                                                                                                                                                                                        :archived      false})])))))))

(defn- fill-collection!
  "Puts one item of each kind a Collection archives, restores and deletes with it into the Collection with
  `collection-id`."
  [collection-id]
  (doseq [model [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Pulse :model/Exploration]]
    (t2/insert! model (assoc (mt/with-temp-defaults model) :collection_id collection-id))))

(defn- subtree-statement-counts!
  "The number of statements that archiving, restoring, moving and deleting a Collection with `n` Collections under it
  take, each Collection holding one item of each kind."
  [n]
  (mt/with-temp [:model/Collection root   {}
                 :model/Collection target {}]
    (fill-collection! (u/the-id root))
    (dotimes [_ n]
      (let [child (first (collection/create-collections! [{:name     (mt/random-name)
                                                           :location (collection/children-location root)}]))]
        (fill-collection! (u/the-id child))))
    (let [id      (u/the-id root)
          counted events.tu/statement-count!]
      {:archive (counted #(collection/update-collections! [{:id id :archived true}]))
       :restore (counted #(collection/update-collections! [{:id id :archived false}]))
       :move    (counted #(collection/update-collections! [{:id id :location (collection/children-location target)}]))
       :delete  (counted #(collection/delete-collections! [id]))})))

(deftest collection-statements-do-not-grow-with-subtree-test
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Pulse :model/Exploration
                          :model/Collection]
    (subtree-statement-counts! 1)
    (let [small (subtree-statement-counts! 2)
          large (subtree-statement-counts! 6)]
      (doseq [k [:archive :restore :move :delete]]
        (testing (name k)
          (if (#{:archive :restore} k)
            (testing "each item of a Collection costs the SELECT of its hook and its UPDATE"
              (is (<= (- (get large k) (get small k)) (* 2 (- 6 2) 6))))
            (is (= (get small k) (get large k)))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Card :model/Collection]
    (mt/with-temp [:model/Collection {target :id} {}]
      (let [user-id  (mt/user->id :rasta)
            rows     (fn [n] (mapv (fn [_] {:name (mt/random-name)}) (range n)))
            fresh!   (fn [n]
                       (let [ids (mapv :id (collection/create-collections! (rows n)))]
                         (doseq [id ids]
                           (t2/insert! :model/Card (assoc (mt/with-temp-defaults :model/Card) :collection_id id :creator_id user-id)))
                         ids))
            update!  (fn [prepare changes n]
                       (let [ids (fresh! n)]
                         (prepare (take-nth 2 ids))
                         (events.tu/statement-count! #(collection/update-collections! (mapv (fn [id] (assoc changes :id id)) ids)))))
            counted  (fn [f]
                       (f 1)
                       (is (= (f 2) (f 6))))
            counted-cascading (fn [f]
                                (f 1)
                                (is (<= (- (f 6) (f 2)) (* 4 (- 6 2)))
                                    "each more Collection costs its own statements and, for its Card, a SELECT and an UPDATE"))]
        (testing "creating collections"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(collection/create-collections! rows))))))
        (testing "creating collections under a parent"
          (let [location (collection/children-location (t2/select-one :model/Collection :id target))]
            (counted (fn [n]
                       (let [rows (mapv #(assoc % :location location) (rows n))]
                         (events.tu/statement-count! #(collection/create-collections! rows)))))))
        (testing "updating columns, some already holding the new value"
          (counted (partial update!
                            (fn [ids] (collection/update-collections! (mapv (fn [id] {:id id :description "Same"}) ids) nil))
                            {:description "Same"})))
        (testing "archiving collections, some already archived"
          (counted-cascading (partial update!
                                      (fn [ids] (collection/update-collections! (mapv (fn [id] {:id id :archived true}) ids) nil))
                                      {:archived true})))
        (testing "restoring collections, some already live"
          (counted-cascading (partial update!
                                      (fn [ids] (collection/update-collections! (mapv (fn [id] {:id id :archived true}) ids) nil))
                                      {:archived false})))
        (testing "moving collections, some already under the parent"
          (let [location (collection/children-location (t2/select-one :model/Collection :id target))]
            (counted (partial update!
                              (fn [ids] (collection/update-collections! (mapv (fn [id] {:id id :location location}) ids) nil))
                              {:location location}))))
        (testing "deleting collections"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(collection/delete-collections! ids))))))))))

(defn- old-operation-ids
  "The ids of the archive operations as they were given before they were shared: one for each Collection that archives."
  [entries]
  (into {}
        (comp (filter #(:archived (:changes %)))
              (map (fn [entry] [(:id (:before entry)) (str (random-uuid))])))
        entries))

(defn- tree!
  "A Collection under the Collection with id `parent`, or at the top, with its items and one child Collection with its items, as ids."
  [parent]
  (let [root  (first (collection/create-collections!
                      [(cond-> {:name (mt/random-name)} parent (assoc :location (collection/children-location (t2/select-one :model/Collection :id parent))))]))
        child (first (collection/create-collections! [{:name (mt/random-name) :location (collection/children-location root)}]))]
    (fill-collection! (u/the-id root))
    (fill-collection! (u/the-id child))
    {:root (u/the-id root) :child (u/the-id child)}))

(defn- snapshot
  "The archive state of each of the Collections `ids` and of the items in them, without ids."
  [ids]
  (mapv (fn [id]
          {:collection (select-keys (row :model/Collection id) [:archived :archived_directly])
           :items      (into {}
                             (map (fn [model]
                                    [model (mapv #(select-keys % [:archived :archived_directly])
                                                 (t2/select model :collection_id id {:order-by [[:id :asc]]}))]))
                             [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Exploration])})
        ids))

(defn- archive-all! [ids]
  (collection/update-collections! (mapv (fn [id] {:id id :archived true}) ids) nil))

(defn- restore! [id]
  (collection/update-collections! [{:id id :archived false}] nil))

(defn- same-as-before!
  "Runs `scenario`, a function of no arguments returning a snapshot, with the archive operations shared as now and with
  one for each Collection as before, and checks that the snapshots are the same, returning the first."
  [scenario]
  (let [now    (scenario)
        before (with-redefs-fn {#'collection/operation-ids old-operation-ids} scenario)]
    (is (= before now))
    now))

(deftest restore-one-of-two-roots-archived-together-test
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Pulse :model/Exploration
                          :model/Collection]
    (let [together   (fn []
                       (let [a (tree! nil), b (tree! nil)]
                         (archive-all! [(:root a) (:root b)])
                         (restore! (:root a))
                         (snapshot [(:root a) (:child a) (:root b) (:child b)])))
          separately (fn []
                       (let [a (tree! nil), b (tree! nil)]
                         (archive-all! [(:root a)])
                         (archive-all! [(:root b)])
                         (restore! (:root a))
                         (snapshot [(:root a) (:child a) (:root b) (:child b)])))
          result     (same-as-before! together)]
      (testing "archived together or one after the other, the same comes back"
        (is (= (separately) result)))
      (testing "everything under the restored root is live, everything under the other stays archived"
        (is (every? #(= {:archived false :archived_directly false} (:collection %)) (take 2 result)))
        (is (every? (fn [state] (every? #(= {:archived false :archived_directly false} %) (mapcat val (:items state))))
                    (take 2 result)))
        (is (= {:archived true :archived_directly true} (:collection (nth result 2))))
        (is (= {:archived true :archived_directly false} (:collection (nth result 3))))
        (is (every? (fn [state] (every? :archived (mapcat val (:items state)))) (drop 2 result)))))))

(deftest restore-parent-archived-with-unrelated-root-after-child-test
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Pulse :model/Exploration
                          :model/Collection]
    (let [result (same-as-before!
                  (fn []
                    (let [p (tree! nil), r (tree! nil)]
                      (archive-all! [(:child p)])
                      (archive-all! [(:root p) (:root r)])
                      (restore! (:root p))
                      (snapshot [(:root p) (:child p) (:root r) (:child r)]))))]
      (testing "the parent comes back"
        (is (= {:archived false :archived_directly false} (:collection (first result)))))
      (testing "the child archived before on its own stays archived, with what is in it"
        (is (= {:archived true :archived_directly true} (:collection (second result))))
        (is (every? :archived (mapcat val (:items (second result))))))
      (testing "the unrelated root stays archived"
        (is (= {:archived true :archived_directly true} (:collection (nth result 2))))
        (is (= {:archived true :archived_directly false} (:collection (nth result 3))))))))

(deftest restore-nested-roots-archived-together-test
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Pulse :model/Exploration
                          :model/Collection]
    (let [nested (fn []
                   (let [p (tree! nil)
                         d (tree! (:root p))]
                     (archive-all! [(:root p) (:root d)])
                     {:p p :d d}))
          states (fn [{:keys [p d]}] (snapshot [(:root p) (:child p) (:root d) (:child d)]))]
      (testing "restoring the outer one"
        (let [result (same-as-before! (fn [] (let [t (nested)] (restore! (:root (:p t))) (states t))))]
          (is (false? (:archived (:collection (first result)))))
          (is (true? (:archived (:collection (nth result 2)))))))
      (testing "restoring the inner one"
        (let [result (same-as-before! (fn [] (let [t (nested)] (restore! (:root (:d t))) (states t))))]
          (is (true? (:archived (:collection (first result)))))
          (is (false? (:archived (:collection (nth result 2))))))))))
