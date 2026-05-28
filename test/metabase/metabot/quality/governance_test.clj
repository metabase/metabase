(ns metabase.metabot.quality.governance-test
  "`mt/with-temp` fixtures + the live appdb. Each test creates a small
  artifact graph, calls [[governance/resolve]], and asserts on the shape
  of the returned `{[type id-str] facts}` map."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.governance :as governance]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; resolve — card facts
;;; ---------------------------------------------------------------------------

(deftest resolve-card-verified-and-unverified-test
  (testing "verified vs. unverified card facts surface correctly"
    (mt/with-temp [:model/Card             {v-id :id} {:name "verified card"}
                   :model/Card             {u-id :id} {:name "unverified card"}
                   :model/ModerationReview _          {:moderated_item_id   v-id
                                                       :moderated_item_type "card"
                                                       :moderator_id        (mt/user->id :rasta)
                                                       :most_recent         true
                                                       :status              "verified"}]
      (let [res (governance/resolve [{:type "card" :id v-id}
                                     {:type "card" :id u-id}])]
        (is (true?  (get-in res [["card" (str v-id)] :verified?]))
            "verified card surfaces :verified? = true")
        (is (false? (get-in res [["card" (str u-id)] :verified?]))
            "card without a verified review surfaces :verified? = false")
        (is (= "verified card"   (get-in res [["card" (str v-id)] :name])))
        (is (= "unverified card" (get-in res [["card" (str u-id)] :name])))))))

(deftest resolve-collapses-card-types-to-single-query-test
  (testing "all four card-types (card/question/model/metric) query report_card; same id under different types lands as separate keys with the same facts"
    (mt/with-temp [:model/Card {c-id :id} {:name "shared"}]
      (let [res (governance/resolve [{:type "card"     :id c-id}
                                     {:type "question" :id c-id}
                                     {:type "model"    :id c-id}
                                     {:type "metric"   :id c-id}])]
        (is (= 4 (count res))
            "one key per requested type")
        (is (every? #(= "shared" (:name %)) (vals res))
            "each key carries the same facts map")))))

;;; ---------------------------------------------------------------------------
;;; resolve — table / dashboard / database / transform
;;; ---------------------------------------------------------------------------

(deftest resolve-table-surfaces-schema-and-db-id-test
  (testing "table facts include :schema and :db-id alongside :name"
    (mt/with-temp [:model/Database {db-id :id}    {:name "tdb"}
                   :model/Table    {tbl-id :id}   {:name   "orders"
                                                   :schema "PUBLIC"
                                                   :db_id  db-id}]
      (let [res (governance/resolve [{:type "table" :id tbl-id}])]
        (is (= {:name "orders" :schema "PUBLIC" :db-id db-id}
               (get res ["table" (str tbl-id)])))))))

(deftest resolve-name-only-types-test
  (testing "dashboards / databases / transforms surface :name only"
    (mt/with-temp [:model/Dashboard {dash-id :id}   {:name "weekly review"}
                   :model/Database  {db-id   :id}   {:name "prod warehouse"}]
      (let [res (governance/resolve [{:type "dashboard" :id dash-id}
                                     {:type "database"  :id db-id}])]
        (is (= {:name "weekly review"}    (get res ["dashboard" (str dash-id)])))
        (is (= {:name "prod warehouse"}   (get res ["database"  (str db-id)])))))))

;;; ---------------------------------------------------------------------------
;;; resolve — input partitioning and edge cases
;;; ---------------------------------------------------------------------------

(deftest resolve-ignores-unknown-types-test
  (testing "refs whose :type is outside the governance vocabulary are silently dropped"
    (mt/with-temp [:model/Card {c-id :id} {:name "card"}]
      (let [res (governance/resolve [{:type "card"       :id c-id}
                                     {:type "field"      :id 1}
                                     {:type "collection" :id 1}
                                     {:type "document"   :id 1}])]
        (is (= #{["card" (str c-id)]} (set (keys res)))
            "only the governance-consumed types contribute to the result")))))

(deftest resolve-drops-non-numeric-ids-test
  (testing "refs whose :id won't coerce to Long don't make it into any query"
    (mt/with-temp [:model/Card {c-id :id} {:name "real card"}]
      (let [res (governance/resolve [{:type "card"  :id c-id}
                                     {:type "card"  :id "abc"}
                                     {:type "table" :id "agg__alias"}])]
        (is (= #{["card" (str c-id)]} (set (keys res)))
            "only the numeric-id refs reach the appdb")))))

(deftest resolve-missing-entities-absent-from-map-test
  (testing "an entity-id that doesn't exist in the appdb is absent from the result"
    (let [res (governance/resolve [{:type "card"      :id 999999998}
                                   {:type "table"     :id 999999999}
                                   {:type "dashboard" :id 999999997}])]
      (is (= {} res)
          "absent rather than nil-valued — callers tolerate missing keys"))))

(deftest resolve-empty-input-test
  (testing "empty input yields an empty map and issues no queries (smoke-test path)"
    (is (= {} (governance/resolve [])))))

;;; ---------------------------------------------------------------------------
;;; resolve — moderation review dedup
;;; ---------------------------------------------------------------------------

(deftest resolve-folds-multiple-most-recent-rows-to-single-verified-test
  (testing "pathological multiple most_recent=true rows still resolve :verified? = true if any is verified"
    (mt/with-temp [:model/Card             {c-id :id}  {:name "two reviews"}
                   :model/ModerationReview _           {:moderated_item_id   c-id
                                                        :moderated_item_type "card"
                                                        :moderator_id        (mt/user->id :rasta)
                                                        :most_recent         true
                                                        :status              "verified"}
                   :model/ModerationReview _           {:moderated_item_id   c-id
                                                        :moderated_item_type "card"
                                                        :moderator_id        (mt/user->id :crowberto)
                                                        :most_recent         true
                                                        :status              nil}]
      (let [res (governance/resolve [{:type "card" :id c-id}])]
        (is (true? (get-in res [["card" (str c-id)] :verified?]))
            "OR-fold across multiple most_recent rows preserves the verified bit")))))
