(ns metabase.api.native-query-snippet-test
  "Tests for /api/native-query-snippet endpoints."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase.models
             [database :refer [Database]]
             [native-query-snippet :refer [NativeQuerySnippet]]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.test.data.users :refer [fetch-user user->client]]
            [toucan.util.test :as tt])
  (:import java.time.LocalDateTime))

(def ^:private test-snippet-fields [:content :creator_id :database_id :description :name])
(def ^:private rasta (fetch-user :rasta))

;; GET /api/native-query-snippet
(deftest list-snippets-api-test
  (tt/with-temp* [Database           [db]
                  NativeQuerySnippet [snippet-1 {:content     "1"
                                                 :creator_id  (:id rasta)
                                                 :database_id (:id db)
                                                 :description "Test snippet 1"
                                                 :name        "snippet_1"}]
                  NativeQuerySnippet [snippet-2 {:content     "2"
                                                 :creator_id  (:id rasta)
                                                 :database_id (:id db)
                                                 :description "Test snippet 2"
                                                 :name        "snippet_2"}]]
    (testing "list returns all snippets"
      (let [snippets-from-api (->> ((user->client :crowberto) :get 200 "native-query-snippet")
                                   (map #(select-keys % test-snippet-fields))
                                   set)]
        (is (contains? snippets-from-api (select-keys snippet-1 test-snippet-fields)))
        (is (contains? snippets-from-api (select-keys snippet-2 test-snippet-fields)))))

    (testing "list fails for user without read permission"
      (perms/revoke-permissions! (group/all-users) db)
      (is (empty? ((user->client :rasta) :get 200 "native-query-snippet"))))))

;; GET /api/native-query-snippet/:id
(deftest read-snippet-api-test
  (tt/with-temp* [Database           [db]
                  NativeQuerySnippet [snippet {:content     "-- SQL comment here"
                                               :creator_id  (:id rasta)
                                               :database_id (:id db)
                                               :description "SQL comment snippet"
                                               :name        "comment"}]]
    (testing "read returns all snippet fields"
      (let [snippet-from-api ((user->client :crowberto) :get 200 (str "native-query-snippet/" (:id snippet)))]
        (is (= (select-keys snippet test-snippet-fields)
               (select-keys snippet-from-api test-snippet-fields)))))

    (testing "read fails with 403 for user without read permissions"
      ;; TODO implement this
      (perms/revoke-permissions! (group/all-users) db)
      (is (= "You don't have permissions to do that."
             ((user->client :rasta) :get 403 (str "native-query-snippet/" (:id snippet))))))))

;; POST /api/native-query-snippet
(deftest create-snippet-api-test
  (tt/with-temp* [Database [db]]
    (testing "new snippet field validation"
      (is (= {:errors {:content "value must be a string."}}
             ((user->client :rasta) :post 400 "native-query-snippet" {})))
      (is (= {:errors {:database_id "value must be an integer greater than zero."}}
             ((user->client :rasta) :post 400 "native-query-snippet" {:content "NULL"})))
      (let [response ((user->client :rasta)
                      :post 400 "native-query-snippet"
                      {:content "NULL", :database_id (:id db)})]
        (is (str/starts-with? (get-in response [:errors :name])
                              "Value does not match schema: "))))

    (testing "successful create returns new snippet's data"
      (let [snippet-input    {:name "test-snippet", :description "Just null", :content "NULL", :database_id (:id db)}
            snippet-from-api ((user->client :crowberto) :post 200 "native-query-snippet" snippet-input)]
        (is (pos? (:id snippet-from-api)))

        (is (= (:database_id snippet-input)
               (:database_id snippet-from-api)))

        (is (= (:name snippet-input)
               (:name snippet-from-api)))

        (is (= (:description snippet-input)
               (:description snippet-from-api)))

        (is (= (:content snippet-input)
               (:content snippet-from-api)))

        (is (= (:id (fetch-user :crowberto))
               (:creator_id snippet-from-api)))

        (is (false? (:archived snippet-from-api)))

        (is (instance? LocalDateTime (:created_at snippet-from-api)))

        (is (instance? LocalDateTime (:updated_at snippet-from-api)))))

    (testing "create fails for non-admin user"
      (perms/revoke-permissions! (group/all-users) db)
      (is (= "You don't have permissions to do that."
             ((user->client :rasta)
              :post 403 "native-query-snippet"
              {:name "test-snippet", :content "NULL", :database_id (:id db)}))))))

;; PUT /api/native-query-snippet/:id
(deftest update-snippet-api-test
  (testing "update stores updated snippet"
    (is false))

  (testing "update fails for non-admin user"
    ;; TODO implement this
    (is false)))
