(ns metabase.native-query-snippets.db-test
  "The snippet mutators take a proof as their only argument: this is the seam where a forgotten check cannot write."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.proof.core :as proof]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- snippet-name [id]
  (t2/select-one-fn :name :model/NativeQuerySnippet :id id))

(defn- snippet-proof
  "A test-only proof for a write to NativeQuerySnippet."
  [write]
  (proof/test-only (assoc write :model :model/NativeQuerySnippet)))

(deftest update-snippet!-test
  (mt/with-temp [:model/NativeQuerySnippet {id :id} {:name "before", :content "1"}]
    (let [update-proof (fn [changes]
                         (snippet-proof {:operation :update, :subject id, :changes changes}))]
      (testing "with a matching proof, writes exactly the change set"
        (native-query-snippets.db/update-snippet! (update-proof {:name "after"}))
        (is (= "after" (snippet-name id))))
      (testing "refuses anything that is not exactly a proof for this write"
        (doseq [[label value] [["nil" nil]
                               ["a hand-built value"
                                {:model     :model/NativeQuerySnippet
                                 :operation :update
                                 :subject   id
                                 :changes   {:name "forged"}}]
                               ["a proof for another model"
                                (proof/test-only {:model     :model/Card
                                                  :operation :update
                                                  :subject   id
                                                  :changes   {:name "forged"}})]
                               ["a proof for another operation"
                                (snippet-proof {:operation :delete, :subject id})]
                               ["a proof over a where-clause"
                                (snippet-proof {:operation :update, :subject [:= :id id], :changes {:name "forged"}})]
                               ["a proof issued under another user"
                                (binding [api/*current-user-id* (mt/user->id :rasta)]
                                  (update-proof {:name "forged"}))]
                               ["a proof over a column editors do not write"
                                (update-proof {:name "forged", :creator_id (mt/user->id :rasta)})]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                  (native-query-snippets.db/update-snippet! value)))))
        (is (= "after" (snippet-name id)))))))

(deftest insert-snippet!-test
  (mt/with-model-cleanup [:model/NativeQuerySnippet]
    (let [row {:name "inserted", :content "1", :creator_id (mt/user->id :rasta)}]
      (testing "with a matching proof, inserts exactly the row"
        (let [snippet (native-query-snippets.db/insert-snippet! (snippet-proof {:operation :create, :changes row}))]
          (is (=? {:name "inserted", :content "1", :creator_id (mt/user->id :rasta)} snippet))
          (is (= "inserted" (snippet-name (:id snippet))))))
      (testing "refuses anything that is not exactly a proof for this write"
        (doseq [[label value] [["nil" nil]
                               ["a hand-built value"
                                {:model :model/NativeQuerySnippet, :operation :create, :changes row}]
                               ["a proof for another model"
                                (proof/test-only {:model :model/Card, :operation :create, :changes row})]
                               ["a proof for another operation"
                                (snippet-proof {:operation :update, :subject 1, :changes row})]
                               ["a proof over a column editors do not write"
                                (snippet-proof {:operation :create, :changes (assoc row :archived_directly true)})]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                  (native-query-snippets.db/insert-snippet! value)))))
        (is (= 1 (t2/count :model/NativeQuerySnippet :name "inserted")))))))
