(ns metabase-enterprise.library-branching.pull-app-db-test
  "The pull into the app DB instance: the apply of a plan in one transaction, with row locks. A pull reads at a read
  point of its own, so these tests commit their content and delete it afterwards, and they change the one base row of
  the app DB; they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(def ^:private created-ids
  "Entity ids of the rows that a pull of these tests creates."
  ["lbPullNewMetric000001" "lbPullSnippetOne00001" "lbPullSnippetTwo00001"])

(defn- delete-created! []
  (t2/delete! :model/Card :entity_id [:in created-ids])
  (t2/delete! :model/NativeQuerySnippet :entity_id [:in created-ids]))

(defn- do-with-committed-content!
  "Calls `f` with a function `(insert! model row)` that inserts and commits a row and returns it, and the metrics
  collection of the Library. Deletes every inserted row and every row of [[created-ids]] afterwards, and clears the
  base row before and after."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))]
    (reset-base!)
    (try
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (let [library (or (t2/select-one :model/Collection :type "library" :archived false)
                          (insert! :model/Collection {:name "Library" :type "library" :location "/"}))
              metrics (insert! :model/Collection {:name     "Pull metrics"
                                                  :type     "library-metrics"
                                                  :location (children-location library)})]
          (f insert! metrics)))
      (finally
        (delete-created!)
        (doseq [[model row] @rows]
          (t2/delete! model :id (:id row)))
        (reset-base!)))))

(defn- sum-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))))

(defn- metric-query
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib.metadata/metric mp card-id)))))

(defn- metric-row
  [collection metric-name & {:as more}]
  (merge {:name                   metric-name
          :type                   :metric
          :collection_id          (:id collection)
          :creator_id             (mt/user->id :crowberto)
          :display                :scalar
          :visualization_settings {}
          :dataset_query          (sum-query)}
         more))

(defn- pushed!
  "Pushes the app DB instance, and returns `[inst commit snapshot]`."
  [s]
  (let [inst (app-db/app-db-instance)
        {:keys [result commit]} (ptu/push! inst s)]
    (is (= :pushed result))
    [inst commit (ptu/commit-snapshot s commit)]))

(defn- pull!
  ([inst s] (pull/pull! inst s ptu/branch))
  ([inst s opts] (pull/pull! inst s ptu/branch opts)))

(defn- read-snapshot [inst] (:snapshot (instance/read-snapshot inst)))

(deftest pull-into-the-app-db-test
  (testing (str "a pull writes the remote changes into the app DB in one transaction, trashes a removed metric that an "
                "outside question uses and reports it, and restores it later; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! metrics]
       (let [renamed  (insert! :model/Card (metric-row metrics "Before"))
             removed  (insert! :model/Card (metric-row metrics "Removed"))
             outside  (insert! :model/Card {:name          "Outside question"
                                            :type          :question
                                            :display       :table
                                            :creator_id    (mt/user->id :crowberto)
                                            :visualization_settings {}
                                            :dataset_query (metric-query (:id removed))})
             new-id   (first created-ids)]
         (with-remote [repo s]
           (let [[inst c1 base] (pushed! s)
                 remote         (-> base
                                    (ptu/renamed (:entity_id renamed) "After")
                                    (dissoc (:entity_id removed))
                                    (assoc new-id (-> (get base (:entity_id renamed)) (assoc :name "New"))))
                 h1             (pltu/commit-snapshot! repo ptu/branch [c1] remote)
                 {:keys [result trashed-in-use]} (pull! inst s)]
             (is (= :pulled result))
             (testing "the app DB holds the head, and the base is the head"
               (is (= remote (read-snapshot inst)))
               (is (= h1 (instance/base inst)))
               (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst))))
             (testing "the removed metric is in the trash, and the pull names the outside question that uses it"
               (is (true? (t2/select-one-fn :archived :model/Card (:id removed))))
               (is (= {(:entity_id removed) [{:kind :card :id (:entity_id outside) :name "Outside question"}]}
                      trashed-in-use)))
             (testing "a later head that holds the metric again restores the same row"
               (pltu/commit-snapshot! repo ptu/branch [h1] (assoc remote (:entity_id removed) (get base (:entity_id removed))))
               (is (= :pulled (:result (pull! inst s))))
               (is (false? (t2/select-one-fn :archived :model/Card (:id removed))))
               (is (= (get base (:entity_id removed)) (get (read-snapshot inst) (:entity_id removed))))))))))))

