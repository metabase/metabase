(ns metabase-enterprise.remote-sync.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest deleting-a-worktree-takes-what-it-checked-out-test
  (testing "deleting a worktree deletes the content it checked out, including the Trash it was created with"
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "delete-me-" (random-uuid))})
          [collection-id card-id]
          (mdb.worktree/with-worktree worktree-id
            (let [collection-id (t2/insert-returning-pk! :model/Collection {:name "Checked out"})]
              [collection-id
               (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                           {:collection_id collection-id}))]))]
      (remote-sync.db/delete-worktree! worktree-id)
      (mdb.worktree/without-worktree-scoping
       (is (nil? (t2/select-one :model/Worktree :id worktree-id)))
       (is (nil? (t2/select-one :model/Collection :id collection-id)))
       (is (nil? (t2/select-one :model/Card :id card-id)))
       (is (zero? (t2/count :model/Collection :worktree_id worktree-id)))))))

(defn- worktree-header
  "Request options that work a request inside the worktree `worktree-id` names."
  [worktree-id]
  {:request-options {:headers {"x-metabase-worktree-id" (str worktree-id)}}})

(defn- root-item-names
  "The names in the root collection listing: the main app's, or the worktree `worktree-id`'s when it is non-nil."
  [worktree-id]
  (->> (if worktree-id
         (mt/user-http-request :crowberto :get 200 "collection/root/items" (worktree-header worktree-id))
         (mt/user-http-request :crowberto :get 200 "collection/root/items"))
       :data
       (map :name)
       set))

(deftest a-root-listing-shows-one-worktree-test
  (mt/with-temp [:model/Card _ {:name "Main app card" :collection_id nil}]
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "listing-" (random-uuid))})]
      (mdb.worktree/with-worktree worktree-id
        (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                    {:name "Branch card" :collection_id nil})))
      (try
        (testing "the main app lists its own content"
          (let [names (root-item-names nil)]
            (is (contains? names "Main app card"))
            (is (not (contains? names "Branch card")))))
        (testing "a worktree lists only what it checked out"
          (let [names (root-item-names worktree-id)]
            (is (contains? names "Branch card"))
            (is (not (contains? names "Main app card")))))
        (finally
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-root-listing-shows-the-worktree-own-collections-test
  (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "listing-coll-" (random-uuid))})]
    (try
      (mdb.worktree/with-worktree worktree-id
        (t2/insert-returning-pk! :model/Collection {:name "Branch collection" :location "/"}))
      (testing "the main app lists its own"
        (is (not (contains? (root-item-names nil) "Branch collection"))))
      (testing "a worktree lists the collections it checked out"
        (is (contains? (root-item-names worktree-id) "Branch collection")))
      (finally
        (remote-sync.db/delete-worktree! worktree-id)))))

(deftest worktree-header-refusals-test
  (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "header-" (random-uuid))})]
    (try
      (testing "a header that is not a positive integer is a 400"
        (doseq [bad ["abc" "0" "-1" "1.5" ""]]
          (mt/user-http-request :crowberto :get 400 "collection/root/items"
                                {:request-options {:headers {"x-metabase-worktree-id" bad}}})))
      (testing "a non-superuser may not enter a worktree"
        (mt/user-http-request :rasta :get 403 "collection/root/items" (worktree-header worktree-id)))
      (testing "a header naming no worktree is a 404"
        (mt/user-http-request :crowberto :get 404 "collection/root/items" (worktree-header Integer/MAX_VALUE)))
      (finally
        (remote-sync.db/delete-worktree! worktree-id)))))

(deftest search-reads-one-worktree-test
  (search.tu/with-appdb-search-if-available-without-fallback
    (mt/with-temp [:model/Card _ {:name "Zzyzx main app card"}]
      (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "search-" (random-uuid))})
            user-id           (mt/user->id :crowberto)
            names             #(into #{} (map :name) (search.tu/search-results "Zzyzx" {:current-user-id user-id}))]
        (try
          (mdb.worktree/with-worktree worktree-id
            (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                        {:name "Zzyzx branch card"})))
          (testing "the main app finds its own content"
            (is (contains? (names) "Zzyzx main app card"))
            (is (not (contains? (names) "Zzyzx branch card"))))
          (testing "a worktree finds what it checked out"
            (mdb.worktree/with-worktree worktree-id
              (is (contains? (names) "Zzyzx branch card"))
              (is (not (contains? (names) "Zzyzx main app card")))))
          (finally
            (remote-sync.db/delete-worktree! worktree-id)))))))

