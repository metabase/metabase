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

(deftest resolve-collection-id-collapses-unreadable-test
  (testing "GHY-4148: a collection_id naming a collection the caller cannot read must give the
            exact same not-found error as one naming no collection at all. Without the
            `resolve-and-read` call in the main branch the id would travel straight into the write
            unchecked, and a distinguishable error would turn the argument into a collection-id
            enumeration oracle."
    (mt/with-temp [:model/Collection {readable-id :id}   {:name "Readable"}
                   :model/Collection {unreadable-id :id} {:name     "Crowberto's personal subfolder"
                                                          :location (str "/" (:id (collection/user->personal-collection
                                                                                   (mt/user->id :crowberto)))
                                                                         "/")}]
      (mt/with-test-user :rasta
        (testing "a readable collection resolves to its own id"
          (is (= readable-id (v2.resolve/resolve-collection-id readable-id))))
        (let [missing    (try (v2.resolve/resolve-collection-id 13371337)
                              (catch Exception e (ex-message e)))
              unreadable (try (v2.resolve/resolve-collection-id unreadable-id)
                              (catch Exception e (ex-message e)))]
          (is (str/includes? missing "not found"))
          ;; Compare the messages, not merely that both threw: differing wording is the leak.
          (is (= (str/replace missing "13371337" (str unreadable-id))
                 unreadable)))))))

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

(deftest ^:parallel normalize-id-test
  (testing "GHY-4498: a client that serializes an int-or-string id param as a JSON string still
            names the numeric id"
    (is (= 16211 (v2.resolve/normalize-id "16211")))
    (is (= 1 (v2.resolve/normalize-id "1"))))
  (testing "GHY-4498: anything that isn't the exact shape of a numeric id is left alone"
    (doseq [x ["0" "-1" "016211" "1.0" "12x" "" "root" "trash" 7 nil]]
      (is (= x (v2.resolve/normalize-id x)))))
  (testing "GHY-4498: a run of digits too large for a long stays a string rather than becoming nil"
    (is (= "99999999999999999999" (v2.resolve/normalize-id "99999999999999999999"))))
  (testing "GHY-4498: an entity_id is never mistaken for a numeric id"
    (let [eid (u/generate-nano-id)]
      (is (= eid (v2.resolve/normalize-id eid))))))

(deftest ^:parallel resolve-id-or-404-accepts-numeric-string-test
  (testing "GHY-4498: a numeric id sent as a JSON string resolves like the integer it names"
    (is (= 7 (v2.resolve/resolve-id-or-404 :model/Card "7"))))
  (testing "GHY-4498: strings that only look numeric keep failing validation"
    (doseq [bad ["0" "-1" "016211" "1.0"]]
      (is (thrown-with-msg? Exception #"entity_id"
                            (v2.resolve/resolve-id-or-404 :model/Card bad))))))

(deftest ^:parallel resolve-collection-id-accepts-numeric-string-test
  (testing "GHY-4498: the sentinels still win over numeric-string coercion"
    (is (nil? (v2.resolve/resolve-collection-id "root")))
    (is (= 99 (v2.resolve/resolve-collection-id "trash" {:trash-collection-id 99})))))

(deftest resolve-collection-id-numeric-string-test
  (testing "GHY-4498: a collection_id sent as a JSON string resolves to that collection"
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (mt/with-test-user :crowberto
        (is (= coll-id (v2.resolve/resolve-collection-id (str coll-id))))))))
