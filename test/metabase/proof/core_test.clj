(ns metabase.proof.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.proof.core :as proof]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(defn- update-proof
  ([]
   (update-proof 42 {:name "x"}))
  ([id changes]
   (proof/test-only {:model :model/Card, :operation :update, :subject id, :changes changes})))

(defn- thrown-data
  "The ex-data of the error `thunk` throws, or nil when it does not throw."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(defn- invalid-proof-data
  "The ex-data of the invalid-proof error `thunk` throws, or nil when it does not throw one."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (when (re-find #"^Invalid proof" (ex-message e))
        (ex-data e)))))

(deftest ^:parallel proof-is-opaque-test
  (let [p (update-proof)]
    (testing "prints redacted: no subject, no change set"
      (is (= "<< PROOF :model/Card :update >>" (str p)))
      (is (= "<< PROOF :model/Card :update >>" (pr-str p))))
    (testing "cannot be JSON-encoded, on its own or nested"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be JSON-encoded" (json/encode p)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be JSON-encoded" (json/encode {:proof p}))))
    (testing "proof? recognises proofs issued here and nothing else"
      (is (proof/proof? p))
      (is (not (proof/proof? nil)))
      (is (not (proof/proof? {:model :model/Card, :operation :update, :subject 42, :changes {:name "x"}}))))))