(deftest a-bookmark-stays-in-its-worktree-test
  (mt/with-temp [:model/Card main-card {:name "Main app bookmarked card" :collection_id nil}]
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "bookmark-" (random-uuid))})
          bookmark-names    #(->> (apply mt/user-http-request :crowberto :get 200 "bookmark" %&)
                                  (map :name)
                                  set)]
      (try
        (let [branch-card-id (mdb.worktree/with-worktree worktree-id
                               (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                                           {:name "Branch bookmarked card"
                                                                            :collection_id nil})))]
          (mt/user-http-request :crowberto :post 200 (str "bookmark/card/" (:id main-card)))
          (mt/user-http-request :crowberto :post 200 (str "bookmark/card/" branch-card-id) (worktree-header worktree-id))
          (testing "the main app lists only its own bookmarks"
            (is (= #{"Main app bookmarked card"} (bookmark-names))))
          (testing "a worktree lists only its own bookmarks"
            (is (= #{"Branch bookmarked card"} (bookmark-names (worktree-header worktree-id))))))
        (finally
          (t2/delete! :model/CardBookmark :user_id (mt/user->id :crowberto))
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-job-run-from-a-worktree-is-refused-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/TransformJob job {:name "Main app job" :schedule "0 0 0 * * ?"}]
      (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "job-run-" (random-uuid))})]
        (try
          (testing "running a job from a worktree answers with a 400 rather than never answering"
            (is (= "A transform job runs the main app's transforms, never a worktree's"
                   (:message (deref (future (mt/user-http-request :crowberto :post 400 (str "transform-job/" (:id job) "/run")
                                                                  (worktree-header worktree-id)))
                                    10000 {:message ::timed-out})))))
          (finally
            (remote-sync.db/delete-worktree! worktree-id)))))))

(deftest a-worktree-leaves-transform-jobs-alone-test
  (testing "transform jobs live only in the main app: a worktree reads them but changes none"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob {job-id :id} {:name "Main job" :schedule "0 0 0 * * ?"}]
        (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "jobs-" (random-uuid))})
              header            (worktree-header worktree-id)
              url               (str "transform-job/" job-id)]
          (try
            (is (false? (:can_execute (mt/user-http-request :crowberto :get 200 url header))))
            (mt/user-http-request :crowberto :post 403 "transform-job" header {:name "Branch job" :schedule "0 0 0 * * ?"})
            (mt/user-http-request :crowberto :put 403 url header {:name "Renamed" :schedule "0 0 1 * * ?"})
            (mt/user-http-request :crowberto :put 400 "transform-job/active" header {:active false})
            (mt/user-http-request :crowberto :delete 403 url header)
            (is (= {:name "Main job" :schedule "0 0 0 * * ?" :active true}
                   (t2/select-one [:model/TransformJob :name :schedule :active] :id job-id)))
            (finally
              (remote-sync.db/delete-worktree! worktree-id))))))))

