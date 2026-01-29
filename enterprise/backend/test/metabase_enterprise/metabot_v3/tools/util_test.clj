(ns metabase-enterprise.metabot-v3.tools.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.util]
   [metabase.collections.models.collection :as collection]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

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
                                 (metabot-v3.tools.util/get-metrics-and-models (:id metabot)))
                  card-ids (set (map :id admin-result))]
              (is (contains? card-ids (:id mb-model1)))
              (is (contains? card-ids (:id mb-model2)))
              (is (contains? card-ids (:id mb-metric1)))
              (is (contains? card-ids (:id mb-metric2)))
              (is (not (contains? card-ids (:id outside-model))))
              (is (not (contains? card-ids (:id outside-metric))))))

          (testing "normal user sees only permitted cards"
            (let [user-result (mt/with-test-user :rasta
                                (metabot-v3.tools.util/get-metrics-and-models (:id metabot)))
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
                         (metabot-v3.tools.util/get-metrics-and-models (:id metabot)))
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
            (let [processed-columns (map #(metabot-v3.tools.util/add-table-reference orders-query %) columns)
                  user-name-column (first (filter #(and (= "NAME" (:name %))
                                                        (:fk-field-id %)) processed-columns))]
              (is (some? user-name-column) "Expected to find implicitly joined User NAME column")
              (is (contains? user-name-column :table-reference))
              (is (string? (:table-reference user-name-column)))
              (is (seq (:table-reference user-name-column)))
              (is (= "User" (:table-reference user-name-column)))))

          (testing "does not add table-reference for direct table columns"
            (let [processed-columns (map #(metabot-v3.tools.util/add-table-reference orders-query %) columns)
                  id-column (first (filter #(and (= "ID" (:name %))
                                                 (not (:fk-field-id %))) processed-columns))]
              (is (some? id-column) "Expected to find direct ORDERS ID column")
              (is (not (contains? id-column :table-reference)))))

          (testing "handles columns without fk-field-id or table-id gracefully"
            (let [mock-column {:name "test-column" :type :string}
                  result (metabot-v3.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))

          (testing "handles columns with fk-field-id but no table-id"
            (let [mock-column {:name "test-fk" :fk-field-id 123}
                  result (metabot-v3.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))

          (testing "handles columns with table-id but no fk-field-id"
            (let [mock-column {:name "test-field" :table-id (mt/id :orders)}
                  result (metabot-v3.tools.util/add-table-reference orders-query mock-column)]
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
                           (metabot-v3.tools.util/get-metrics-and-models (:id verified-metabot)))
                  card-ids (set (map :id result))]
              (is (contains? card-ids (:id verified-model)))
              (is (contains? card-ids (:id verified-metric)))
              (is (not (contains? card-ids (:id unverified-model))))
              (is (not (contains? card-ids (:id unverified-metric))))))

          (testing "metabot with use_verified_content=false sees all content"
            (let [result (mt/with-test-user :crowberto
                           (metabot-v3.tools.util/get-metrics-and-models (:id unverified-metabot)))
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

(deftest parse-field-id-test
  (testing "parse-field-id parses valid field IDs correctly"
    (testing "table field IDs with numeric table ID"
      (is (= {:model-tag "t", :model-id 154, :field-index 1}
             (metabot-v3.tools.util/parse-field-id "t154-1")))
      (is (= {:model-tag "t", :model-id 1, :field-index 0}
             (metabot-v3.tools.util/parse-field-id "t1-0")))
      (is (= {:model-tag "t", :model-id 999, :field-index 42}
             (metabot-v3.tools.util/parse-field-id "t999-42"))))

    (testing "card/model/metric field IDs with numeric card ID"
      (is (= {:model-tag "c", :model-id 125, :field-index 7}
             (metabot-v3.tools.util/parse-field-id "c125-7")))
      (is (= {:model-tag "c", :model-id 2, :field-index 0}
             (metabot-v3.tools.util/parse-field-id "c2-0"))))

    (testing "query field IDs with nano-id string"
      (is (= {:model-tag "q", :model-id "puL95JSvym3k23W1UUuog", :field-index 0}
             (metabot-v3.tools.util/parse-field-id "qpuL95JSvym3k23W1UUuog-0")))
      (is (= {:model-tag "q", :model-id "abc123XYZ", :field-index 5}
             (metabot-v3.tools.util/parse-field-id "qabc123XYZ-5"))))

    (testing "query field IDs with nano-id containing dashes"
      (is (= {:model-tag "q", :model-id "wG9GfYTcE-wKTg3wlZyuc", :field-index 6}
             (metabot-v3.tools.util/parse-field-id "qwG9GfYTcE-wKTg3wlZyuc-6")))
      (is (= {:model-tag "q", :model-id "a-b-c", :field-index 0}
             (metabot-v3.tools.util/parse-field-id "qa-b-c-0"))))))

(deftest resolve-column-test
  (testing "resolve-column resolves field IDs to columns"
    (let [columns [{:name "ID" :table-id 1 :type :number}           ; index 0
                   {:name "NAME" :table-id 1 :type :string}         ; index 1
                   {:name "EMAIL" :table-id 1 :type :string}        ; index 2
                   {:name "USER_ID" :table-id 2 :type :number}      ; index 0 for table 2
                   {:name "TOTAL" :table-id 2 :type :number}]]      ; index 1 for table 2
      (testing "resolves table field IDs correctly"
        (let [item {:field-id "t1-0" :operation "equals"}
              result (metabot-v3.tools.util/resolve-column item "t1-" columns)]
          (is (= "ID" (get-in result [:column :name])))
          (is (= 1 (get-in result [:column :table-id])))
          (is (= :number (get-in result [:column :type])))))

      (testing "resolves field IDs using flat index into columns vector"
        (let [item {:field-id "t1-3" :operation "equals"}
              result (metabot-v3.tools.util/resolve-column item "t1-" columns)]
          (is (= "USER_ID" (get-in result [:column :name])))
          (is (= 2 (get-in result [:column :table-id])))))

      (testing "resolves card field IDs using flat index"
        (let [item {:field-id "c125-1" :operation "equals"}
              result (metabot-v3.tools.util/resolve-column item "c125-" columns)]
          (is (= "NAME" (get-in result [:column :name])))
          (is (= 1 (get-in result [:column :table-id])))))

      (testing "resolves query field IDs using flat index"
        (let [item {:field-id "qabc123-2" :operation "equals"}
              result (metabot-v3.tools.util/resolve-column item "qabc123-" columns)]
          (is (= "EMAIL" (get-in result [:column :name])))))))

  (testing "resolve-column throws for invalid field IDs"
    (let [columns [{:name "ID" :table-id 1 :type :number}
                   {:name "NAME" :table-id 1 :type :string}]]
      (testing "throws for invalid field ID format"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid field_id format"
             (metabot-v3.tools.util/resolve-column {:field-id "invalid"} "t1-" columns)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid field_id format"
             (metabot-v3.tools.util/resolve-column {:field-id "t154/1"} "t154-" columns))))

      (testing "throws when field index is out of bounds"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"field t1-10 not found"
             (metabot-v3.tools.util/resolve-column {:field-id "t1-10"} "t1-" columns))))

      (testing "throws when field ID prefix doesn't match expected prefix"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"does not match expected prefix"
             (metabot-v3.tools.util/resolve-column {:field-id "t999-0"} "t1-" columns)))))))
