(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.util.secret :as u.secret]))

(deftest ^:synchronized single-collection-api-key-e2e-test
  (mt/with-temp [:model/Collection {collection-1-id :id} {}
                 :model/Collection {collection-2-id :id} {}]
    (let [perms-set             (fn [current-user-info]
                                  (request/do-with-current-user
                                   current-user-info
                                   (fn [] @api/*current-user-permissions-set*)))
          has-collection-perms? (fn [perms-set collection-number]
                                  (let [collection-id (case collection-number
                                                        1 collection-1-id
                                                        2 collection-2-id)]
                                    (contains? perms-set (perms/collection-readwrite-path collection-id))))
          original-perms-set    (perms-set {:metabase-user-id (mt/user->id :rasta)})]
      (testing "Sanity check: original perms should have perms for both collections"
        (is (has-collection-perms? original-perms-set 1))
        (is (has-collection-perms? original-perms-set 2)))
      (testing "with API key"
        (mt/with-model-cleanup [:model/ApiKey]
          (let [api-key                   (-> (api-key/create-single-collection-api-key! (mt/user->id :rasta) collection-1-id)
                                              u.secret/expose)
                api-key-current-user-info (#'mw.session/merge-current-user-info {:headers {"x-api-key" api-key}})]
            (is (=? {:api-key/allowed-collection-id collection-1-id}
                    api-key-current-user-info))
            (let [api-key-perms-set (perms-set api-key-current-user-info)]
              (is (set/subset? api-key-perms-set original-perms-set))
              (is (has-collection-perms? api-key-perms-set 1))
              (is (not (has-collection-perms? api-key-perms-set 2))))))))))
