(ns metabase.metabot.tools.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.util :as metabot.tools.util]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

(deftest ^:parallel schedule->schedule-map-test
  (testing "hourly schedule"
    (is (= {:schedule_type  "hourly"
            :schedule_hour  nil
            :schedule_day   nil
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency :hourly}))))
  (testing "daily schedule"
    (is (= {:schedule_type  "daily"
            :schedule_hour  9
            :schedule_day   nil
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency :daily
             :hour      9}))))
  (testing "weekly schedule"
    (is (= {:schedule_type  "weekly"
            :schedule_hour  8
            :schedule_day   "mon"
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency   :weekly
             :hour        8
             :day-of-week :monday}))))
  (testing "weekly schedule truncates day name to 3 chars"
    (is (= "wed"
           (:schedule_day
            (metabot.tools.util/schedule->schedule-map
             {:frequency   :weekly
              :hour        10
              :day-of-week :wednesday})))))
  (testing "monthly schedule with first-mon"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  6
            :schedule_day   "mon"
            :schedule_frame "first"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         6
             :day-of-month :first-mon}))))
  (testing "monthly schedule with last-fri"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  17
            :schedule_day   "fri"
            :schedule_frame "last"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         17
             :day-of-month :last-fri}))))
  (testing "monthly schedule with mid"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  12
            :schedule_day   nil
            :schedule_frame "mid"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         12
             :day-of-month :mid})))))

(deftest metabot-scope-query-test
  (testing "metabot-scope-query with collection hierarchy"
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                            :group_id group-id}
                       :model/Collection container-coll {:name "container coll"}
                       :model/Collection metabot-coll   {:name "mb coll"
                                                         :location (collection/location-path container-coll)}
                       :model/Collection mb-child-coll1 {:name "mbc1"
                                                         :location (collection/location-path container-coll metabot-coll)}
                       :model/Collection mb-child-coll2 {:name "mbc2"
                                                         :location (collection/location-path container-coll metabot-coll)}
                       :model/Collection non-mb-coll    {:name "non-mbc"
                                                         :location (collection/location-path container-coll)}
                       :model/Card mb-model1  {:type :model,  :collection_id (:id metabot-coll)}
                       :model/Card mb-model2  {:type :model,  :collection_id (:id mb-child-coll1)}
                       :model/Card mb-metric1 {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Card mb-metric2 {:type :metric, :collection_id (:id mb-child-coll2)}
                       :model/Card outside-model {:type :model, :collection_id (:id non-mb-coll)}
                       :model/Card outside-metric {:type :metric, :collection_id (:id non-mb-coll)}
                       :model/Metabot metabot {:name "metabot"
                                               :collection_id (:id metabot-coll)
                                               :use_verified_content false}]
          (perms/grant-collection-read-permissions! group-id metabot-coll)
          (perms/grant-collection-read-permissions! group-id mb-child-coll1)
          (perms/grant-collection-read-permissions! group-id mb-child-coll2)

          (testing "admin can see all cards in metabot collection and subcollections"
            (let [admin-result (mt/with-test-user :crowberto
                                 (metabot.tools.util/get-metrics-and-models (:id metabot)))
                  card-ids (set (map :id admin-result))]
              (is (contains? card-ids (:id mb-model1)))
              (is (contains? card-ids (:id mb-model2)))
              (is (contains? card-ids (:id mb-metric1)))
              (is (contains? card-ids (:id mb-metric2)))
              (is (not (contains? card-ids (:id outside-model))))
              (is (not (contains? card-ids (:id outside-metric))))))

          (testing "normal user sees only permitted cards"
            (let [user-result (mt/with-test-user :rasta
                                (metabot.tools.util/get-metrics-and-models (:id metabot)))
                  card-ids (set (map :id user-result))]
              (is (contains? card-ids (:id mb-model1)))
              (is (contains? card-ids (:id mb-model2)))
              (is (contains? card-ids (:id mb-metric1)))
              (is (contains? card-ids (:id mb-metric2))))))))))

(deftest metabot-scope-query-root-collection-test
  (testing "metabot-scope-query with root collection (null collection_id)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card root-model  {:type :model, :collection_id nil}
                     :model/Card root-metric {:type :metric, :collection_id nil}
                     :model/Collection some-coll {:name "some collection"}
                     :model/Card coll-model {:type :model, :collection_id (:id some-coll)}
                     :model/Metabot metabot {:name "root metabot"
                                             :collection_id nil
                                             :use_verified_content false}]
        (testing "metabot with root collection sees all content"
          (let [result (mt/with-test-user :crowberto
                         (metabot.tools.util/get-metrics-and-models (:id metabot)))
                card-ids (set (map :id result))]
            (is (contains? card-ids (:id root-model)))
            (is (contains? card-ids (:id root-metric)))
            (is (contains? card-ids (:id coll-model)))))))))

