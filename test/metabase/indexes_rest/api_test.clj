(ns ^:synchronous metabase.indexes-rest.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; `transforms-enabled` is false unless explicitly set off-cloud, and every index endpoint inherits the transform's
;; permission checks, which fail when transforms are disabled.
(use-fixtures :each (fn [thunk]
                      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
                        (thunk))))

(defn- temp-transform-spec
  "A real query transform over a test-data table. Query transforms are available without a premium feature on
  non-hosted instances, so a superuser passes the transform read/write checks the index endpoints rely on."
  []
  {:name   (mt/random-name)
   :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(defn- temp-incremental-transform-spec []
  (assoc-in (temp-transform-spec) [:target :type] "table-incremental"))

(def ^:private btree {:kind "btree" :name "by_cat" :columns [{:name "name"}]})

(deftest crud-happy-path-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (testing "POST creates a create-pending index"
      (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                          {:transform_id transform-id :structured btree})]
        (is (= "create-pending" (:status created)))
        (is (= transform-id (:transform_id created)))
        (is (= "by_cat" (:index_name created)))
        (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] [])]
          (testing "GET lists it for the transform (managed hint, not yet in the warehouse)"
            (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                       (str "index?transform-id=" transform-id))]
              (is (= [(:id created)] (map #(get-in % [:request :id]) data)))
              (is (false? (:present_in_warehouse (first data))))))
          (testing "the listed index carries no mirrored table_id"
            (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                       (str "index?transform-id=" transform-id))]
              (is (not (contains? (first data) :table_id))))))
        (testing "GET /request/:id fetches one (status poll)"
          (is (= "by_cat" (:index_name (mt/user-http-request :crowberto :get 200
                                                             (str "index/request/" (:id created)))))))
        (testing "PUT replaces the structured definition"
          (let [updated (mt/user-http-request :crowberto :put 200 (str "index/request/" (:id created))
                                              {:structured (assoc btree :columns [{:name "price"}])})]
            (is (= "update-pending" (:status updated)))
            (is (= "price" (-> updated :structured :columns first :name)))))
        (testing "DELETE marks it delete-pending until a rebuild drops the warehouse index"
          (mt/user-http-request :crowberto :delete 204 (str "index/request/" (:id created)))
          (with-redefs [metabase.driver/fetch-table-indexes
                        (fn [& _] [{:name "by_cat" :kind :btree :access-method "btree" :is-unique false
                                    :is-primary false :is-valid true :key-columns ["name"] :include-columns []
                                    :partial-predicate nil :definition "..."}])]
            (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                       (str "index?transform-id=" transform-id))]
              (is (= [(:id created)] (map #(get-in % [:request :id]) data)))
              (is (= "delete-pending" (-> data first :request :status)))
              (is (true? (:present_in_warehouse (first data)))))))))))

(deftest merged-list-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                        {:transform_id transform-id :structured btree})
          ;; one warehouse index matching the managed one by name, plus a DBA-made one
          wh [{:name "by_cat" :kind :btree :access-method "btree" :is-unique false :is-primary false
               :is-valid true :key-columns ["name"] :include-columns [] :partial-predicate nil :definition "..."}
              {:name "dba_made" :kind :btree :access-method "btree" :is-unique false :is-primary false
               :is-valid true :key-columns ["price"] :include-columns [] :partial-predicate nil :definition "..."}]]
      (with-redefs [metabase.driver/fetch-table-indexes (fn [& _] wh)]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                   (str "index?transform-id=" transform-id))
              by-name (group-by :name data)]
          (testing "the managed index is observed from the warehouse, flagged managed, request carries its id"
            (let [e (first (get by-name "by_cat"))]
              (is (true? (:metabase_managed e)))
              (is (true? (:present_in_warehouse e)))
              (is (= (:id created) (-> e :request :id)))))
          (testing "the DBA index appears, unmanaged, observed, with no request bookkeeping"
            (let [e (first (get by-name "dba_made"))]
              (is (false? (:metabase_managed e)))
              (is (true? (:present_in_warehouse e)))
              (is (= ["price"] (:key_columns e)))
              (is (nil? (:request e)))))
          (testing "nothing unmanaged was persisted"
            (is (= 1 (count (t2/select :model/TableIndex :transform_id transform-id))))))))))

