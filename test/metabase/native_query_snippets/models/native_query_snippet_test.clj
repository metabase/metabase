(ns metabase.native-query-snippets.models.native-query-snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest disallow-updating-creator-id-test
  (testing "You shouldn't be allowed to update the creator_id of a NativeQuerySnippet"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my-snippet", :content "wow", :creator_id (mt/user->id :lucky)}]
      (is (thrown-with-msg?
           Exception
           #"You cannot update the creator_id of a NativeQuerySnippet\."
           (t2/update! :model/NativeQuerySnippet snippet-id {:creator_id (mt/user->id :rasta)})))
      (is (= (mt/user->id :lucky)
             (t2/select-one-fn :creator_id :model/NativeQuerySnippet :id snippet-id))))))

(deftest snippet-collection-test
  (testing "Should be allowed to create snippets in a Collection in the :snippets namespace"
    (mt/with-temp [:model/Collection         {collection-id :id} {:namespace "snippets"}
                   :model/NativeQuerySnippet {snippet-id :id} {:collection_id collection-id}]
      (is (= collection-id
             (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id snippet-id)))))

  (doseq [[source dest] [[nil "snippets"]
                         ["snippets" "snippets"]
                         ["snippets" nil]]]
    (testing (format "Should be allowed to move snippets from %s to %s"
                     (if source "a :snippets Collection" "no Collection")
                     (if dest "a :snippets Collection" "no Collection"))
      (mt/with-temp [:model/Collection         {source-collection-id :id} {:namespace source}
                     :model/Collection         {dest-collection-id :id}   {:namespace dest}
                     :model/NativeQuerySnippet {snippet-id :id} (when source
                                                                  {:collection_id source-collection-id})]
        (t2/update! :model/NativeQuerySnippet snippet-id {:collection_id (when dest dest-collection-id)})
        (is (= (when dest dest-collection-id)
               (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id snippet-id))))))

  (doseq [collection-namespace [nil "x"]]
    (testing (format "Should *not* be allowed to create snippets in a Collection in the %s namespace"
                     (pr-str collection-namespace))
      (mt/with-temp [:model/Collection {collection-id :id} {:namespace collection-namespace}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (t2/insert! :model/NativeQuerySnippet
                         {:name          (mt/random-name)
                          :content       "1 = 1"
                          :creator_id    (mt/user->id :rasta)
                          :collection_id collection-id})))))

    (testing (format "Should *not* be allowed to move snippets into a Collection in the namespace %s" (pr-str collection-namespace))
      (mt/with-temp [:model/Collection         {source-collection-id :id} {:namespace "snippets"}
                     :model/NativeQuerySnippet {snippet-id :id}           {:collection_id source-collection-id}
                     :model/Collection         {dest-collection-id :id}   {:namespace collection-namespace}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (t2/update! :model/NativeQuerySnippet snippet-id {:collection_id dest-collection-id})))))))

(deftest identity-hash-test
  (testing "Native query snippet hashes are composed of the name and the collection's hash"
    (let [now #t "2022-09-01T12:34:56Z"]
      (mt/with-temp [:model/Collection         coll    {:name "field-db" :namespace :snippets :location "/" :created_at now}
                     :model/NativeQuerySnippet snippet {:name "my snippet" :collection_id (:id coll) :created_at now}]
        (is (= "7ac51ad0"
               (serdes/raw-hash ["my snippet" (serdes/identity-hash coll) (:created_at snippet)])
               (serdes/identity-hash snippet)))))))

(deftest basic-param-finding-test
  (testing "Can find params in a snippet"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my snippet" :content "{{id}}"}]
      (is (=? {"id" {:type :text,
                     :name "id",
                     :display-name "ID"}}
              (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id))))))

(deftest update-param-finding-test
  (testing "Can find params on update"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my snippet" :content "id"}]
      (is (= {} (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id)))
      (t2/update! :model/NativeQuerySnippet :id snippet-id {:content "{{id}}"})
      (is (=? {"id" {:type :text,
                     :name "id",
                     :display-name "ID"}}
              (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id))))))

(deftest recursive-snippets-test
  (testing "Does not find params in child snippets"
    (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "inner" :content "id"}
                   :model/NativeQuerySnippet {snippet-id :id} {:name "my snippet" :content "{{snippet: inner}}"}]
      (is (=? {"snippet: inner"
               {:type :snippet,
                :name "snippet: inner",
                :snippet-name "inner",
                :display-name "Snippet: Inner",
                :snippet-id inner-id}}
              (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id))))))

