(ns metabase.documents.collab.authz-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.authz :as collab.authz]
   [metabase.models.interface :as mi]
   [metabase.test :as mt])
  (:import
   (java.util HashMap)
   (java.util.concurrent ExecutionException TimeUnit)
   (net.carcdr.yhocuspocus.extension Extension OnAuthenticatePayload)))

(set! *warn-on-reflection* true)

(defn- mk-payload ^OnAuthenticatePayload [user-id doc-name]
  (let [ctx (HashMap.)]
    (.put ctx "userId" user-id)
    (OnAuthenticatePayload. "conn-1" doc-name nil ctx)))

(defn- run-authenticate! [^Extension ext ^OnAuthenticatePayload payload]
  (.get (.onAuthenticate ext payload) 5 TimeUnit/SECONDS))

(deftest unknown-document-rejected-test
  (testing "connection is rejected when the document entity-id doesn't exist"
    (let [ext     (collab.authz/create-authz-extension)
          payload (mk-payload (mt/user->id :rasta) "document:does-not-exist-xyz")]
      (is (thrown-with-msg? ExecutionException #"document not found"
                            (run-authenticate! ext payload))))))

(deftest no-read-perms-rejected-test
  (testing "connection is rejected when the user lacks read perms"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Secret" :document {:type "doc" :content []}
                    :creator_id (mt/user->id :crowberto)}]
      ;; Stub the perm check so this test is independent of collection perm plumbing.
      (with-redefs [mi/can-read?  (fn [_doc] false)
                    mi/can-write? (fn [_doc] false)]
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (thrown-with-msg? ExecutionException #"forbidden"
                                (run-authenticate! ext payload))))))))

(deftest read-only-user-sets-read-only-flag-test
  (testing "user with read but not write perms → setReadOnly(true), no throw"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Viewer" :document {:type "doc" :content []}
                    :creator_id (mt/user->id :crowberto)}]
      (with-redefs [mi/can-read?  (fn [_doc] true)
                    mi/can-write? (fn [_doc] false)]
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (nil? (run-authenticate! ext payload)))
          (is (true? (.isReadOnly payload))))))))

(deftest writable-user-accepted-test
  (testing "user with write perms: no throw, not set to read-only"
    (mt/with-temp [:model/Document {entity-id :entity_id}
                   {:name "Writable" :document {:type "doc" :content []}
                    :creator_id (mt/user->id :crowberto)}]
      (with-redefs [mi/can-read?  (fn [_doc] true)
                    mi/can-write? (fn [_doc] true)]
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (nil? (run-authenticate! ext payload)))
          (is (false? (.isReadOnly payload))))))))
