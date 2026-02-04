(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "EE-only tests for /api/transform feature gating."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :refer [get-test-schema
                                          parse-instant
                                          with-transform-cleanup!]]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- query-transform-payload
  [table-name]
  {:name   "Test Transform"
   :source {:type  "query"
            :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
   :target {:type   "table"
            :schema (get-test-schema)
            :name   table-name}})

(defn- python-transform-map
  [table-name]
  {:name   "Python Transform"
   :source {:type            "python"
            :body            "print('hello world')"
            :source-tables   {}
            :source-database (mt/id)}
   :target {:type     "table"
            :schema   (get-test-schema)
            :name     table-name
            :database (mt/id)}})

(defn- search-transform-ids
  [search-term]
  (into #{}
        (comp (filter #(= "transform" (name (:model %))))
              (map :id))
        (search.tu/search-results search-term)))

(defn- search-api-transform-ids
  [user search-term]
  (let [response (mt/user-http-request user :get 200 "search" :q search-term :models "transform")]
    (set (map :id (:data response)))))

(deftest create-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:hosting}
      (mt/dataset transforms-dataset/transforms-test
        (let [table-name (str "test_transform_" (u/generate-nano-id))
              response   (mt/user-http-request :crowberto :post 402 "transform"
                                               (query-transform-payload table-name))]
          (is (= "Premium features required for this transform type are not enabled." response)))))))

(deftest update-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:hosting}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (let [response (mt/user-http-request :crowberto :put 402
                                               (format "transform/%d" transform-id)
                                               {:name "Updated Transform"})]
            (is (= "Premium features required for this transform type are not enabled." response))))))))

(deftest run-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:hosting}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (mt/user-http-request :crowberto :post 403
                                (format "transform/%d/run" transform-id)))))))

(deftest list-transforms-404-without-feature-test
  (mt/with-premium-features #{:hosting}
    (mt/user-http-request :crowberto :get 403 "transform")))

(deftest get-transform-404-without-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:hosting}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (mt/user-http-request :crowberto :get 403 (format "transform/%d" transform-id)))))))

(deftest list-transforms-excludes-python-without-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {query-id :id} {}
                       :model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (let [response (mt/user-http-request :crowberto :get 200 "transform")
                ids      (set (map :id response))]
            (is (contains? ids query-id))
            (is (not (contains? ids python-id)))))))))

(deftest get-python-transform-403-without-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (mt/user-http-request :crowberto :get 403 (format "transform/%d" python-id)))))))

(deftest get-python-transform-200-with-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :transforms-python}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (let [response (mt/user-http-request :crowberto :get 200 (format "transform/%d" python-id))]
            (is (= "python" (:source_type response)))))))))

(deftest create-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table-name "gadget_products"]
              (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                           :router_database_id (mt/id)
                                                           :details {:destination_database true}}
                             :model/DatabaseRouter _ {:database_id (mt/id)
                                                      :user_attribute "db_name"}]
                (is (= "Transforms are not supported on databases with DB routing enabled."
                       (mt/user-http-request :crowberto :post 400 "transform"
                                             (query-transform-payload table-name))))))))))))

(deftest update-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                       :router_database_id (mt/id)
                                                       :details {:destination_database true}}
                         :model/DatabaseRouter _ {:database_id (mt/id)
                                                  :user_attribute "db_name"}
                         :model/Transform transform (query-transform-payload table-name)]
            (is (= "Transforms are not supported on databases with DB routing enabled."
                   (mt/user-http-request :crowberto :put 400 (format "transform/%s" (:id transform))
                                         (assoc transform :name "Gadget Products 2"))))))))))