(deftest a-remapping-stays-in-its-worktree-test
  (testing "a Field is shared by every world, but the remapping of one belongs to the world that made it"
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "remap-" (random-uuid))})
          field-id          (mt/id :venues :name)
          dimension-names   #(->> (apply mt/user-http-request :crowberto :get 200 (str "field/" field-id) %&)
                                  :dimensions
                                  (map :name)
                                  set)]
      (try
        (mt/user-http-request :crowberto :post 200 (str "field/" field-id "/dimension")
                              (worktree-header worktree-id)
                              {:type "internal" :name "Branch remapping"})
        (is (= #{"Branch remapping"} (dimension-names (worktree-header worktree-id))))
        (is (= #{} (dimension-names)))
        (finally
          (remote-sync.db/delete-worktree! worktree-id)))
      (testing "and it goes when the worktree does"
        (mdb.worktree/without-worktree-scoping
         (is (zero? (t2/count :model/Dimension :field_id field-id))))))))

(defn- venues-query
  []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- insert-transform!
  "Insert a Transform named `transform-name` into the world being worked in, returning its id."
  [transform-name]
  (t2/insert-returning-pk! :model/Transform {:name   transform-name
                                             :source {:type "query" :query (venues-query)}
                                             :target {:type "table" :schema "PUBLIC" :name (str "t_" (random-uuid))}}))

(defn- insert-run!
  "Insert a finished TransformRun of the Transform with `transform-id`, nil for one whose Transform is gone."
  [transform-id]
  (t2/insert-returning-pk! :model/TransformRun {:transform_id transform-id
                                                :transform_name "Gone"
                                                :status       "succeeded"
                                                :run_method   "manual"
                                                :start_time   (java.time.OffsetDateTime/now)
                                                :end_time     (java.time.OffsetDateTime/now)}))

(deftest a-transform-run-stays-in-its-worktree-test
  (mt/with-premium-features #{:transforms-basic}
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "runs-" (random-uuid))})
          header            (worktree-header worktree-id)
          main-transform-id (insert-transform! "Main transform")
          main-run-id       (insert-run! main-transform-id)
          orphan-run-id     (insert-run! nil)
          branch-run-id     (insert-run! (mdb.worktree/with-worktree worktree-id (insert-transform! "Branch transform")))
          run-ids           (fn [url & args]
                              (->> (apply mt/user-http-request :crowberto :get 200 url args)
                                   :data
                                   (keep (fn [{:keys [id run_type]}] (when (contains? #{nil "transform"} run_type) id)))
                                   (filter #{main-run-id orphan-run-id branch-run-id})
                                   set))]
      (try
        (testing "the main app lists its own runs, and the runs whose transform is gone"
          (is (= #{main-run-id orphan-run-id} (run-ids "transform/run")))
          (is (= #{main-run-id orphan-run-id} (run-ids "transform/runs"))))
        (testing "a worktree lists only the runs of its own transforms"
          (is (= #{branch-run-id} (run-ids "transform/run" header)))
          (is (= #{branch-run-id} (run-ids "transform/runs" header))))
        (testing "a run of another world is refused rather than failing"
          (mt/user-http-request :crowberto :get 403 (str "transform/run/" main-run-id) header)
          (mt/user-http-request :crowberto :get 403 (str "transform/run/" orphan-run-id) header)
          (mt/user-http-request :crowberto :get 403 (str "transform/run/" branch-run-id)))
        (testing "each world reads its own runs"
          (mt/user-http-request :crowberto :get 200 (str "transform/run/" main-run-id))
          (mt/user-http-request :crowberto :get 200 (str "transform/run/" branch-run-id) header))
        (finally
          (t2/delete! :model/TransformRun :id [:in [main-run-id orphan-run-id branch-run-id]])
          (t2/delete! :model/Transform :id main-transform-id)
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-worktree-leaves-field-values-alone-test
  (testing "Field values are shared by every world, so a worktree neither rescans nor discards them"
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "values-" (random-uuid))})
          header            (worktree-header worktree-id)
          field-id          (mt/id :venues :price)
          table-id          (mt/id :venues)]
      (mt/with-temp [:model/FieldValues {values-id :id} {:field_id              field-id
                                                         :type                  :full
                                                         :values                [1 2 3 4]
                                                         :human_readable_values ["$" "$$" "$$$" "$$$$"]}]
        (try
          (doseq [url [(str "field/" field-id "/rescan_values")
                       (str "field/" field-id "/discard_values")
                       (str "table/" table-id "/rescan_values")
                       (str "table/" table-id "/discard_values")
                       (str "database/" (mt/id) "/rescan_values")
                       (str "database/" (mt/id) "/discard_values")]]
            (testing url
              (mt/user-http-request :crowberto :post 400 url header)))
          (doseq [url ["data-studio/table/rescan-values" "data-studio/table/discard-values"]]
            (testing url
              (mt/user-http-request :crowberto :post 400 url header {:table_ids [table-id]})))
          (is (= ["$" "$$" "$$$" "$$$$"]
                 (t2/select-one-fn :human_readable_values :model/FieldValues :id values-id)))
          (finally
            (remote-sync.db/delete-worktree! worktree-id)))))))

(defn- card-on
  "A question built on the Card with `source-card-id`."
  [source-card-id]
  {:name                   "Built on another card"
   :display                "table"
   :visualization_settings {}
   :dataset_query          {:database (mt/id) :type "query" :query {:source-table (str "card__" source-card-id)}}})

(deftest a-card-is-built-only-on-cards-of-its-worktree-test
  (mt/with-temp [:model/Card {main-card-id :id} {:dataset_query (venues-query)}]
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "sources-" (random-uuid))})
          header            (worktree-header worktree-id)
          branch-card-id    (mdb.worktree/with-worktree worktree-id
                              (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                                          {:dataset_query (venues-query)})))
          refused           "A card can only be built on cards of its own worktree."]
      (try
        (testing "a card of another world is refused as a source"
          (is (= refused (:message (mt/user-http-request :crowberto :post 400 "card" header (card-on main-card-id)))))
          (is (= refused (:message (mt/user-http-request :crowberto :post 400 "card" (card-on branch-card-id))))))
        (testing "a card of its own world is accepted"
          (let [{card-id :id} (mt/user-http-request :crowberto :post 200 "card" header (card-on branch-card-id))]
            (testing ", and cannot be repointed at another world's"
              (is (= refused (:message (mt/user-http-request :crowberto :put 400 (str "card/" card-id) header
                                                             {:dataset_query (:dataset_query (card-on main-card-id))})))))))
        (finally
          (remote-sync.db/delete-worktree! worktree-id))))))