(deftest not-parse-recursive-snippets-test
  (testing "Does not find params in child snippets"
    (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "inner" :content "{{id}}"}
                   :model/NativeQuerySnippet {snippet-id :id} {:name "my snippet" :content "{{snippet: inner}}"}]
      (is (=? {"snippet: inner"
               {:type :snippet,
                :name "snippet: inner",
                :snippet-name "inner",
                :display-name "Snippet: Inner",
                :snippet-id inner-id}}
              (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id))))))

(deftest template-tags-serialization-test
  (testing "Template tags serialization preserves nil, empty, and populated states"
    (mt/with-temp [:model/User {user-id :id} {:email "test@example.com"}]

      (testing "nil in -> {} out"
        (let [snippet (t2/insert-returning-instance! :model/NativeQuerySnippet
                                                     {:name "nil-tags"
                                                      :content "SELECT 1"
                                                      :creator_id user-id
                                                      :template_tags nil})
              extracted (serdes/extract-one "NativeQuerySnippet" {} snippet)]
          ;; toucan hooks populate it:
          (is (= {} (:template_tags extracted)))
          (t2/delete! :model/NativeQuerySnippet :id (:id snippet))))

      (testing "empty map in -> empty map out"
        (mt/with-temp [:model/NativeQuerySnippet snippet
                       {:name "empty-tags"
                        :content "SELECT 1"
                        :creator_id user-id
                        :template_tags {}}]
          (let [extracted (serdes/extract-one "NativeQuerySnippet" {} snippet)]
            (is (= {} (:template_tags extracted))))))

      (testing "tags in -> tags out"
        (mt/with-temp [:model/NativeQuerySnippet snippet
                       {:name "with-tags"
                        :content "WHERE id = {{id}}"
                        :creator_id user-id}]
          (let [extracted (serdes/extract-one "NativeQuerySnippet" {} snippet)]
            (is (=? {"id" {:type :text
                           :name "id"
                           :display-name "ID"}}
                    (:template_tags extracted)))))))))

;;; ------------------------------------------------ Batched Hydration Tests ------------------------------------------

(deftest ^:parallel batched-hydrate-can-write-test
  (testing "batched-hydrate :can_write returns correct values for multiple snippets"
    (mt/with-temp [:model/Collection {coll-id :id} {:namespace "snippets"}
                   :model/NativeQuerySnippet snippet1 {:name "snippet1" :content "SELECT 1" :collection_id coll-id}
                   :model/NativeQuerySnippet snippet2 {:name "snippet2" :content "SELECT 2" :collection_id coll-id}
                   :model/NativeQuerySnippet snippet3 {:name "snippet3" :content "SELECT 3" :collection_id coll-id}]
      (mt/with-test-user :crowberto
        (let [snippets (t2/select :model/NativeQuerySnippet :id [:in [(:id snippet1) (:id snippet2) (:id snippet3)]])
              hydrated (t2/hydrate snippets :can_write)]
          (testing "all snippets have :can_write hydrated"
            (is (every? #(contains? % :can_write) hydrated)))
          (testing "all snippets are writable in OSS"
            (is (every? :can_write hydrated))))))))

(deftest ^:parallel batched-hydrate-can-write-empty-list-test
  (testing "batched-hydrate :can_write handles empty list"
    (mt/with-test-user :crowberto
      (is (= [] (t2/hydrate [] :can_write))))))

(deftest ^:parallel batched-hydrate-can-write-nil-in-list-test
  (testing "batched-hydrate :can_write handles nil in list"
    (mt/with-temp [:model/Collection {coll-id :id} {:namespace "snippets"}
                   :model/NativeQuerySnippet snippet {:name "snippet" :content "SELECT 1" :collection_id coll-id}]
      (mt/with-test-user :crowberto
        (let [snippets [(t2/select-one :model/NativeQuerySnippet :id (:id snippet)) nil]
              hydrated (t2/hydrate snippets :can_write)]
          (is (nil? (second hydrated))
              "nil should remain nil")
          (is (contains? (first hydrated) :can_write)
              "non-nil snippet should be hydrated"))))))
