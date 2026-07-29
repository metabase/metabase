(ns metabase-enterprise.semantic-search.debug-test
  "Engine-owned diagnostic stages for the semantic search index. Mirrors the appdb coverage in
  [[metabase.search.debug-test]], but exercises [[semantic.index/diagnose-row]] directly against the
  mock-indexed pgvector test database (gated on MB_PGVECTOR_DB_URL via [[semantic.tu/once-fixture]])."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- diagnose-row! [search-context model id]
  (semantic.index/diagnose-row (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index search-context model id))

(deftest ^:synchronized semantic-diagnose-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-indexed}
        (let [card-id (t2/select-one-pk :model/Card :name "Dog Training Guide")
              all     {:models ["card" "dashboard" "table"] :archived? false}]
          (testing "a matching query is a candidate"
            (is (=? {:type :candidate}
                    (diagnose-row! (assoc all :search-string "puppy") "card" card-id))))
          (testing "a query whose embedding is beyond the cosine cutoff is not-matching"
            (is (=? {:type :not-matching :details {:max-cosine-distance 0.7 :distance number?}}
                    (diagnose-row! (assoc all :search-string "zzzznomatchzzz") "card" card-id))))
          (testing "excluded by a structural filter, attributed to the specific filter"
            (is (=? {:type :filtered :details {:excluded-by :models}}
                    (diagnose-row! {:models ["dashboard"] :search-string "puppy"} "card" card-id))))
          (testing "absent from the index is missing-from-index"
            (is (=? {:type :missing-from-index}
                    (diagnose-row! (assoc all :search-string "puppy") "card" Integer/MAX_VALUE)))))))))

(deftest ^:synchronized semantic-not-permitted-test
  (testing "permissions are checked before structural filters, so an unreadable row reports :permissions even when
            a structural filter would also drop it"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :mock-indexed}
        (let [{card-id :id coll-id :collection_id} (t2/select-one [:model/Card :id :collection_id]
                                                                  :name "Dog Training Guide")]
          (mt/with-non-admin-groups-no-collection-perms (t2/select-one :model/Collection :id coll-id)
            (mt/with-test-user :rasta
              ;; :models ["dashboard"] would also exclude this card structurally; permission denial must win.
              (is (=? {:type :filtered :details {:excluded-by :permissions}}
                      (diagnose-row! {:models ["dashboard"] :search-string "puppy"} "card" card-id))))))))))