(deftest ^:parallel issuers-validate-the-write-test
  (testing "a write must be internally consistent"
    (are [write] (thrown-with-msg? clojure.lang.ExceptionInfo #"a create has no subject" (proof/test-only write))
      {:model :model/Card, :operation :create, :subject 1, :changes {}}
      {:model :model/Card, :operation :update, :changes {}}
      {:model :model/Card, :operation :update, :subject 1}
      {:model :model/Card, :operation :delete, :subject 1, :changes {}}))
  (testing "a create takes a row or rows"
    (is (proof/proof? (proof/test-only {:model :model/Card, :operation :create, :changes {:name "x"}})))
    (is (proof/proof? (proof/test-only {:model :model/Card, :operation :create, :changes [{:name "x"} {:name "y"}]}))))
  (testing "a subject is an id or a where-clause"
    (is (proof/proof? (proof/test-only {:model :model/Card, :operation :delete, :subject "abc"})))
    (is (proof/proof? (proof/test-only {:model :model/Card, :operation :delete, :subject [:= :collection_id 1]})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                          (proof/test-only {:model :model/Card, :operation :delete, :subject {:id 1}})))))

(deftest ^:parallel verify-test
  (let [p (update-proof)]
    (testing "a matching proof yields the write it covers"
      (is (= {:model :model/Card, :operation :update, :subject 42, :changes {:name "x"}}
             (proof/verify p {:model :model/Card, :operation :update, :subject-kind :id})))
      (testing "and a model-parameterised mutator may leave the model open"
        (is (= {:model :model/Card, :operation :update, :subject 42, :changes {:name "x"}}
               (proof/verify p {:operation :update, :subject-kind :id})))))
    (testing "a mismatch is a programming error, not a permission error"
      (doseq [[label value expects] [["nil" nil {:operation :update, :subject-kind :id}]
                                     ["a hand-built value"
                                      {:model :model/Card, :operation :update, :subject 42, :changes {:name "x"}}
                                      {:operation :update, :subject-kind :id}]
                                     ["a proof for another model"
                                      p {:model :model/Dashboard, :operation :update, :subject-kind :id}]
                                     ["a proof for another operation"
                                      p {:model :model/Card, :operation :delete, :subject-kind :id}]
                                     ["a proof for another kind of subject"
                                      p {:model :model/Card, :operation :update, :subject-kind :where}]]]
        (testing label
          (is (=? {:status-code 500, :error :proof/invalid}
                  (invalid-proof-data #(proof/verify value expects)))))))
    (testing "a proof issued under one user is refused under another"
      (is (=? {:status-code 500, :issued-for nil, :current-user 7}
              (binding [api/*current-user-id* 7]
                (invalid-proof-data #(proof/verify p {:operation :update, :subject-kind :id})))))
      (let [rasta-proof (binding [api/*current-user-id* 7] (update-proof))]
        (is (=? {:issued-for 7, :current-user nil}
                (invalid-proof-data #(proof/verify rasta-proof {:operation :update, :subject-kind :id}))))))
    (testing "the error never carries the proof"
      (is (not-any? proof/proof?
                    (tree-seq coll? seq
                              (invalid-proof-data #(proof/verify p {:operation :delete, :subject-kind :id}))))))))

(defmethod proof/cascade-parents ::child
  [_model]
  {::parent :parent_id})

(deftest ^:parallel verify-columns-test
  (testing "a mutator that declares the columns it writes refuses a change set outside them"
    (let [expects {:model :model/Card, :operation :update, :subject-kind :id, :columns #{:archived :archived_directly}}]
      (is (= {:model :model/Card, :operation :update, :subject 42, :changes {:archived true}}
             (proof/verify (update-proof 42 {:archived true}) expects)))
      (are [changes] (=? {:status-code 500, :actual (set (keys changes))}
                         (invalid-proof-data #(proof/verify (update-proof 42 changes) expects)))
        {:name "x"}
        {:archived true, :name "x"}
        {})))
  (testing "for a create, every row is held to the columns"
    (let [expects {:model :model/Card, :operation :create, :subject-kind :none, :columns #{:name}}
          create  (fn [rows] (proof/test-only {:model :model/Card, :operation :create, :changes rows}))]
      (is (=? {:changes [{:name "a"} {:name "b"}]}
              (proof/verify (create [{:name "a"} {:name "b"}]) expects)))
      (is (=? {:status-code 500, :actual #{:name :archived}}
              (invalid-proof-data #(proof/verify (create [{:name "a"} {:name "b", :archived true}]) expects)))))))

(deftest ^:parallel cascade-test
  (let [parent-proof (proof/test-only {:model ::parent, :operation :update, :subject 10, :changes {:archived true}})]
    (testing "a declared parent's proof cascades to a where-clause keyed by its id"
      (let [p (proof/cascade parent-proof ::child [:= :parent_id 10] {:archived true})]
        (is (= {:model ::child, :operation :update, :subject [:= :parent_id 10], :changes {:archived true}}
               (proof/verify p {:model ::child, :operation :update, :subject-kind :where}))))
      (testing "nil changes mean delete"
        (is (= {:model ::child, :operation :delete, :subject [:and [:= :parent_id 10] [:= :archived true]]}
               (proof/verify (proof/cascade parent-proof ::child [:and [:= :parent_id 10] [:= :archived true]] nil)
                              {:model ::child, :operation :delete, :subject-kind :where})))))
    (testing "an undeclared parent is refused"
      (let [stranger-proof (proof/test-only {:model ::stranger, :operation :delete, :subject 10})]
        (is (=? {:status-code 500, :child-model ::child, :parent-model ::stranger}
                (invalid-proof-data #(proof/cascade stranger-proof ::child [:= :parent_id 10] nil)))))
      (is (=? {:status-code 500, :child-model ::orphan}
              (invalid-proof-data #(proof/cascade parent-proof ::orphan [:= :parent_id 10] nil)))))
    (testing "a where-clause not keyed by the parent's id is refused"
      (are [where] (=? {:status-code 500, :column :parent_id}
                       (invalid-proof-data #(proof/cascade parent-proof ::child where nil)))
        [:= :parent_id 11]
        [:= :other_id 10]
        [:in :parent_id [10]]
        [:or [:= :parent_id 10] [:= :parent_id 11]]))
    (testing "only a proof for one row by id can be cascaded"
      (let [where-proof (proof/test-only {:model ::parent, :operation :delete, :subject [:= :id 10]})]
        (is (=? {:status-code 500, :subject-kind :where}
                (invalid-proof-data #(proof/cascade where-proof ::child [:= :parent_id 10] nil))))))
    (testing "the cascade proof is bound to the parent's user"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"issued for another user"
                            (binding [api/*current-user-id* 7]
                              (proof/cascade parent-proof ::child [:= :parent_id 10] nil)))))))

(deftest authorize-test
  (mt/with-temp [:model/NativeQuerySnippet snippet {:name "proof-test", :content "1"}]
    (let [id (:id snippet)]
      (testing "a user the model's permission methods allow gets a proof over exactly the write"
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:model :model/NativeQuerySnippet, :operation :create, :changes {:name "new", :content "2"}}
                 (proof/verify (proof/authorize-create :model/NativeQuerySnippet {:name "new", :content "2"})
                                {:model :model/NativeQuerySnippet, :operation :create, :subject-kind :none})))
          (is (= {:model :model/NativeQuerySnippet, :operation :update, :subject id, :changes {:name "renamed"}}
                 (proof/verify (proof/authorize-update :model/NativeQuerySnippet id {:name "renamed"})
                                {:model :model/NativeQuerySnippet, :operation :update, :subject-kind :id})))
          (is (= {:model :model/NativeQuerySnippet, :operation :delete, :subject id}
                 (proof/verify (proof/authorize-delete :model/NativeQuerySnippet id)
                                {:model :model/NativeQuerySnippet, :operation :delete, :subject-kind :id})))))
      (testing "a row that does not exist is a 404"
        (mt/with-current-user (mt/user->id :rasta)
          (let [missing-id Integer/MAX_VALUE]
            (is (= 404 (:status-code (thrown-data #(proof/authorize-update :model/NativeQuerySnippet missing-id
                                                                            {:name "x"})))))
            (is (= 404 (:status-code (thrown-data #(proof/authorize-delete :model/NativeQuerySnippet missing-id))))))))
      (testing "a user the permission methods refuse gets the existing 403 and no proof"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-current-user (mt/user->id :rasta)
            (are [thunk] (=? {:status-code 403}
                             (thrown-data thunk))
              #(proof/authorize-create :model/NativeQuerySnippet {:name "new", :content "2"})
              #(proof/authorize-update :model/NativeQuerySnippet id {:name "renamed"})
              #(proof/authorize-delete :model/NativeQuerySnippet id))))))))
