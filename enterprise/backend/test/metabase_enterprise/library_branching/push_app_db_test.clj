(ns metabase-enterprise.library-branching.push-app-db-test
  "The push of the app DB instance. A push reads at a read point of its own, so these tests commit their content and
  delete it afterwards, and they change the one base row of the app DB; they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- do-with-committed-content!
  "Calls `f` with a function `(insert! model row)` that inserts and commits a row and returns it, and the Library
  collection. Deletes every inserted row afterwards, the last first, and clears the base row before and after."
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
                          (insert! :model/Collection {:name "Library" :type "library" :location "/"}))]
          (f insert! library)))
      (finally
        (doseq [[model row] @rows]
          (if (= :model/TableUserSettings model)
            (t2/delete! model :table_id (:table_id row))
            (t2/delete! model :id (:id row))))
        (reset-base!)))))

(defn- metric-row
  [collection metric-name query & {:as more}]
  (merge {:name                   metric-name
          :type                   :metric
          :collection_id          (:id collection)
          :creator_id             (mt/user->id :crowberto)
          :display                :scalar
          :visualization_settings {}
          :dataset_query          query}
         more))

(defn- sum-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))))

(defn- metric-query
  "A query whose aggregation is the metric `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib.metadata/metric mp card-id)))))

(defn- cheap-query
  "A segment definition: the venues whose price is below `n`."
  [n]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) n)))))

(defn- table-item-paths
  "The paths of the segment and measure files of `commit`."
  [s commit]
  (into (sorted-set) (filter #(re-find #"\.(segment|measure)\.yaml$" %)) (keys (store/read-tree s commit))))

(deftest push-of-segments-and-measures-test
  (testing (str "a push writes the segments and measures of a published Library table, in the directory of the table, "
                "and a later push removes the files of those that left scope; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! library]
       (let [user      (mt/user->id :crowberto)
             data      (insert! :model/Collection {:name     "Push data"
                                                   :type     "library-data"
                                                   :location (children-location library)})
             _         (insert! :model/TableUserSettings {:table_id      (mt/id :venues)
                                                          :is_published  true
                                                          :collection_id (:id data)})
             segment   #(insert! :model/Segment (merge {:table_id (mt/id :venues) :creator_id user
                                                        :definition (cheap-query 2)}
                                                       %))
             measure   #(insert! :model/Measure (merge {:table_id (mt/id :venues) :creator_id user
                                                        :definition (sum-query)}
                                                       %))
             kept      (segment {:name "Kept segment"})
             archived  (segment {:name "Archived segment" :archived true})
             later     (segment {:name "Archived later segment"})
             m-kept    (measure {:name "Kept measure"})
             m-archived (measure {:name "Archived measure" :archived true})
             m-later   (measure {:name "Archived later measure"})
             inst      (app-db/app-db-instance)
             in-commit (fn [s commit rows] (mapv #(contains? (ptu/commit-snapshot s commit) (:entity_id %)) rows))]
         (with-remote [_repo s]
           (let [{:keys [result commit]} (push/push! inst s ptu/branch)]
             (testing "an active segment or measure is in the commit, an archived one is not"
               (is (= :pushed result))
               (is (= [true false true true false true]
                      (in-commit s commit [kept archived later m-kept m-archived m-later])))
               (is (= 4 (count (table-item-paths s commit))))
               (is (every? #(re-find #"\.table/[^/]+$" %) (table-item-paths s commit))))
             (testing "a segment and a measure that the person archived leave the commit"
               (t2/update! :model/Segment (:id later) {:archived true})
               (t2/update! :model/Measure (:id m-later) {:archived true})
               (let [{:keys [result commit]} (push/push! inst s ptu/branch)]
                 (is (= :pushed result))
                 (is (= [true false true false] (in-commit s commit [kept later m-kept m-later])))
                 (is (= 2 (count (table-item-paths s commit))))))
             (testing "the segments and measures of a table that left the Library leave the commit with it"
               (t2/update! :model/TableUserSettings (mt/id :venues) {:is_published false})
               (let [{:keys [result commit]} (push/push! inst s ptu/branch)]
                 (is (= :pushed result))
                 (is (= [false false] (in-commit s commit [kept m-kept])))
                 (is (empty? (table-item-paths s commit))))))))))))

(deftest push-of-the-app-db-test
  (testing (str "a push writes the synced snapshot of the app DB, and the base row holds the commit; app DB "
                (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! library]
       (let [metrics (insert! :model/Collection {:name     "Push metrics"
                                                 :type     "library-metrics"
                                                 :location (children-location library)})
             metric  (insert! :model/Card (metric-row metrics "Total price" (sum-query)))
             inst    (app-db/app-db-instance)]
         (with-remote [repo s]
           (let [{:keys [result commit]} (push/push! inst s ptu/branch)
                 read                    (:snapshot (instance/read-snapshot inst))]
             (is (= :pushed result))
             (is (= commit (ptu/remote-head repo)))
             (is (= commit (instance/base inst)))
             (is (= read (ptu/commit-snapshot s commit)))
             (is (contains? read (:entity_id metric)))
             (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst)))
             (testing "a second push has nothing to push"
               (is (= {:result :nothing-to-push :commit commit} (push/push! inst s ptu/branch)))))))))))

