(ns metabase-enterprise.sandbox.api.card-test
  (:require [clojure.test :refer :all]
            [metabase.api.card-test :as card-api.test]
            [metabase.models :refer [Card Collection]]
            [metabase.models.permissions :as perms]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]))

(deftest users-with-segmented-perms-test
  (let [card-name (mt/random-name)]
    (mt/with-model-cleanup [Card]
      (mt/with-gtaps {:gtaps {:venues nil}}
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! &group collection)
          (testing "Sanity check: shouldn't be able to save Cards for another table without perms"
            ;; make sure the `with-gtaps` macro is correctly setting up GTAPs and we don't have perms for anything we
            ;; didn't specify.
            (is (schema= {:message (s/eq "You cannot save this Question because you do not have permissions to run its query.")
                          s/Keyword s/Any}
                         (mt/user-http-request
                          :rasta :post 403 "card"
                          (assoc (card-api.test/card-with-name-and-query card-name (card-api.test/mbql-count-query (mt/db) (mt/id :users)))
                                 :collection_id     (u/the-id collection))))))
          (testing "Users with segmented permissions should be able to"
            (let [card (testing "save Cards"
                         (mt/user-http-request
                          :rasta :post 200 "card"
                          (assoc (card-api.test/card-with-name-and-query card-name (card-api.test/mbql-count-query (mt/db) (mt/id :venues)))
                                 :collection_id     (u/the-id collection))))]
              (is (some? card))
              (testing "update the query associated to a Card"
                (is (= "Another Name"
                       (:name (mt/user-http-request
                               :rasta :put 200 (str "card/" (u/the-id card))
                               {:name          "Another Name"
                                :dataset_query (card-api.test/mbql-count-query (mt/db) (mt/id :venues))}))))))))))))
