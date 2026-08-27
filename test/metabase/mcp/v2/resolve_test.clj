(ns metabase.mcp.v2.resolve-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
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
