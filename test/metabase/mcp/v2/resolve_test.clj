(ns metabase.mcp.v2.resolve-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel resolve-id-test
  (testing "numeric ids pass through without a lookup"
    (is (= 7 (v2.resolve/resolve-id-or-404 :model/Card 7))))
  (testing "anything that is neither numeric nor a 21-char entity_id is a teaching error"
    (is (thrown-with-msg? Exception #"entity_id"
                          (v2.resolve/resolve-id-or-404 :model/Card "abc")))))

(deftest ^:parallel resolve-and-read-collapses-existence-test
  (testing "\"exists but unreadable\" throws the same not-found error as \"doesn't exist\""
    (let [denied  (try (v2.resolve/resolve-and-read-with :model/Card 7
                                                         (fn [_] (throw (ex-info "You don't have permission." {:status-code 403}))))
                       (catch Exception e (ex-message e)))
          missing (try (v2.resolve/resolve-and-read-with :model/Card 7
                                                         (fn [_] (throw (ex-info "Not found." {:status-code 404}))))
                       (catch Exception e (ex-message e)))]
      (is (= denied missing))
      (is (str/includes? denied "not found")))))

(deftest ^:parallel entity-id?-test
  (testing "a genuine 21-char entity_id is recognized"
    (is (true? (v2.resolve/entity-id? (u/generate-nano-id)))))
  (testing "numeric ids and short strings are not entity_ids"
    (is (false? (v2.resolve/entity-id? 7)))
    (is (false? (v2.resolve/entity-id? "abc")))))

(deftest resolve-id-or-404-resolves-entity-id-test
  (testing "a valid entity_id translates to the object's numeric id"
    (mt/with-temp [:model/Collection {coll-id :id eid :entity_id} {}]
      (is (= coll-id (v2.resolve/resolve-id-or-404 :model/Collection eid))))))

(deftest resolve-and-read-happy-path-test
  (mt/with-temp [:model/Collection coll {}]
    (let [eid (:entity_id coll)]
      (testing "returns the object when the read check yields it"
        (is (= coll (v2.resolve/resolve-and-read-with :model/Collection eid (fn [_] coll)))))
      (testing "a nil read check collapses to the not-found error"
        (is (thrown-with-msg? Exception #"not found"
                              (v2.resolve/resolve-and-read-with :model/Collection eid (fn [_] nil))))))))

(deftest resolve-id-or-404-entity-id-404-collapse-test
  (testing "a well-formed entity_id that resolves to no row throws the collapsed not-found error"
    (let [eid (u/generate-nano-id)]
      (is (v2.resolve/entity-id? eid))
      (is (thrown-with-msg? Exception #"not found"
                            (v2.resolve/resolve-id-or-404 :model/Collection eid))))))

(deftest ^:parallel resolve-collection-id-test
  (is (nil? (v2.resolve/resolve-collection-id nil)))
  (is (nil? (v2.resolve/resolve-collection-id "root")))
  (is (= 99 (v2.resolve/resolve-collection-id "trash" {:trash-collection-id 99})))
  (is (thrown? Exception (v2.resolve/resolve-collection-id "trash"))))

(deftest resolve-collection-id-or-personal-test
  (testing "GHY-4218: an absent collection argument defaults to the caller's personal collection"
    (mt/with-test-user :rasta
      (is (= (:id (collection/user->personal-collection (mt/user->id :rasta)))
             (v2.resolve/resolve-collection-id-or-personal nil)))))
  (testing "GHY-4218: the explicit \"root\" sentinel still means the root collection"
    (mt/with-test-user :rasta
      (is (nil? (v2.resolve/resolve-collection-id-or-personal "root")))))
  (testing "GHY-4218: an explicit id is resolved as usual"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (is (= coll-id (v2.resolve/resolve-collection-id-or-personal coll-id))))))
  (testing "GHY-4218: a caller with no personal collection (API-key users) gets a teaching error
            rather than silently falling back to the root collection"
    (mt/with-temp [:model/User {user-id :id} {:type :api-key}]
      (binding [api/*current-user-id* user-id]
        (is (thrown-with-msg? Exception #"no personal collection"
                              (v2.resolve/resolve-collection-id-or-personal nil)))))))
