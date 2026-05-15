(ns metabase.metabot.quality.governance-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.governance :as governance]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Empty / malformed input
;; ---------------------------------------------------------------------------

(deftest empty-input-returns-empty-map-test
  (testing "no refs → empty map; no DB lookup is issued"
    (is (= {} (governance/resolve-canonical-rank [])))
    (is (= {} (governance/resolve-canonical-rank nil)))))

(deftest malformed-refs-are-dropped-test
  (testing "refs missing :ref-type or :ref-id, or with non-keyword ref-type, are silently skipped"
    (is (= {} (governance/resolve-canonical-rank
               [{:ref-type :table}
                {:ref-id 1}
                {:ref-type "table" :ref-id 1}
                ["table" 1]
                [:table]
                [:table 1 :extra]
                nil])))))

(deftest accepts-tuple-and-map-shapes-test
  (testing "tuples and ref-maps with :ref-type/:ref-id produce identical keys"
    (is (= {[:dashboard 1] :unknown
            [:dashboard 2] :unknown}
           (governance/resolve-canonical-rank
            [[:dashboard 1]
             {:ref-type :dashboard :ref-id 2}])))))

;; ---------------------------------------------------------------------------
;; Unclassified ref-types — never issue a DB lookup, always :unknown
;; ---------------------------------------------------------------------------

(deftest dashboards-databases-transforms-are-unknown-test
  (testing "dashboard/database/transform ref-types are excluded from classification (strategy-v3 §3.1)"
    (is (= {[:dashboard 1]  :unknown
            [:database  2]  :unknown
            [:transform 3]  :unknown}
           (governance/resolve-canonical-rank
            [[:dashboard 1] [:database 2] [:transform 3]])))))

;; ---------------------------------------------------------------------------
;; Card branch — questions / models / metrics / :card refs from {{#N}}
;; ---------------------------------------------------------------------------

(deftest card-verified-is-canonical-test
  (testing "a card with a moderation_review verified on most_recent=true is :canonical"
    (mt/with-temp
      [:model/Collection {coll-id :id} {:authority_level nil}
       :model/Card {card-id :id} {:type :question :collection_id coll-id}
       :model/ModerationReview _ {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :most_recent         true
                                  :status              "verified"}]
      (is (= :canonical
             (get (governance/resolve-canonical-rank [[:question card-id]])
                  [:question card-id])))
      (testing "ref-type :card resolves identically — subtype is not consulted for the verdict"
        (is (= :canonical
               (get (governance/resolve-canonical-rank [[:card card-id]])
                    [:card card-id])))))))

(deftest card-in-official-collection-is-canonical-test
  (testing "a card in an :official collection is :canonical even without verification"
    (mt/with-temp
      [:model/Collection {coll-id :id} {:authority_level "official"}
       :model/Card {card-id :id} {:type :model :collection_id coll-id}]
      (is (= :canonical
             (get (governance/resolve-canonical-rank [[:model card-id]])
                  [:model card-id]))))))

(deftest card-without-markers-is-non-canonical-test
  (testing "a card with no moderation review and a non-official collection is :non-canonical"
    (mt/with-temp
      [:model/Collection {coll-id :id} {:authority_level nil}
       :model/Card {card-id :id} {:type :metric :collection_id coll-id}]
      (is (= :non-canonical
             (get (governance/resolve-canonical-rank [[:metric card-id]])
                  [:metric card-id]))))))

(deftest card-with-non-most-recent-verified-review-is-non-canonical-test
  (testing "a verified review that is not :most_recent does not confer canonicality"
    (mt/with-temp
      [:model/Collection {coll-id :id} {:authority_level nil}
       :model/Card {card-id :id} {:type :question :collection_id coll-id}
       :model/ModerationReview _ {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :most_recent         false
                                  :status              "verified"}]
      (is (= :non-canonical
             (get (governance/resolve-canonical-rank [[:question card-id]])
                  [:question card-id]))))))

(deftest card-not-in-appdb-is-unknown-test
  (testing "a card-typed ref whose id is missing from report_card returns :unknown"
    (is (= :unknown
           (get (governance/resolve-canonical-rank [[:card -1]])
                [:card -1])))))

;; ---------------------------------------------------------------------------
;; Table branch
;; ---------------------------------------------------------------------------

(deftest table-final-is-canonical-test
  (testing "a table with data_layer = :final is :canonical"
    (mt/with-temp
      [:model/Database {db-id :id} {}
       :model/Table {table-id :id} {:db_id db-id :data_layer :final}]
      (is (= :canonical
             (get (governance/resolve-canonical-rank [[:table table-id]])
                  [:table table-id]))))))

(deftest table-authoritative-is-canonical-test
  (testing "a table with data_authority = :authoritative is :canonical (independent of data_layer)"
    (mt/with-temp
      [:model/Database {db-id :id} {}
       :model/Table {table-id :id} {:db_id          db-id
                                    :data_layer     :internal
                                    :data_authority :authoritative}]
      (is (= :canonical
             (get (governance/resolve-canonical-rank [[:table table-id]])
                  [:table table-id]))))))

(deftest table-without-markers-is-non-canonical-test
  (testing "a table with neither :final nor :authoritative is :non-canonical"
    (mt/with-temp
      [:model/Database {db-id :id} {}
       :model/Table {table-id :id} {:db_id db-id :data_layer :internal}]
      (is (= :non-canonical
             (get (governance/resolve-canonical-rank [[:table table-id]])
                  [:table table-id]))))))

(deftest table-not-in-appdb-is-unknown-test
  (testing "a table-typed ref whose id is missing from metabase_table returns :unknown"
    (is (= :unknown
           (get (governance/resolve-canonical-rank [[:table -1]])
                [:table -1])))))

;; ---------------------------------------------------------------------------
;; Mixed-batch behaviour
;; ---------------------------------------------------------------------------

(deftest mixed-batch-resolves-each-ref-independently-test
  (testing "one call covering all branches resolves each ref to its own verdict"
    (mt/with-temp
      [:model/Database   {db-id :id}         {}
       :model/Table      {final-id :id}      {:db_id db-id :data_layer :final}
       :model/Table      {internal-id :id}   {:db_id db-id :data_layer :internal}
       :model/Collection {official-id :id}   {:authority_level "official"}
       :model/Collection {regular-id :id}    {:authority_level nil}
       :model/Card       {official-card :id} {:type :question :collection_id official-id}
       :model/Card       {regular-card :id}  {:type :question :collection_id regular-id}]
      (is (= {[:table     final-id]      :canonical
              [:table     internal-id]   :non-canonical
              [:table     -1]            :unknown
              [:question  official-card] :canonical
              [:question  regular-card]  :non-canonical
              [:card      -1]            :unknown
              [:dashboard 99]            :unknown
              [:database  db-id]         :unknown
              [:transform 1]             :unknown}
             (governance/resolve-canonical-rank
              [[:table     final-id]
               [:table     internal-id]
               [:table     -1]
               [:question  official-card]
               [:question  regular-card]
               [:card      -1]
               [:dashboard 99]
               [:database  db-id]
               [:transform 1]]))))))

(deftest deduped-refs-issue-one-lookup-test
  (testing "duplicate input refs collapse into a single key in the output map"
    (mt/with-temp
      [:model/Collection {coll-id :id} {:authority_level "official"}
       :model/Card {card-id :id} {:type :question :collection_id coll-id}]
      (is (= {[:question card-id] :canonical}
             (governance/resolve-canonical-rank
              [[:question card-id]
               [:question card-id]
               {:ref-type :question :ref-id card-id}]))))))
