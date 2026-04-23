(ns metabase.documents.collab.authz-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.authz :as collab.authz]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt])
  (:import
   (java.util HashMap)
   (java.util.concurrent TimeUnit)
   (net.carcdr.yhocuspocus.extension Extension OnAuthenticatePayload)))

(set! *warn-on-reflection* true)

(defn- mk-payload ^OnAuthenticatePayload [user-id doc-name]
  (let [ctx (HashMap.)]
    (when user-id (.put ctx "userId" user-id))
    (OnAuthenticatePayload. "conn-1" doc-name nil ctx)))

(defn- run-authenticate!
  "Synchronously invoke the hook. The proxy throws directly (yhocuspocus's
   own `runHooks` turns sync throws into failed stages in production; tests
   short-circuit by calling `.onAuthenticate` directly)."
  [^Extension ext ^OnAuthenticatePayload payload]
  (let [^java.util.concurrent.CompletableFuture fut (.onAuthenticate ext payload)]
    (.get fut 5 TimeUnit/SECONDS)))

(deftest missing-user-id-rejected-test
  (testing "context without a userId throws — a misconfiguration, not a silent forbidden"
    (let [ext     (collab.authz/create-authz-extension)
          payload (mk-payload nil "document:anything")]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unauthenticated"
                            (run-authenticate! ext payload))))))

(deftest unknown-document-rejected-test
  (testing "connection is rejected when the document entity-id doesn't exist"
    (let [ext     (collab.authz/create-authz-extension)
          payload (mk-payload (mt/user->id :rasta) "document:does-not-exist-xyz")]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"document not found"
                            (run-authenticate! ext payload))))))

(deftest no-read-perms-rejected-test
  (testing "rasta without collection perms cannot connect"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Locked"}
                     :model/Document {entity-id :entity_id}
                     {:name          "Locked doc"
                      :document      {:type "doc" :content []}
                      :collection_id coll-id
                      :creator_id    (mt/user->id :crowberto)}]
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"forbidden"
                                (run-authenticate! ext payload))))))))

(deftest read-only-user-sets-read-only-flag-test
  (testing "rasta with collection read-only perms connects read-only"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Read-only"}
                     :model/Document {entity-id :entity_id}
                     {:name          "Read-only doc"
                      :document      {:type "doc" :content []}
                      :collection_id coll-id
                      :creator_id    (mt/user->id :crowberto)}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (nil? (run-authenticate! ext payload)))
          (is (true? (.isReadOnly payload))))))))

(deftest writable-user-accepted-test
  (testing "rasta with collection write perms connects fully writable"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Writable"}
                     :model/Document {entity-id :entity_id}
                     {:name          "Writable doc"
                      :document      {:type "doc" :content []}
                      :collection_id coll-id
                      :creator_id    (mt/user->id :crowberto)}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
        (let [ext     (collab.authz/create-authz-extension)
              payload (mk-payload (mt/user->id :rasta) (str "document:" entity-id))]
          (is (nil? (run-authenticate! ext payload)))
          (is (false? (.isReadOnly payload))))))))
