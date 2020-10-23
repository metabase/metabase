(ns metabase-enterprise.enhancements.api.native-query-snippet-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Collection NativeQuerySnippet]]
             [test :as mt]
             [util :as u]]
            [metabase.models
             [collection :as collection]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.public-settings.metastore-test :as metastore-test]
            [toucan.db :as db]))

(def ^:private root-collection (assoc collection/root-collection :name "Root Collection", :namespace "snippets"))

(defn- test-perms
  "Test whether we have permissions to see/edit/etc. a Snippet by calling `(has-perms? snippet)`. `required-perms` is
  the permissions we *should* need, either `:read` or `:write`."
  [required-perms has-perms?]
  (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
    (mt/with-temp Collection [normal-collection {:name "Normal Collection", :namespace "snippets"}]
      ;; run tests with both a normal Collection and the Root Collection
      (doseq [{collection-name :name, :as collection} [normal-collection root-collection]]
        (testing (format "\nSnippet in %s" collection-name)
          (mt/with-temp NativeQuerySnippet [snippet {:collection_id (:id collection)}]
            (testing "\nShould be allowed regardless if EE features aren't enabled"
              (metastore-test/with-metastore-token-features #{}
                (is (= true
                       (has-perms? snippet))
                    "allowed?")))
            (testing "\nWith EE features enabled"
              (metastore-test/with-metastore-token-features #{:enhancements}
                (testing (format "\nShould not be allowed with no perms for %s" collection-name)
                  (is (= false
                         (has-perms? snippet))
                      "allowed?"))
                (perms/grant-collection-read-permissions! (group/all-users) collection)
                (testing (format "\nShould %s allowed if we have read perms for %s"
                                 (case required-perms :read "be" :write "NOT be")
                                 collection-name)
                  (is (= (case required-perms
                           :read  true
                           :write false)
                         (has-perms? snippet))
                      "allowed?"))
                (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
                (testing (format "\nShould be allowed if we have write perms for %s" collection-name)
                  (is (= true
                         (has-perms? snippet))
                      "allowed?"))))))))))

(deftest list-test
  (testing "GET /api/native-query-snippet"
    (testing "\nShould only see Snippet if you have parent Collection perms"
      (test-perms
       :read
       (fn [snippet]
         (boolean
          (some
           (fn [a-snippet]
             (= (u/get-id a-snippet) (u/get-id snippet)))
           ((mt/user->client :rasta) :get "native-query-snippet"))))))))

(deftest fetch-test
  (testing "GET /api/native-query-snippet/:id"
    (testing "\nShould only be able to fetch Snippet if you have parent Collection perms"
      (test-perms
       :read
       (fn [snippet]
         (let [response ((mt/user->client :rasta) :get (format "native-query-snippet/%d" (u/get-id snippet)))]
           (not= response "You don't have permissions to do that.")))))))

(deftest create-test
  (testing "POST /api/native-query-snippet"
    (testing "\nShould require parent Collection perms to create a new Snippet in that Collection"
      (test-perms
       :write
       (fn [snippet]
         ;; try creating a copy of the Snippet, but with a different name and with `:id` removed
         (let [snippet-name       (mt/random-name)
               snippet-properties (-> snippet (assoc :name snippet-name) (dissoc :id))]
           (try
             (let [response ((mt/user->client :rasta) :post "native-query-snippet" snippet-properties)]
               (not= response "You don't have permissions to do that."))
             (finally
               (db/delete! NativeQuerySnippet :name snippet-name)))))))))

(deftest edit-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "\nShould require parent Collection perms to edit a Snippet"
      (test-perms
       :write
       (fn [snippet]
         (let [response ((mt/user->client :rasta) :put (format "native-query-snippet/%d" (u/get-id snippet)) {:name (mt/random-name)})]
           (not= response "You don't have permissions to do that.")))))))

(deftest move-perms-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "\nPerms for moving a Snippet"
      (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
        (mt/with-temp* [Collection [source {:name "Current Parent Collection", :namespace "snippets"}]
                        Collection [dest   {:name "New Parent Collection", :namespace "snippets"}]]
          (doseq [source-collection [source root-collection]]
            (mt/with-temp NativeQuerySnippet [snippet {:collection_id (:id source-collection)}]
              (doseq [dest-collection [dest root-collection]]
                (letfn [(has-perms? []
                          ;; make sure the Snippet is back in the original Collection if it was changed
                          (db/update! NativeQuerySnippet (:id snippet) :collection_id (:id source-collection))
                          (let [response ((mt/user->client :rasta) :put (format "native-query-snippet/%d" (:id snippet))
                                          {:collection_id (:id dest-collection)})]
                            (cond
                              (= response "You don't have permissions to do that.")                     false
                              (and (map? response) (= (:collection_id response) (:id dest-collection))) true
                              :else                                                                     response)))]
                  (when-not (= source-collection dest-collection)
                    (testing (format "\nMove from %s -> %s should need write ('curate') perms for both" (:name source-collection) (:name dest-collection))
                      (testing "\nShould be allowed if EE perms aren't enabled"
                        (metastore-test/with-metastore-token-features #{}
                          (is (= true
                                 (has-perms?)))))
                      (metastore-test/with-metastore-token-features #{:enhancements}
                        (doseq [c [source-collection dest-collection]]
                          (testing (format "\nPerms for only %s should fail" (:name c))
                            (try
                              (perms/grant-collection-readwrite-permissions! (group/all-users) c)
                              (is (= false
                                     (has-perms?)))
                              (finally
                                (perms/revoke-collection-permissions! (group/all-users) c)))))
                        (testing "\nShould succeed with both"
                          (try
                            (doseq [c [source-collection dest-collection]]
                              (perms/grant-collection-readwrite-permissions! (group/all-users) c))
                            (is (= true
                                   (has-perms?)))
                            (finally
                              (doseq [c [source-collection dest-collection]]
                                (perms/revoke-collection-permissions! (group/all-users) c)))))))))))))))))
