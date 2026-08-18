(ns metabase.search.debug-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.permissions.util :as perms-util]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (binding [search.ingestion/*force-sync* true]
                        (thunk))))

(defn- diagnose
  "Build a search context from the currently bound API user (plus `overrides`) and run [[search/diagnose]]."
  [overrides expected-model expected-id]
  (search/diagnose
   (search/search-context
    (merge {:current-user-id       api/*current-user-id*
            :current-user-perms    @api/*current-user-permissions-set*
            :is-superuser?         api/*is-superuser?*
            :is-impersonated-user? (perms-util/impersonated-user?)
            :is-sandboxed-user?    (perms-util/sandboxed-user?)
            :archived              false
            :context               :default
            :search-string         nil
            :models                search.config/all-models
            :model-ancestors?      false}
           overrides))
   expected-model expected-id))

(deftest ^:synchronized not-searchable-test
  (testing "A card inside a document is excluded by the spec's :where clause"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Doc"}
                   :model/Card {card-id :id} {:name "In A Document" :document_id doc-id}]
      (mt/with-test-user :crowberto
        (is (=? {:type :not-searchable :details {:reason :excluded-by-where :search-model "card"}}
                (diagnose {:search-string "document"} "card" card-id))))))
  (testing "A model with no search spec"
    (mt/with-test-user :crowberto
      (is (=? {:type :not-searchable :details {:reason :no-spec :search-model "user"}}
              (diagnose {} "user" 1)))))
  (testing "A searchable model whose row does not exist is reported as such, not excluded-by-where"
    (mt/with-test-user :crowberto
      (is (=? {:type :not-searchable :details {:reason :does-not-exist :search-model "card"}}
              (diagnose {:search-string "x"} "card" Integer/MAX_VALUE))))))

(deftest ^:synchronized missing-from-index-test
  (when (search/supports-index?)
    (testing "A card the spec would index but which is absent from the active index"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue"}]
          (search/reindex! {:async? false :in-place? true})
          (t2/delete! (search.index/active-table) :model "card" :model_id (str card-id))
          (mt/with-test-user :crowberto
            (is (=? {:type :missing-from-index :details {:active-table some?}}
                    (diagnose {:search-string "quarterly"} "card" card-id)))))))))

(deftest ^:synchronized filtered-test
  (when (search/supports-index?)
    (testing "Excluded by a structural filter (created-by)"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue" :creator_id (mt/user->id :crowberto)}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-test-user :crowberto
            (is (=? {:type :filtered :details {:excluded-by :created-by}}
                    (diagnose {:search-string "quarterly" :created-by #{(mt/user->id :rasta)}} "card" card-id)))))))
    (testing "Excluded because the model is not among the requested/applicable models"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue"}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-test-user :crowberto
            (is (=? {:type :filtered :details {:excluded-by :models}}
                    (diagnose {:search-string "quarterly" :models #{"dashboard"}} "card" card-id)))))))))

(deftest ^:synchronized not-permitted-test
  (when (search/supports-index?)
    (testing "A row the user cannot read is :not-permitted, not :filtered"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection coll {:name "Locked"}
                       :model/Card {card-id :id} {:name "Quarterly Revenue" :collection_id (:id coll)}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-non-admin-groups-no-collection-perms coll
            (mt/with-test-user :rasta
              (is (=? {:type :not-permitted :details {:excluded-by :collection-permissions}}
                      (diagnose {:search-string "quarterly"} "card" card-id))))))))
    (testing "A read-checked model denied by collection permissions reports the post-query permission label"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection coll {:name "Locked"}
                       :model/Card {metric-id :id} {:name "Quarterly Metric"
                                                    :collection_id (:id coll)
                                                    :type :metric}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-non-admin-groups-no-collection-perms coll
            (mt/with-test-user :rasta
              (is (=? {:type :not-permitted :details {:excluded-by :permissions}}
                      (diagnose {:search-string "quarterly"} "metric" metric-id))))))))
    (testing "A denial from the post-query permission check wins over an overlapping structural filter"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection coll {:name "Read Only"}
                       :model/Card {card-id :id} {:name          "Quarterly Revenue"
                                                  :collection_id (:id coll)
                                                  :creator_id    (mt/user->id :crowberto)
                                                  :archived      true}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-non-admin-groups-no-collection-perms coll
            (mt/with-temp [:model/PermissionsGroup           group {}
                           :model/PermissionsGroupMembership _ {:user_id  (mt/user->id :rasta)
                                                                :group_id (:id group)}]
              (perms/grant-collection-read-permissions! group (:id coll))
              (mt/with-test-user :rasta
                ;; the archived search needs write perms (rasta is read-only) and `:created-by` also excludes the
                ;; row structurally; the access denial must win.
                (is (=? {:type :not-permitted :details {:excluded-by :permissions}}
                        (diagnose {:search-string "quarterly"
                                   :archived      true
                                   :created-by    #{(mt/user->id :rasta)}}
                                  "card" card-id)))))))))))

(deftest ^:synchronized not-matching-test
  (when (search/supports-index?)
    (search.tu/with-temp-index-table
      (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue"}]
        (search/reindex! {:async? false :in-place? true})
        (mt/with-test-user :crowberto
          (is (=? {:type :not-matching :details {:search-string "zzzznomatch"}}
                  (diagnose {:search-string "zzzznomatch"} "card" card-id))))))))

(deftest ^:synchronized matched-test
  (when (search/supports-index?)
    (testing "A card matching the query is reported as actually returned"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue"}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-test-user :crowberto
            (is (=? {:type :matched :details {:would-be-candidate? true}}
                    (diagnose {:search-string "quarterly"} "card" card-id)))))))))

(deftest ^:synchronized endpoint-test
  (when (search/supports-index?)
    (search.tu/with-temp-index-table
      (mt/with-temp [:model/Card {card-id :id} {:name "Quarterly Revenue"}]
        (search/reindex! {:async? false :in-place? true})
        (testing "superuser gets a diagnosis"
          (is (=? {:type "matched"}
                  (mt/user-http-request :crowberto :get 200 "search/debug"
                                        :q "quarterly" :expected_result_type "card" :expected_result_id card-id))))
        (testing "non-superuser is forbidden"
          (mt/user-http-request :rasta :get 403 "search/debug"
                                :q "quarterly" :expected_result_type "card" :expected_result_id card-id))
        (testing "indexed-entity is rejected"
          (mt/user-http-request :crowberto :get 400 "search/debug"
                                :q "x" :expected_result_type "indexed-entity" :expected_result_id 1))
        (testing "for_user_id with an unknown user is a 404"
          (mt/user-http-request :crowberto :get 404 "search/debug"
                                :q "quarterly" :expected_result_type "card" :expected_result_id card-id
                                :for_user_id Integer/MAX_VALUE))))))

(deftest ^:synchronized for-user-id-test
  (when (search/supports-index?)
    (testing "An admin can diagnose from another user's perspective via for_user_id"
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection coll {:name "Locked"}
                       :model/Card {card-id :id} {:name "Quarterly Revenue" :collection_id (:id coll)}]
          (search/reindex! {:async? false :in-place? true})
          (mt/with-non-admin-groups-no-collection-perms coll
            (testing "as the admin (default), the card is visible"
              (is (=? {:type "matched"}
                      (mt/user-http-request :crowberto :get 200 "search/debug"
                                            :q "quarterly" :expected_result_type "card" :expected_result_id card-id))))
            (testing "as a user who can't read the collection, it is not-permitted"
              (is (=? {:type "not-permitted" :details {:excluded-by "collection-permissions"}}
                      (mt/user-http-request :crowberto :get 200 "search/debug"
                                            :q "quarterly" :expected_result_type "card" :expected_result_id card-id
                                            :for_user_id (mt/user->id :rasta)))))))))))
