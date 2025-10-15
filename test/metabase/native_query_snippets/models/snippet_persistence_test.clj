(ns metabase.native-query-snippets.models.snippet-persistence-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest snippet-reference-persistence-test
  (testing "Snippet references should persist when referenced snippets are renamed"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :namespace :snippets}
                   ;; Step 1: Create Snippet A
                   :model/NativeQuerySnippet {snippet-a-id :id} {:name "Snippet A"
                                                                 :content "WHERE price > 100"
                                                                 :collection_id coll-id}
                   ;; Step 2: Create Snippet B that refers to Snippet A
                   :model/NativeQuerySnippet {snippet-b-id :id} {:name "Snippet B"
                                                                 :content "SELECT * FROM orders {{snippet: Snippet A}}"
                                                                 :collection_id coll-id}]
      (testing "Initial reference should point to Snippet A"
        (let [template-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-b-id)]
          (is (contains? template-tags "snippet: Snippet A"))
          (is (= snippet-a-id (get-in template-tags ["snippet: Snippet A" :snippet-id])))))
      (testing "with Snippet A renamed to Snippet C"
        (t2/update! :model/NativeQuerySnippet snippet-a-id {:name "Snippet C"})
        (testing "Snippet B should still refer to snippet-a-id"
          (let [updated-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-b-id)]
            ;; The template tag key is still "snippet: Snippet A" because we haven't edited Snippet B
            (is (contains? updated-tags "snippet: Snippet A"))
            ;; But it still points to the same snippet (now named Snippet C)
            (is (= snippet-a-id (get-in updated-tags ["snippet: Snippet A" :snippet-id])))))
        (testing "with Snippet B edited but preserving reference to Snippet A"
          (t2/update! :model/NativeQuerySnippet snippet-b-id
                      {:content "SELECT id, name FROM orders {{snippet: Snippet A}} LIMIT 10"})
          (let [edited-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-b-id)]
            ;; The reference text is still "snippet: Snippet A"
            (is (contains? edited-tags "snippet: Snippet A"))
            ;; And it STILL points to the same snippet ID (now Snippet C)
            (is (= snippet-a-id (get-in edited-tags ["snippet: Snippet A" :snippet-id]))
                "The snippet-id should persist even after editing the referring snippet")))))))

(deftest snippet-reference-update-on-name-change-test
  (testing "Snippet references should update when the parsed snippet name changes"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :namespace :snippets}
                   :model/NativeQuerySnippet {snippet-x-id :id} {:name "Snippet X"
                                                                 :content "WHERE status = 'active'"
                                                                 :collection_id coll-id}
                   :model/NativeQuerySnippet {snippet-y-id :id} {:name "Snippet Y"
                                                                 :content "WHERE status = 'inactive'"
                                                                 :collection_id coll-id}
                   :model/NativeQuerySnippet {snippet-ref-id :id} {:name "Reference Snippet"
                                                                   :content "SELECT * FROM users {{snippet: Snippet X}}"
                                                                   :collection_id coll-id}]
      (testing "Initial reference should point to Snippet X"
        (let [template-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-ref-id)]
          (is (= snippet-x-id (get-in template-tags ["snippet: Snippet X" :snippet-id])))
          (testing "Changing the referenced snippet name should update the reference"
            (t2/update! :model/NativeQuerySnippet snippet-ref-id
                        {:content "SELECT * FROM users {{snippet: Snippet Y}}"})
            (let [updated-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-ref-id)]
              (is (not (contains? updated-tags "snippet: Snippet X")))
              (is (contains? updated-tags "snippet: Snippet Y"))
              (is (= snippet-y-id (get-in updated-tags ["snippet: Snippet Y" :snippet-id]))))))))))

(deftest snippet-reference-handles-missing-snippet-test
  (testing "Template tags should handle references to non-existent snippets"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :namespace :snippets}
                   :model/NativeQuerySnippet {snippet-id :id} {:name "Reference Missing"
                                                               :content "SELECT * FROM products {{snippet: NonExistent}}"
                                                               :collection_id coll-id}]
      (let [template-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id snippet-id)]
        (is (contains? template-tags "snippet: NonExistent"))
        (is (nil? (get-in template-tags ["snippet: NonExistent" :snippet-id])))))))

