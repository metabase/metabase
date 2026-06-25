(ns metabase.curated-search.models.curated-search-entry-test
  (:require
   [clojure.test :refer :all]
   [metabase.curated-search.mirror :as mirror]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table-entity {:model "table" :id 42})

(deftest entity-json-roundtrips-test
  (testing "entity is a JSON object and timestamps are populated"
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:search_prompt "monthly revenue by region" :entity table-entity}]
      (is (=? {:search_prompt "monthly revenue by region"
               :entity        table-entity
               :verified      false
               :created_at    some?
               :updated_at    some?}
              (t2/select-one :model/CuratedSearchEntry :id id))))))

(deftest usage-instructions-persist-test
  (testing "usage_instructions persists alongside the prompt"
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:search_prompt "monthly revenue by region" :entity table-entity
                    :usage_instructions "Use this metric for total revenue; group by month."}]
      (is (= "Use this metric for total revenue; group by month."
             (t2/select-one-fn :usage_instructions :model/CuratedSearchEntry :id id)))))
  (testing "usage_instructions is optional (nil when omitted)"
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:search_prompt "orders" :entity table-entity}]
      (is (nil? (t2/select-one-fn :usage_instructions :model/CuratedSearchEntry :id id))))))

(deftest hooks-nudge-the-background-sync-test
  (testing "insert, update and delete each request a background sync — and do nothing else"
    (let [nudges (atom 0)]
      (mt/with-dynamic-fn-redefs [mirror/request-sync! (fn [] (swap! nudges inc) nil)]
        (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                       {:search_prompt "p1" :entity table-entity}]
          (is (= 1 @nudges) "insert nudges once")
          (t2/update! :model/CuratedSearchEntry id {:search_prompt "p1 updated"})
          (is (= 2 @nudges) "update nudges once")
          (t2/delete! :model/CuratedSearchEntry :id id)
          (is (= 3 @nudges) "delete nudges once"))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the mirror is unavailable in tests"
    ;; The hooks call the OSS defenterprise shim, which no-ops without an enterprise license. They must
    ;; never throw or fail the authoritative write.
    (mt/with-temp [:model/CuratedSearchEntry {:keys [id]}
                   {:search_prompt "p1" :entity table-entity}]
      (testing "update"
        (is (pos? (t2/update! :model/CuratedSearchEntry id {:search_prompt "p1 updated"})))
        (is (= "p1 updated" (t2/select-one-fn :search_prompt :model/CuratedSearchEntry :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/CuratedSearchEntry :id id)))
        (is (nil? (t2/select-one :model/CuratedSearchEntry :id id)))))))