(deftest save-during-pull-of-the-app-db-test
  (testing (str "a save that commits after the read point of the pull: the apply finds it under the row lock, writes "
                "nothing, and the pull starts again and finds the conflict; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! metrics]
       (let [metric (insert! :model/Card (metric-row metrics "Before"))]
         (with-remote [repo s]
           (let [[inst c1 base] (pushed! s)
                 _              (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed base (:entity_id metric) "Theirs"))
                 once           (atom false)
                 racing         (ptu/wrap-instance inst {:read-snapshot
                                                         (fn [read-snapshot]
                                                           (let [r (read-snapshot)]
                                                             (when (compare-and-set! once false true)
                                                               (t2/update! :model/Card (:id metric) {:name "Saved"}))
                                                             r))})
                 {:keys [result conflicts]} (pull! racing s)]
             (is (= :conflicts result))
             (is (= [(:entity_id metric)] (map :id conflicts)))
             (is (= "Saved" (t2/select-one-fn :name :model/Card (:id metric))))
             (is (= c1 (instance/base inst))))))))))

(deftest apply-transaction-reads-committed-rows-test
  (testing (str "the transaction of the apply is at READ COMMITTED, also on a connection at REPEATABLE READ; app DB "
                (mdb/db-type))
    (t2/with-connection [^Connection conn]
      (let [old (.getTransactionIsolation conn)]
        (try
          (.setTransactionIsolation conn Connection/TRANSACTION_REPEATABLE_READ)
          (is (= Connection/TRANSACTION_READ_COMMITTED
                 (library-branching.db/do-in-locking-transaction #(.getTransactionIsolation conn))))
          (finally
            (.setTransactionIsolation conn old)))))))

(defn- on-another-connection
  "The result of `(f)` on a new thread with no dynamic bindings of this one: its own app DB connection."
  [f]
  (let [p (promise)]
    (doto (Thread. ^Runnable (fn [] (deliver p (try (f) (catch Throwable e e)))))
      (.start))
    (let [r @p]
      (if (instance? Throwable r) (throw r) r))))

(defn- racing-store!
  "The kind store `ks`, whose `current` of `id` runs `(f)` right after it locks and reads the item."
  [ks id f]
  (reify instance/KindStore
    (read-all [_ ids] (instance/read-all ks ids))
    (read-models [_] (instance/read-models ks))
    (current [_ x] (let [r (instance/current ks x)] (when (= id x) (f)) r))
    (write! [_ x content] (instance/write! ks x content))
    (trash! [_ x] (instance/trash! ks x))))

(deftest save-of-an-item-not-locked-yet-is-seen-test
  (testing (str "the apply locks the first item and reads it; then a save of the second item commits; the apply reads "
                "the second item after its lock and sees the save, also on an app DB whose default isolation is "
                "REPEATABLE READ; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! metrics]
       (let [first-m  (insert! :model/Card (metric-row metrics "First" :entity_id "lbPullFirstMetric0001"))
             second-m (insert! :model/Card (metric-row metrics "Second" :entity_id "lbPullSecondMetric001"))]
         (with-remote [repo s]
           (let [[_ c1 base] (pushed! s)
                 _           (pltu/commit-snapshot! repo ptu/branch [c1] (-> base
                                                                             (ptu/renamed (:entity_id first-m) "First, theirs")
                                                                             (ptu/renamed (:entity_id second-m) "Second, theirs")))
                 once        (atom false)
                 stores      (update app-db/kind-stores :metric racing-store! (:entity_id first-m)
                                     (fn []
                                       (when (compare-and-set! once false true)
                                         ;; another connection, so a thread that does not take the bindings of
                                         ;; this one; the row of the second metric has no lock yet
                                         (on-another-connection #(t2/update! :model/Card (:id second-m) {:name "Saved"})))))
                 inst        (app-db/app-db-instance stores (:roots (app-db/app-db-instance)))
                 {:keys [result conflicts]} (pull! inst s)]
             (is (= :conflicts result))
             (is (= [(:entity_id second-m)] (map :id conflicts)))
             (is (= "Saved" (t2/select-one-fn :name :model/Card (:id second-m))))
             (is (= "First" (t2/select-one-fn :name :model/Card (:id first-m))))
             (is (= c1 (instance/base inst))))))))))

(deftest refused-step-writes-nothing-test
  (testing (str "the head holds an identity that a question in a personal collection has: the apply refuses it and "
                "rolls back the writes before it; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! metrics]
       (let [metric   (insert! :model/Card (metric-row metrics "Before" :entity_id "lbPullAaaMetric000001"))
             personal (insert! :model/Card (metric-row {:id (t2/select-one-pk :model/Collection
                                                                              :personal_owner_id (mt/user->id :rasta))}
                                                       "Personal"
                                                       :entity_id "lbPullZzzPersonal0001"))]
         (with-remote [repo s]
           (let [[inst c1 base] (pushed! s)
                 h              (pltu/commit-snapshot! repo ptu/branch [c1]
                                                       (-> base
                                                           (ptu/renamed (:entity_id metric) "After")
                                                           (assoc (:entity_id personal)
                                                                  (assoc (get base (:entity_id metric)) :name "Taken over"))))
                 {:keys [result refused head]} (pull! inst s)]
             (is (= :refused result))
             (is (= h head))
             (is (= [[(:entity_id personal) :outside-library]] (map (juxt :id :reason) refused)))
             (is (= "Before" (t2/select-one-fn :name :model/Card (:id metric))))
             (is (= "Personal" (t2/select-one-fn :name :model/Card (:id personal))))
             (is (= c1 (instance/base inst))))))))))

(deftest identity-of-another-kind-test
  (testing (str "the head gives the identity of a collection to a glossary term: the pull writes the term and trashes "
                "the collection; a later head with the collection again restores it and deletes the term; app DB "
                (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! metrics]
       (let [collection (insert! :model/Collection {:name     "lb kind change"
                                                    :location (children-location metrics)})
             id         (:entity_id collection)]
         (try
           (with-remote [repo s]
             (let [[inst c1 base] (pushed! s)
                   term           {:kind :glossary-term :name "lb kind change" :place "glossaryglossarygloss" :refs #{}
                                   :attrs {:definition "A bird."}}
                   remote         (assoc base id term)
                   h1             (pltu/commit-snapshot! repo ptu/branch [c1] remote)
                   {:keys [result steps]} (pull! inst s)]
               (is (= :pulled result))
               (is (= [[id :write :glossary-term] [id :trash :collection]]
                      (map (fn [{:keys [write pre]}] [id (if write :write :trash) (:kind (or write pre))]) steps)))
               (is (= remote (read-snapshot inst)))
               (is (= h1 (instance/base inst)))
               (is (true? (t2/select-one-fn :archived :model/Collection (:id collection))))
               (is (= "A bird." (t2/select-one-fn :definition :model/Glossary :entity_id id)))
               (testing "and back"
                 (pltu/commit-snapshot! repo ptu/branch [h1] base)
                 (is (= :pulled (:result (pull! inst s))))
                 (is (= base (read-snapshot inst)))
                 (is (false? (t2/select-one-fn :archived :model/Collection (:id collection))))
                 (is (not (t2/exists? :model/Glossary :entity_id id))))))
           (finally
             (t2/delete! :model/Glossary :entity_id id))))))))

(deftest snippets-on-a-reference-cycle-test
  (testing (str "two new snippets that use each other: the apply writes the first one as a stub, the second one, and "
                "then the whole first one; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [_insert! _metrics]
       (with-remote [repo s]
         (let [[one-id two-id] (rest created-ids)
               [inst c1 base]  (pushed! s)
               ;; the two snippets on this instance give their content; then their rows go
               one    (t2/insert-returning-instance! :model/NativeQuerySnippet {:name "lb pull one" :entity_id one-id
                                                                                :content "a {{snippet: lb pull two}}"
                                                                                :creator_id (mt/user->id :crowberto)})
               two    (t2/insert-returning-instance! :model/NativeQuerySnippet {:name "lb pull two" :entity_id two-id
                                                                                :content "b {{snippet: lb pull one}}"
                                                                                :creator_id (mt/user->id :crowberto)})
               _      (t2/update! :model/NativeQuerySnippet (:id one) {:content "a  {{snippet: lb pull two}}"})
               items  (select-keys (read-snapshot inst) [one-id two-id])
               _      (t2/delete! :model/NativeQuerySnippet :id [:in [(:id one) (:id two)]])
               _      (is (= #{[:snippet two-id]} (get-in items [one-id :refs])))
               _      (is (= #{[:snippet one-id]} (get-in items [two-id :refs])))
               remote (merge base items)
               _      (pltu/commit-snapshot! repo ptu/branch [c1] remote)
               {:keys [result steps]} (pull! inst s)]
           (is (= :pulled result))
           (is (= [[one-id :write] [two-id :write] [one-id :link] [two-id :link]]
                  (map (fn [{:keys [id link]}] [id (if link :link :write)]) steps)))
           (is (= remote (read-snapshot inst)))))))))

(deftest pull-refuses-the-name-of-a-trashed-snippet-test
  (testing (str "Alloy ApplyKeepsUniqueKeysFails on the app DB: the head adds a snippet with the name of a snippet in "
                "the trash, which the app DB keeps unique over all rows. The apply refuses with the pair before it "
                "writes, and the base stays; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! _metrics]
       (let [trashed (insert! :model/NativeQuerySnippet {:name       "lb pull clash"
                                                         :content    "1 = 1"
                                                         :archived   true
                                                         :creator_id (mt/user->id :crowberto)})
             new-id  (second created-ids)]
         (with-remote [repo s]
           (let [[inst c1 base] (pushed! s)
                 item           {:kind :snippet :name "lb pull clash" :place nil :refs #{} :attrs {:content "2 = 2"}}
                 h              (pltu/commit-snapshot! repo ptu/branch [c1] (assoc base new-id item))]
             (is (= {:result    :key-clash
                     :head      h
                     :key-clash [{:rule :unique-key :kind :snippet :key "lb pull clash"
                                  :ids  #{new-id (:entity_id trashed)}}]}
                    (pull! inst s)))
             (is (not (t2/exists? :model/NativeQuerySnippet :entity_id new-id)))
             (is (= c1 (instance/base inst))))))))))

(deftest pull-refuses-a-name-that-differs-only-in-case-or-accents-test
  (testing (str "The apply compares snippet names in the form of validate: a name that differs from the name of a "
                "snippet in the trash only in case or accents is one key on every app DB. The apply refuses with the "
                "pair before it writes; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! _metrics]
       (let [trashed (insert! :model/NativeQuerySnippet {:name       "lb pull Clash"
                                                         :content    "1 = 1"
                                                         :archived   true
                                                         :creator_id (mt/user->id :crowberto)})
             new-id  (second created-ids)]
         (with-remote [repo s]
           (let [[inst c1 base] (pushed! s)
                 item           {:kind :snippet :name "lb pull cläsh" :place nil :refs #{} :attrs {:content "2 = 2"}}
                 h              (pltu/commit-snapshot! repo ptu/branch [c1] (assoc base new-id item))]
             (is (= {:result    :key-clash
                     :head      h
                     :key-clash [{:rule :unique-key :kind :snippet :key "lb pull cläsh"
                                  :ids  #{new-id (:entity_id trashed)}}]}
                    (pull! inst s)))
             (is (not (t2/exists? :model/NativeQuerySnippet :entity_id new-id)))
             (is (= c1 (instance/base inst))))))))))

(deftest pull-refuses-a-name-that-the-collation-takes-as-one-test
  (testing (str "MySQL and MariaDB keep snippet names unique under utf8mb4_unicode_ci, which takes some names as one "
                "that differ in more than case or accents. A new snippet with such a name of a snippet in the trash: "
                "the apply refuses with the pair before it writes, and the app DB gives no constraint error; app DB "
                (mdb/db-type))
    (doseq [[trashed-name new-name] [["lb pull Straße" "lb pull Strasse"]
                                     ["lb pull clash" "lb pull clash  "]
                                     ["lb pull clash" "lb pull cl​ash"]
                                     ["lb pull 😀" "lb pull 🎉"]]]
      (testing (pr-str trashed-name new-name)
        (do-with-committed-content!
         (fn [insert! _metrics]
           (let [trashed (insert! :model/NativeQuerySnippet {:name       trashed-name
                                                             :content    "1 = 1"
                                                             :archived   true
                                                             :creator_id (mt/user->id :crowberto)})
                 new-id  (second created-ids)]
             (with-remote [repo s]
               (let [[inst c1 base] (pushed! s)
                     item           {:kind :snippet :name new-name :place nil :refs #{} :attrs {:content "2 = 2"}}
                     h              (pltu/commit-snapshot! repo ptu/branch [c1] (assoc base new-id item))]
                 (is (= {:result    :key-clash
                         :head      h
                         :key-clash [{:rule :unique-key :kind :snippet :key new-name
                                      :ids  #{new-id (:entity_id trashed)}}]}
                        (pull! inst s)))
                 (is (not (t2/exists? :model/NativeQuerySnippet :entity_id new-id)))
                 (is (= c1 (instance/base inst))))))))))))