(deftest multiple-snippet-references-test
  (testing "A snippet can reference multiple other snippets and maintain all references"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :namespace :snippets}
                   :model/NativeQuerySnippet {filter1-id :id} {:name "Filter One"
                                                               :content "price > 100"
                                                               :collection_id coll-id}
                   :model/NativeQuerySnippet {filter2-id :id} {:name "Filter Two"
                                                               :content "quantity > 5"
                                                               :collection_id coll-id}
                   :model/NativeQuerySnippet {combined-id :id} {:name "Combined"
                                                                :content "SELECT * FROM orders WHERE {{snippet: Filter One}} AND {{snippet: Filter Two}}"
                                                                :collection_id coll-id}]
      (let [template-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id combined-id)]
        (is (= filter1-id (get-in template-tags ["snippet: Filter One" :snippet-id])))
        (is (= filter2-id (get-in template-tags ["snippet: Filter Two" :snippet-id])))
        (testing "After renaming referenced snippets, references should persist"
          (t2/update! :model/NativeQuerySnippet filter1-id {:name "Renamed Filter One"})
          (t2/update! :model/NativeQuerySnippet filter2-id {:name "Renamed Filter Two"})
          (let [updated-tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id combined-id)]
            (is (= filter1-id (get-in updated-tags ["snippet: Filter One" :snippet-id])))
            (is (= filter2-id (get-in updated-tags ["snippet: Filter Two" :snippet-id])))))))))

(deftest snippet-reference-prefers-exact-name-match-test
  (testing "When a new snippet is created matching an old reference name, the reference should switch to the new snippet"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :namespace :snippets}
                   ;; Step 1: Create "expensive" snippet (with intentional typo on `<`!)
                   :model/NativeQuerySnippet {expensive-wrong-id :id} {:name "expensive"
                                                                       :content "WHERE total < 100" ; Oops, wrong!
                                                                       :collection_id coll-id}
                   ;; Step 2: Create a query that references "expensive"
                   :model/NativeQuerySnippet {query-id :id} {:name "Expensive Orders Query"
                                                             :content "SELECT * FROM orders {{snippet: expensive}}"
                                                             :collection_id coll-id}]
      (testing "Initial reference points to the \"wrong\" 'expensive' snippet"
        (let [tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id query-id)]
          (is (= expensive-wrong-id (get-in tags ["snippet: expensive" :snippet-id])))))
      ;; Step 3: Rename the wrong snippet to "affordable" (fixing the mistake)
      (t2/update! :model/NativeQuerySnippet expensive-wrong-id {:name "affordable"})
      (testing "After renaming, reference still points to same snippet (now 'affordable')"
        (let [tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id query-id)]
          (is (= expensive-wrong-id (get-in tags ["snippet: expensive" :snippet-id]))
              "Reference persists even though snippet name changed")))
      ;; Step 4: Create a new "expensive" snippet with correct logic
      (mt/with-temp [:model/NativeQuerySnippet {expensive-correct-id :id} {:name "expensive"
                                                                           :content "WHERE total > 100"
                                                                           :collection_id coll-id}]
        (testing "With a new snippet matching the reference name, existing queries keep old reference"
          (let [tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id query-id)]
            (is (= expensive-wrong-id (get-in tags ["snippet: expensive" :snippet-id]))
                "Without re-saving, query still points to the old (now 'affordable') snippet")))
        ;; Step 5: Re-save the query (simulating user editing and saving)
        (t2/update! :model/NativeQuerySnippet query-id
                    {:content "SELECT * FROM orders {{snippet: expensive}}"})
        (testing "After re-saving the query, reference switches to the new exact-match snippet"
          (let [tags (t2/select-one-fn :template_tags :model/NativeQuerySnippet :id query-id)]
            (is (= expensive-correct-id (get-in tags ["snippet: expensive" :snippet-id]))
                "Reference now points to the new 'expensive' snippet with correct logic")))))))