(deftest index-endpoints-require-transform-permission-test
  (testing "every index endpoint inherits the transform's permission: a user without access is blocked from all of them"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [req-id (:id (mt/user-http-request :crowberto :post 200 "index/request"
                                              {:transform_id transform-id :structured btree}))]
        (testing "reads require transform read access"
          (mt/user-http-request :rasta :get 403 (str "index?transform-id=" transform-id))
          (mt/user-http-request :rasta :get 403 (str "index/request/" req-id)))
        (testing "mutations require transform write access"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "index/request"
                                       {:transform_id transform-id :structured btree})))
          (mt/user-http-request :rasta :put 403 (str "index/request/" req-id)
                                {:structured (assoc btree :columns [{:name "price"}])})
          (mt/user-http-request :rasta :delete 403 (str "index/request/" req-id)))))))

(deftest list-requires-transform-id-test
  (testing "GET requires transform-id"
    (is (re-find #"transform-id"
                 (str (mt/user-http-request :crowberto :get 400 "index"))))))

(deftest unknown-transform-404s-test
  (testing "creating an index for a non-existent transform 404s"
    (mt/user-http-request :crowberto :post 404 "index/request"
                          {:transform_id Integer/MAX_VALUE :structured btree})))

(deftest duplicate-index-name-rejected-test
  (testing "you can't create two indexes with the same name on one transform"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (mt/user-http-request :crowberto :post 200 "index/request"
                            {:transform_id transform-id :structured btree})
      (is (re-find #"already exists"
                   (mt/user-http-request :crowberto :post 400 "index/request"
                                         {:transform_id transform-id :structured btree}))))))

(deftest malformed-structured-rejected-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (testing "an unknown :kind is rejected before it can reach the DB"
      (mt/user-http-request :crowberto :post 400 "index/request"
                            {:transform_id transform-id :structured (assoc btree :kind "not_a_kind")}))
    (testing "a name over the 63-char limit is rejected"
      (mt/user-http-request :crowberto :post 400 "index/request"
                            {:transform_id transform-id
                             :structured   (assoc btree :name (apply str (repeat 64 "a")))}))
    (testing "a 63-char name is accepted (boundary)"
      (mt/user-http-request :crowberto :post 200 "index/request"
                            {:transform_id transform-id
                             :structured   (assoc btree :name (apply str (repeat 63 "a")))}))))

(deftest put-cannot-change-index-key-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                        {:transform_id transform-id :structured btree})]
      (testing "name is stable"
        (is (re-find #"name cannot be changed"
                     (mt/user-http-request :crowberto :put 400 (str "index/request/" (:id created))
                                           {:structured (assoc btree :name "by_price")}))))
      (testing "kind is stable"
        (is (re-find #"type cannot be changed"
                     (mt/user-http-request :crowberto :put 400 (str "index/request/" (:id created))
                                           {:structured (assoc btree :kind "hash")})))))))

(deftest soft-deleted-index-cannot-be-recreated-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                        {:transform_id transform-id :structured btree})]
      (mt/user-http-request :crowberto :delete 204 (str "index/request/" (:id created)))
      (is (re-find #"already exists"
                   (mt/user-http-request :crowberto :post 400 "index/request"
                                         {:transform_id transform-id :structured btree})))
      (is (= 1 (count (t2/select :model/TableIndex :transform_id transform-id)))))))

(deftest incremental-mutations-force-next-run-to-rebuild-test
  (mt/with-temp [:model/Transform {transform-id :id} (assoc (temp-incremental-transform-spec)
                                                            :last_checkpoint_value "100")]
    (letfn [(full-run? []
              (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform transform-id)))]
      (testing "no index changes: the watermark alone decides, so the next run appends"
        (is (not (full-run?))))
      (testing "POST leaves the watermark alone; the pending row forces the rebuild"
        (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                            {:transform_id transform-id :structured btree})]
          (is (= "100" (t2/select-one-fn :last_checkpoint_value :model/Transform transform-id)))
          (is (full-run?))
          (testing "PUT keeps forcing it (update-pending)"
            (mt/user-http-request :crowberto :put 200 (str "index/request/" (:id created))
                                  {:structured (assoc btree :columns [{:name "price"}])})
            (is (full-run?)))
          (testing "DELETE keeps forcing it (delete-pending), so the rebuild can drop the old index"
            (mt/user-http-request :crowberto :delete 204 (str "index/request/" (:id created)))
            (is (full-run?)))
          (testing "once the request settles, runs go back to appending"
            (t2/update! (t2/table-name :model/TableIndex) (:id created) {:status "succeeded"})
            (is (not (full-run?)))))))))

(deftest inline-kind-index-name-test
  (testing "an inline kind with no :name gets its index_name from :kind"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [created (mt/user-http-request :crowberto :post 200 "index/request"
                                          {:transform_id transform-id
                                           :structured {:kind "sortkey" :style "compound" :columns [{:name "name"}]}})]
        (is (= "sortkey" (:index_name created)))))))