(deftest search-filters-transform-source-types-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [search-term (str "transform-search-" (u/generate-nano-id))
            query-name  (str search-term "-query")
            python-name (str search-term "-python")]
        (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                              :name query-name)
                       :model/Transform {python-id :id} (assoc (python-transform-map (str "target_" (u/generate-nano-id)))
                                                               :name python-name)]
          (search.tu/with-new-search-and-legacy-search
            (testing "no hosting feature"
              (mt/with-premium-features #{}
                (is (= #{query-id} (search-transform-ids search-term)))))
            (testing "no transforms feature"
              (mt/with-premium-features #{:hosting}
                (is (empty? (search-transform-ids search-term)))))
            (testing "transforms only"
              (mt/with-premium-features #{:transforms :hosting}
                (is (= #{query-id} (search-transform-ids search-term)))))
            (testing "transforms and transforms-python"
              (mt/with-premium-features #{:transforms :transforms-python :hosting}
                (is (= #{query-id python-id} (search-transform-ids search-term)))))))))))

(deftest search-filtering-updates-with-feature-flips-without-reindex-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [search-term (str "transform-search-" (u/generate-nano-id))
            query-name  (str search-term "-query")
            python-name (str search-term "-python")]
        (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                              :name query-name)
                       :model/Transform {python-id :id} (assoc (python-transform-map (str "target_" (u/generate-nano-id)))
                                                               :name python-name)]
          (search.tu/with-new-search-and-legacy-search
            (mt/with-premium-features #{:transforms :transforms-python :hosting}
              (is (= #{query-id python-id} (search-transform-ids search-term))))
            (mt/with-premium-features #{:transforms :hosting}
              (is (= #{query-id} (search-transform-ids search-term))))
            (mt/with-premium-features #{:hosting}
              (is (empty? (search-transform-ids search-term))))
            (mt/with-premium-features #{}
              (is (= #{query-id} (search-transform-ids search-term))))))))))

(deftest search-api-transform-models-empty-without-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:hosting}
      (mt/dataset transforms-dataset/transforms-test
        (let [search-term (str "transform-search-" (u/generate-nano-id))
              query-name  (str search-term "-query")]
          (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                                :name query-name)]
            (search.tu/with-new-search-and-legacy-search
              (let [ids (search-api-transform-ids :crowberto search-term)]
                (is (empty? ids))
                (is (not (contains? ids query-id)))))))))))

;;; ------------------------------------------------------------
;;; Run List Sorting - TODO [OSS] - move this to OSS
;;; ------------------------------------------------------------

(deftest get-runs-sort-by-transform-name-test
  (testing "GET /api/transform/run - sort by transform-name"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-b-id :id} {:name "Transform B"}
                     :model/Transform    {transform-a-id :id} {:name "Transform A"}
                     :model/TransformRun {run-b-id :id}       {:transform_id transform-b-id}
                     :model/TransformRun {run-a-id :id}       {:transform_id transform-a-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "transform-name"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-a-id transform-b-id])]
              (is (= (cond-> [run-a-id run-b-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-stable-test
  (testing "GET /api/transform/run - sorting is stable when values are equal (tiebreaker by :id)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-1-id :id} {:name "Same Name"}
                     :model/Transform    {transform-2-id :id} {:name "Same Name"}
                     :model/TransformRun {run-1-id :id}       {:transform_id transform-1-id}
                     :model/TransformRun {run-2-id :id}       {:transform_id transform-2-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "transform-name"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-1-id transform-2-id])]
              (is (= (cond-> [run-1-id run-2-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-start-time-test
  (testing "GET /api/transform/run - sort by start-time"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id} {}
                     :model/TransformRun {earlier-run-id :id} {:transform_id transform-id
                                                               :start_time   (parse-instant "2025-01-01T00:00:00")}
                     :model/TransformRun {later-run-id :id}   {:transform_id transform-id
                                                               :start_time   (parse-instant "2025-01-02T00:00:00")}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "start-time"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [earlier-run-id later-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-end-time-test
  (testing "GET /api/transform/run - sort by end-time"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id} {}
                     :model/TransformRun {earlier-run-id :id} {:transform_id transform-id
                                                               :end_time     (parse-instant "2025-01-01T00:00:00")}
                     :model/TransformRun {later-run-id :id}   {:transform_id transform-id
                                                               :end_time     (parse-instant "2025-01-02T00:00:00")}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "end-time"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [earlier-run-id later-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-run-method-test
  (testing "GET /api/transform/run - sort by run-method (translated names)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id}   {}
                     ;; "Manual" < "Schedule"
                     :model/TransformRun {manual-run-id :id}   {:transform_id transform-id :run_method "manual"}
                     :model/TransformRun {schedule-run-id :id} {:transform_id transform-id :run_method "cron"}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "run-method"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [manual-run-id schedule-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-status-test
  (testing "GET /api/transform/run - sort by status (translated names)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id}        {}
                     ;; Sorted by translated name: "Canceled" < "Canceling" < "Failed" < "In progress" < "Success" < "Timeout"
                     :model/TransformRun {canceled-run-id :id}     {:transform_id transform-id :status "canceled"}
                     :model/TransformRun {canceling-run-id :id}    {:transform_id transform-id :status "canceling"}
                     :model/TransformRun {failed-run-id :id}       {:transform_id transform-id :status "failed"}
                     :model/TransformRun {in-progress-run-id :id}  {:transform_id transform-id :status "started"
                                                                    :is_active    true}
                     :model/TransformRun {success-run-id :id}      {:transform_id transform-id :status "succeeded"}
                     :model/TransformRun {timeout-run-id :id}      {:transform_id transform-id :status "timeout"}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "status"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [canceled-run-id canceling-run-id failed-run-id
                              in-progress-run-id success-run-id timeout-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-transform-tags-test
  (testing "GET /api/transform/run - sort by transform-tags (first tag name)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformTag          {tag-a-id :id}       {:name "Tag A"}
                     :model/TransformTag          {tag-b-id :id}       {:name "Tag B"}
                     :model/TransformTag          {tag-ignored-id :id} {:name "Tag Ignored"}
                     ;; Transform with tags "Tag A" (pos 0) and "Tag Ignored" (pos 1) — sorted by first tag "Tag A"
                     :model/Transform             {transform-a-id :id} {:name "Transform A"}
                     :model/TransformTransformTag _                    {:transform_id transform-a-id :tag_id tag-a-id       :position 0}
                     :model/TransformTransformTag _                    {:transform_id transform-a-id :tag_id tag-ignored-id :position 1}
                     ;; Transform with tag "Tag B" (pos 0) — sorted by first tag "Tag B"
                     :model/Transform             {transform-b-id :id} {:name "Transform B"}
                     :model/TransformTransformTag _                    {:transform_id transform-b-id :tag_id tag-b-id :position 0}
                     :model/TransformRun          {run-a-id :id}       {:transform_id transform-a-id}
                     :model/TransformRun          {run-b-id :id}       {:transform_id transform-b-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "transform-tags"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-a-id transform-b-id])]
              (is (= (cond-> [run-a-id run-b-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-built-in-transform-tags-test
  (testing "GET /api/transform/run - sort by built-in transform-tags (translated names)"
    (mt/with-premium-features #{:transforms}
      ;; Translated names alphabetically: "daily" < "hourly" < "monthly" < "weekly"
      (mt/with-temp [:model/TransformTag {tag-daily-id :id}
                     {:name "daily" :built_in_type "daily"}

                     :model/TransformTag {tag-hourly-id :id}
                     {:name "hourly" :built_in_type "hourly"}

                     :model/TransformTag {tag-monthly-id :id}
                     {:name "monthly" :built_in_type "monthly"}

                     :model/TransformTag {tag-weekly-id :id}
                     {:name "weekly" :built_in_type "weekly"}

                     :model/Transform {transform-daily-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-daily-id
                                                     :tag_id       tag-daily-id
                                                     :position     0}

                     :model/Transform {transform-hourly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-hourly-id
                                                     :tag_id       tag-hourly-id
                                                     :position     0}

                     :model/Transform {transform-monthly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-monthly-id
                                                     :tag_id       tag-monthly-id
                                                     :position     0}

                     :model/Transform {transform-weekly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-weekly-id
                                                     :tag_id       tag-weekly-id
                                                     :position     0}

                     :model/TransformRun {daily-run-id :id}
                     {:transform_id transform-daily-id}

                     :model/TransformRun {hourly-run-id :id}
                     {:transform_id transform-hourly-id}

                     :model/TransformRun {monthly-run-id :id}
                     {:transform_id transform-monthly-id}

                     :model/TransformRun {weekly-run-id :id}
                     {:transform_id transform-weekly-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                                 :sort_column "transform-tags"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-daily-id transform-hourly-id
                                                                 transform-monthly-id transform-weekly-id])]
              (is (= (cond-> [daily-run-id hourly-run-id monthly-run-id weekly-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-hydrate-collection-test
  (testing "GET /api/transform/run - hydrates collection on transform"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Subfolder" :namespace :transforms}
                     :model/Transform {transform-in-collection-id :id} {:collection_id collection-id}
                     :model/Transform {transform-in-root-id :id} {:collection_id nil}
                     :model/TransformRun {run-in-collection-id :id} {:transform_id transform-in-collection-id}
                     :model/TransformRun {run-in-root-id :id} {:transform_id transform-in-root-id}]
        (let [response (mt/user-http-request :crowberto :get 200 "transform/run"
                                             :transform_ids [transform-in-collection-id
                                                             transform-in-root-id])
              runs-by-id (m/index-by :id (:data response))]
          (testing "transform in explicit collection has that collection hydrated"
            (is (= "Subfolder"
                   (get-in (runs-by-id run-in-collection-id) [:transform :collection :name]))))
          (testing "transform in root collection has root collection hydrated"
            (is (= "Transforms"
                   (get-in (runs-by-id run-in-root-id) [:transform :collection :name])))))))))