(deftest push-refuses-a-library-metric-that-uses-a-trashed-metric-test
  (testing (str "a Library metric uses a metric in the trash: the push refuses, names the pair, and writes nothing; "
                "app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! library]
       (let [metrics (insert! :model/Collection {:name     "Trash metrics"
                                                 :type     "library-metrics"
                                                 :location (children-location library)})
             trashed (insert! :model/Card (metric-row metrics "Trashed" (sum-query) :archived true))
             user    (insert! :model/Card (metric-row metrics "Uses the trashed one" (metric-query (:id trashed))))
             inst    (app-db/app-db-instance)]
         (with-remote [repo s]
           (let [{:keys [result findings]} (push/push! inst s ptu/branch)]
             (is (= :invalid result))
             (is (some #(= {:rule :refs-closed :id (:entity_id user) :ref [:metric (:entity_id trashed)]} %)
                       findings))
             (is (nil? (ptu/remote-head repo)))
             (is (nil? (instance/base inst))))))))))

(deftest save-during-push-of-the-app-db-test
  (testing (str "a save that commits after the read point of the push is a local change, and the next push carries "
                "it; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! library]
       (let [metrics (insert! :model/Collection {:name     "Save metrics"
                                                 :type     "library-metrics"
                                                 :location (children-location library)})
             metric  (insert! :model/Card (metric-row metrics "Before" (sum-query)))
             inst    (app-db/app-db-instance)
             racing  (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                               (let [r (read-snapshot)]
                                                                 (t2/update! :model/Card (:id metric) {:name "After"})
                                                                 r))})]
         (with-remote [_repo s]
           (let [{:keys [result commit]} (push/push! racing s ptu/branch)]
             (is (= :pushed result))
             (is (= "Before" (get-in (ptu/commit-snapshot s commit) [(:entity_id metric) :name])))
             (is (= #{(:entity_id metric)} (:updated (ptu/local-changes inst))))
             (let [next-push (push/push! inst s ptu/branch)]
               (is (= :pushed (:result next-push)))
               (is (= "After" (get-in (ptu/commit-snapshot s (:commit next-push)) [(:entity_id metric) :name])))))))))))

(deftest push-of-glossary-terms-test
  (testing (str "a push writes each glossary term to glossary/<term>.term.yaml, and a rename moves the file; app DB "
                (mdb/db-type))
    (do-with-committed-content!
     (fn [insert! _library]
       (let [term  (insert! :model/Glossary {:term       "Churn for library branching"
                                             :definition "The share of customers who cancel."
                                             :creator_id (mt/user->id :crowberto)})
             inst  (app-db/app-db-instance)
             paths (fn [s commit] (set (keys (store/read-tree s commit))))]
         (with-remote [_repo s]
           (let [{:keys [result commit]} (push/push! inst s ptu/branch)]
             (is (= :pushed result))
             (is (contains? (paths s commit) "glossary/churn_for_library_branching.term.yaml"))
             (is (= {:kind  :glossary-term
                     :name  "Churn for library branching"
                     :place nil
                     :refs  #{}
                     :attrs {:definition "The share of customers who cancel."}}
                    (get (ptu/commit-snapshot s commit) (:entity_id term))))
             (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst)))
             (testing "a rename is a local update, and the next push moves the file"
               (t2/update! :model/Glossary (:id term) {:term "Customer churn for library branching"})
               (is (= #{(:entity_id term)} (:updated (ptu/local-changes inst))))
               (let [next-push (push/push! inst s ptu/branch)
                     after     (paths s (:commit next-push))]
                 (is (= :pushed (:result next-push)))
                 (is (contains? after "glossary/customer_churn_for_library_branching.term.yaml"))
                 (is (not (contains? after "glossary/churn_for_library_branching.term.yaml")))
                 (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst)))))
             (testing "a deleted term leaves the next commit"
               (t2/delete! :model/Glossary :id (:id term))
               (is (= #{(:entity_id term)} (:deleted (ptu/local-changes inst))))
               (let [next-push (push/push! inst s ptu/branch)]
                 (is (= :pushed (:result next-push)))
                 (is (not-any? #(re-find #"^glossary/" %) (paths s (:commit next-push)))))))))))))