(deftest add-table-reference-test
  (testing "add-table-reference function adds table-reference for FK fields"
    (mt/dataset test-data
      (mt/with-current-user (mt/user->id :crowberto)
        (let [test-db-id (mt/id)
              mp (lib-be/application-database-metadata-provider test-db-id)
              orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
              columns (lib/visible-columns orders-query)]

          (testing "adds table-reference for implicitly joined columns"
            (let [processed-columns (map #(metabot.tools.util/add-table-reference orders-query %) columns)
                  user-name-column (first (filter #(and (= "NAME" (:name %))
                                                        (:fk-field-id %)) processed-columns))]
              (is (some? user-name-column) "Expected to find implicitly joined User NAME column")
              (is (contains? user-name-column :table-reference))
              (is (string? (:table-reference user-name-column)))
              (is (seq (:table-reference user-name-column)))
              (is (= "User" (:table-reference user-name-column)))))

          (testing "does not add table-reference for direct table columns"
            (let [processed-columns (map #(metabot.tools.util/add-table-reference orders-query %) columns)
                  id-column (first (filter #(and (= "ID" (:name %))
                                                 (not (:fk-field-id %))) processed-columns))]
              (is (some? id-column) "Expected to find direct ORDERS ID column")
              (is (not (contains? id-column :table-reference)))))

          (testing "handles columns without fk-field-id or table-id gracefully"
            (let [mock-column {:name "test-column" :type :string}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))

          (testing "handles columns with fk-field-id but no table-id"
            (let [mock-column {:name "test-fk" :fk-field-id 123}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))

          (testing "handles columns with table-id but no fk-field-id"
            (let [mock-column {:name "test-field" :table-id (mt/id :orders)}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference))))))))))

(deftest metabot-verified-content-test
  (testing "metabot-scope-query with verified content filtering"
    (mt/dataset test-data
      (mt/with-premium-features #{:content-verification}
        (mt/with-temp [:model/Collection metabot-coll {:name "mb coll"}
                       :model/Card verified-model {:type :model, :collection_id (:id metabot-coll)}
                       :model/Card unverified-model {:type :model, :collection_id (:id metabot-coll)}
                       :model/Card verified-metric {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Card unverified-metric {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Metabot verified-metabot {:name "verified metabot"
                                                        :collection_id (:id metabot-coll)
                                                        :use_verified_content true}
                       :model/Metabot unverified-metabot {:name "unverified metabot"
                                                          :collection_id (:id metabot-coll)
                                                          :use_verified_content false}]
        ;; Mark some content as verified
          (moderation/create-review! {:moderated_item_id (:id verified-model)
                                      :moderated_item_type "card"
                                      :moderator_id (mt/user->id :crowberto)
                                      :status "verified"
                                      :text "This is verified"})
          (moderation/create-review! {:moderated_item_id (:id verified-metric)
                                      :moderated_item_type "card"
                                      :moderator_id (mt/user->id :crowberto)
                                      :status "verified"
                                      :text "This is verified"})

          (testing "metabot with use_verified_content=true sees only verified content"
            (let [result (mt/with-test-user :crowberto
                           (metabot.tools.util/get-metrics-and-models (:id verified-metabot)))
                  card-ids (set (map :id result))]
              (is (contains? card-ids (:id verified-model)))
              (is (contains? card-ids (:id verified-metric)))
              (is (not (contains? card-ids (:id unverified-model))))
              (is (not (contains? card-ids (:id unverified-metric))))))

          (testing "metabot with use_verified_content=false sees all content"
            (let [result (mt/with-test-user :crowberto
                           (metabot.tools.util/get-metrics-and-models (:id unverified-metabot)))
                  card-ids (set (map :id result))]
              (is (contains? card-ids (:id verified-model)))
              (is (contains? card-ids (:id verified-metric)))
              (is (contains? card-ids (:id unverified-model)))
              (is (contains? card-ids (:id unverified-metric)))
              (testing "Verified content comes first"
                (let [ordered-ids (map :id result)
                      verified-ids #{(:id verified-model) (:id verified-metric)}
                      unverified-ids #{(:id unverified-model) (:id unverified-metric)}]
                  (is (every? verified-ids (take 2 ordered-ids)))
                  (is (every? unverified-ids (drop 2 ordered-ids))))))))))))

(deftest get-table-filters-inactive-test
  (testing "get-table only returns active tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {active-table-id :id} {:db_id db-id, :name "active_table", :active true, :visibility_type nil}
                   :model/Table {inactive-table-id :id} {:db_id db-id, :name "inactive_table", :active false, :visibility_type nil}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= active-table-id (:id (metabot.tools.util/get-table active-table-id))))
        (is (thrown? clojure.lang.ExceptionInfo
                     (metabot.tools.util/get-table inactive-table-id)))))))

(deftest find-column-by-field-id-test
  (testing "finds column by integer field ID"
    (let [columns [{:id 301 :name "ID"}
                   {:id 302 :name "NAME"}
                   {:id 303 :name "EMAIL"}]]
      (is (= {:id 301 :name "ID"} (metabot.tools.util/find-column-by-field-id 301 columns)))
      (is (= {:id 303 :name "EMAIL"} (metabot.tools.util/find-column-by-field-id 303 columns)))))

  (testing "finds column by string-encoded field ID"
    (let [columns [{:id 301 :name "ID"}
                   {:id 302 :name "NAME"}]]
      (is (= {:id 302 :name "NAME"} (metabot.tools.util/find-column-by-field-id "302" columns)))))

  (testing "throws agent error when field ID not found"
    (let [columns [{:id 301 :name "ID"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Field 999 not found"
           (metabot.tools.util/find-column-by-field-id 999 columns)))))

  (testing "throws for nil field ID"
    (let [columns [{:id 301 :name "ID"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not found"
           (metabot.tools.util/find-column-by-field-id nil columns)))))

  (testing "error data contains agent-error? flag"
    (let [columns [{:id 301 :name "ID"}]]
      (try
        (metabot.tools.util/find-column-by-field-id 999 columns)
        (is false "Expected exception")
        (catch clojure.lang.ExceptionInfo e
          (is (:agent-error? (ex-data e)))
          (is (= 404 (:status-code (ex-data e)))))))))
