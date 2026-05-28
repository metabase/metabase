(ns metabase.metabot.quality.governance-test
  "`mt/with-temp` fixtures + the live appdb. Tests fall into two groups:
  [[governance/resolve]] shape tests that assert the `{[type id-str] facts}`
  map, and [[governance/canonical?]] tests that exercise each positive axis
  and hard negative — both as a pure predicate and round-tripped through
  `resolve`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.governance :as governance]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; resolve — card facts
;;; ---------------------------------------------------------------------------

(deftest resolve-card-facts-test
  (testing "card facts carry :kind :card, the moderation status, and the hard-negative flags; canonical? round-trips through resolve"
    (mt/initialize-if-needed! :test-users-personal-collections)
    (let [personal-id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
      (mt/with-temp [:model/Collection         {off-id :id}  {:name "official" :authority_level "official"}
                     :model/Dashboard          {dash-id :id} {:name "dash"}
                     :model/Card               {ver-id :id}  {:name "verified"}
                     :model/ModerationReview   _             {:moderated_item_id   ver-id
                                                              :moderated_item_type "card"
                                                              :moderator_id        (mt/user->id :rasta)
                                                              :most_recent         true
                                                              :status              "verified"}
                     :model/Card               {off-id* :id} {:name "official card" :collection_id off-id}
                     :model/Card               {plain-id :id}    {:name "plain"}
                     :model/Card               {arch-id :id}     {:name "archived" :archived true}
                     :model/Card               {dash-card :id}   {:name "internal" :dashboard_id dash-id}
                     :model/Card               {personal-id* :id} {:name "personal" :collection_id personal-id}]
        (let [res (governance/resolve [{:type "card" :id ver-id}
                                       {:type "card" :id off-id*}
                                       {:type "card" :id plain-id}
                                       {:type "card" :id arch-id}
                                       {:type "card" :id dash-card}
                                       {:type "card" :id personal-id*}]
                                      #{})
              facts (fn [id] (get res ["card" (str id)]))]
          (testing "kind + names"
            (is (= :card (:kind (facts ver-id))))
            (is (= "verified" (:name (facts ver-id)))))
          (testing "declared via moderation"
            (is (= "verified" (:moderation-status (facts ver-id))))
            (is (true? (governance/canonical? (facts ver-id)))))
          (testing "declared via collection authority level"
            (is (= "official" (:authority-level (facts off-id*))))
            (is (true? (governance/canonical? (facts off-id*)))))
          (testing "plain card is non-canonical"
            (is (nil? (:moderation-status (facts plain-id))))
            (is (false? (governance/canonical? (facts plain-id)))))
          (testing "archived hard negative"
            (is (true? (:archived? (facts arch-id))))
            (is (false? (governance/canonical? (facts arch-id)))))
          (testing "dashboard-internal hard negative"
            (is (true? (:dashboard-internal? (facts dash-card))))
            (is (false? (governance/canonical? (facts dash-card)))))
          (testing "personal-collection hard negative"
            (is (true? (:lives-in-personal? (facts personal-id*))))
            (is (false? (governance/canonical? (facts personal-id*))))))))))

(deftest resolve-collapses-card-types-to-single-query-test
  (testing "all four card-types (card/question/model/metric) query report_card; same id under different types lands as separate keys with the same facts"
    (mt/with-temp [:model/Card {c-id :id} {:name "shared"}]
      (let [res (governance/resolve [{:type "card"     :id c-id}
                                     {:type "question" :id c-id}
                                     {:type "model"    :id c-id}
                                     {:type "metric"   :id c-id}]
                                    #{})]
        (is (= 4 (count res))
            "one key per requested type")
        (is (every? #(= :card (:kind %)) (vals res))
            "each key carries a card facts map")
        (is (every? #(= "shared" (:name %)) (vals res))
            "each key carries the same facts map")))))

(deftest resolve-folds-multiple-most-recent-rows-to-single-verified-test
  (testing "pathological multiple most_recent=true rows still resolve :moderation-status = verified if any is verified"
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
      (let [res (governance/resolve [{:type "card" :id c-id}] #{})]
        (is (= "verified" (get-in res [["card" (str c-id)] :moderation-status]))
            "verified wins across multiple most_recent rows")))))

;;; ---------------------------------------------------------------------------
;;; resolve — table facts
;;; ---------------------------------------------------------------------------

(deftest resolve-table-facts-test
  (testing "table facts carry :kind :table and the canonical inputs; canonical? round-trips for the declared/placed axes and each hard negative"
    (mt/with-temp [:model/Database {db-id :id} {:name "tdb"}
                   :model/Table    {auth-id :id}  {:name "authoritative" :db_id db-id :data_authority :authoritative}
                   :model/Table    {final-id :id} {:name "final layer" :db_id db-id :data_layer :final}
                   :model/Table    {plain-id :id} {:name "plain" :db_id db-id}
                   :model/Table    {inact-id :id} {:name "inactive" :db_id db-id :data_authority :authoritative :active false}
                   :model/Table    {vis-id :id}   {:name "hidden" :db_id db-id :data_authority :authoritative :visibility_type :hidden}
                   :model/Table    {arch-id :id}  {:name "archived" :db_id db-id :data_authority :authoritative
                                                   :archived_at #t "2024-01-01T00:00:00Z"}]
      (let [res   (governance/resolve [{:type "table" :id auth-id}
                                       {:type "table" :id final-id}
                                       {:type "table" :id plain-id}
                                       {:type "table" :id inact-id}
                                       {:type "table" :id vis-id}
                                       {:type "table" :id arch-id}]
                                      #{})
            facts (fn [id] (get res ["table" (str id)]))]
        (testing "shape"
          (is (= :table (:kind (facts auth-id))))
          (is (= "authoritative" (:name (facts auth-id))))
          (is (false? (:in-library? (facts auth-id)))
              "no collection means not in the Library"))
        (testing "declared via data authority"
          (is (= :authoritative (:data-authority (facts auth-id))))
          (is (true? (governance/canonical? (facts auth-id)))))
        (testing "placed via data layer"
          (is (= :final (:data-layer (facts final-id))))
          (is (true? (governance/canonical? (facts final-id)))))
        (testing "plain table is non-canonical"
          (is (false? (governance/canonical? (facts plain-id)))))
        (testing "inactive hard negative overrides the declared axis"
          (is (false? (:active? (facts inact-id))))
          (is (false? (governance/canonical? (facts inact-id)))))
        (testing "visibility-type hard negative overrides the declared axis"
          (is (true? (:visibility-type-set? (facts vis-id))))
          (is (false? (governance/canonical? (facts vis-id)))))
        (testing "archived-at hard negative overrides the declared axis"
          (is (true? (:archived-at? (facts arch-id))))
          (is (false? (governance/canonical? (facts arch-id)))))))))

;;; ---------------------------------------------------------------------------
;;; resolve — dashboard / database / transform (name-only)
;;; ---------------------------------------------------------------------------

(deftest resolve-name-only-types-test
  (testing "dashboards / databases / transforms surface :kind :other and :name only"
    (mt/with-temp [:model/Dashboard {dash-id :id}   {:name "weekly review"}
                   :model/Database  {db-id   :id}   {:name "prod warehouse"}]
      (let [res (governance/resolve [{:type "dashboard" :id dash-id}
                                     {:type "database"  :id db-id}]
                                    #{})]
        (is (= {:kind :other :name "weekly review"}  (get res ["dashboard" (str dash-id)])))
        (is (= {:kind :other :name "prod warehouse"} (get res ["database"  (str db-id)])))))))

;;; ---------------------------------------------------------------------------
;;; resolve — input partitioning and edge cases
;;; ---------------------------------------------------------------------------

(deftest resolve-ignores-unknown-types-test
  (testing "refs whose :type is outside the governance vocabulary are silently dropped"
    (mt/with-temp [:model/Card {c-id :id} {:name "card"}]
      (let [res (governance/resolve [{:type "card"       :id c-id}
                                     {:type "field"      :id 1}
                                     {:type "collection" :id 1}
                                     {:type "document"   :id 1}]
                                    #{})]
        (is (= #{["card" (str c-id)]} (set (keys res)))
            "only the governance-consumed types contribute to the result")))))

(deftest resolve-drops-non-numeric-ids-test
  (testing "refs whose :id won't coerce to Long don't make it into any query"
    (mt/with-temp [:model/Card {c-id :id} {:name "real card"}]
      (let [res (governance/resolve [{:type "card"  :id c-id}
                                     {:type "card"  :id "abc"}
                                     {:type "table" :id "agg__alias"}]
                                    #{})]
        (is (= #{["card" (str c-id)]} (set (keys res)))
            "only the numeric-id refs reach the appdb")))))

(deftest resolve-missing-entities-absent-from-map-test
  (testing "an entity-id that doesn't exist in the appdb is absent from the result"
    (let [res (governance/resolve [{:type "card"      :id 999999998}
                                   {:type "table"     :id 999999999}
                                   {:type "dashboard" :id 999999997}]
                                  #{})]
      (is (= {} res)
          "absent rather than nil-valued — callers tolerate missing keys"))))

(deftest resolve-empty-input-test
  (testing "empty input yields an empty map and issues no queries (smoke-test path)"
    (is (= {} (governance/resolve [] #{})))))

;;; ---------------------------------------------------------------------------
;;; canonical? — pure predicate matrix
;;; ---------------------------------------------------------------------------

(deftest canonical-predicate-test
  (testing "card positive axes"
    (is (true? (governance/canonical? {:kind :card :archived? false :dashboard-internal? false
                                       :lives-in-personal? false :moderation-status "verified"})))
    (is (true? (governance/canonical? {:kind :card :archived? false :dashboard-internal? false
                                       :lives-in-personal? false :authority-level "official"})))
    (is (true? (governance/canonical? {:kind :card :archived? false :dashboard-internal? false
                                       :lives-in-personal? false :root-collection-type "library"})))
    (is (true? (governance/canonical? {:kind :card :archived? false :dashboard-internal? false
                                       :lives-in-personal? false :root-collection-type "library-metrics"}))))
  (testing "card hard negatives override every positive axis"
    (is (false? (governance/canonical? {:kind :card :archived? true :moderation-status "verified"})))
    (is (false? (governance/canonical? {:kind :card :dashboard-internal? true :authority-level "official"})))
    (is (false? (governance/canonical? {:kind :card :lives-in-personal? true :root-collection-type "library"}))))
  (testing "card with no positive axis is non-canonical"
    (is (false? (governance/canonical? {:kind :card :archived? false :dashboard-internal? false
                                        :lives-in-personal? false}))))
  (testing "table positive axes"
    (is (true? (governance/canonical? {:kind :table :archived-at? false :active? true
                                       :visibility-type-set? false :data-authority :authoritative})))
    (is (true? (governance/canonical? {:kind :table :archived-at? false :active? true
                                       :visibility-type-set? false :is-published? true :in-library? true})))
    (is (true? (governance/canonical? {:kind :table :archived-at? false :active? true
                                       :visibility-type-set? false :data-layer :final}))))
  (testing "table published but not in the Library is not placed"
    (is (false? (governance/canonical? {:kind :table :archived-at? false :active? true
                                        :visibility-type-set? false :is-published? true :in-library? false}))))
  (testing "table hard negatives override every positive axis"
    (is (false? (governance/canonical? {:kind :table :archived-at? true :active? true
                                        :visibility-type-set? false :data-authority :authoritative})))
    (is (false? (governance/canonical? {:kind :table :archived-at? false :active? true
                                        :visibility-type-set? true :data-authority :authoritative})))
    (is (false? (governance/canonical? {:kind :table :archived-at? false :active? false
                                        :visibility-type-set? false :data-authority :authoritative}))))
  (testing "non-card/non-table kinds and nil are never canonical, with no thrown branch"
    (is (false? (governance/canonical? {:kind :other :name "a dashboard"})))
    (is (false? (governance/canonical? nil)))))

;;; ---------------------------------------------------------------------------
;;; canonical? — Library placement (round-tripped through resolve)
;;; ---------------------------------------------------------------------------

(deftest canonical-card-placed-in-library-test
  (testing "a card whose top-level collection is a Library type is canonical via the placed axis"
    ;; The OSS content gate is a no-op, so disabling :library lets a card sit in a Library collection.
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection {lib-id :id} {:name "Metrics" :type "library-metrics"}
                     :model/Card       {c-id :id}   {:name "lib card" :collection_id lib-id}]
        (let [res (governance/resolve [{:type "card" :id c-id}] #{})]
          (is (= "library-metrics" (get-in res [["card" (str c-id)] :root-collection-type])))
          (is (true? (governance/canonical? (get res ["card" (str c-id)])))))))))

(deftest library-collection-ids-and-table-placement-test
  (testing "library-collection-ids returns the Library root plus descendants; a published table nested under it is canonical"
    (mt/with-temp [:model/Collection {root-id :id} {:name "Library" :type "library"}
                   :model/Collection {data-id :id} {:name "Data" :type "library-data"
                                                    :location (str "/" root-id "/")}
                   :model/Database   {db-id :id}   {:name "wh"}
                   :model/Table      {pub-id :id}  {:name "published" :db_id db-id
                                                    :collection_id data-id :is_published true :active true}
                   :model/Table      {else-id :id} {:name "elsewhere" :db_id db-id
                                                    :is_published false :active true}]
      (let [lib-cids (governance/library-collection-ids)]
        (is (contains? lib-cids root-id)
            "the Library root id is included")
        (is (contains? lib-cids data-id)
            "a descendant of the Library root is included")
        (let [res (governance/resolve [{:type "table" :id pub-id}
                                       {:type "table" :id else-id}]
                                      lib-cids)]
          (is (true? (:in-library? (get res ["table" (str pub-id)]))))
          (is (true? (governance/canonical? (get res ["table" (str pub-id)])))
              "published table in the Library tree is canonical")
          (is (false? (governance/canonical? (get res ["table" (str else-id)])))
              "an unpublished table outside the Library is not canonical"))))))
