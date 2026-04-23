(ns metabase-enterprise.data-complexity-score.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.api :as api]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase.metabot.config :as metabot.config]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment api/keep-me)

(def ^:private endpoint "ee/data-complexity-score/complexity")

(def ^:private additive-dims [:scale :nominal :semantic])

(defn- var-value [resp catalog dim k]
  (get-in resp [catalog :dimensions dim :variables k :value]))

(defn- entity-count [resp catalog]
  (var-value resp catalog :scale :entity-count))

(defn- internal-metabot-id
  "Primary key of the internal Metabot row — used by the tests that temporarily tweak its
   `use_verified_content`/`collection_id` via `mt/with-temp-vals-in-db`. Calls
   `mt/initialize-if-needed!` so the row is populated by migrations even when this test runs in
   isolation (the endpoint tests piggyback on the web-server init and miss this failure mode)."
  []
  (mt/initialize-if-needed! :db)
  (t2/select-one-pk :model/Metabot
                    :entity_id (get-in metabot.config/metabot-config
                                       [metabot.config/internal-metabot-id :entity-id])))

(deftest complexity-endpoint-requires-superuser-test
  (testing "non-superusers are rejected"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 endpoint)))))

(deftest complexity-endpoint-superuser-gets-consistent-totals-test
  (testing "check invariants not covered by schema"
    (let [resp (mt/user-http-request :crowberto :get 200 endpoint)
          ;; Scored variables on the additive dimensions. Metadata variables are descriptive
          ;; coverage ratios and excluded — they can legitimately drop as a catalog widens (e.g.
          ;; universe pulls in uncurated tables), breaking the monotonicity invariant.
          ;;
          ;; NOTE: `:synonym-pairs` is intentionally included here even though it's *theoretically*
          ;; non-monotonic — the synonym-pair scorer dedupes by normalized name and keeps whichever
          ;; embedding `search-index-embedder` happens to pick for that name, so adding
          ;; universe-only entities that collide on normalized name with a library entity could in
          ;; principle flip which vector wins and drop the pair count below library's. Reviewers
          ;; (human or AI) sometimes want to carve it out on that basis — don't. In every realistic
          ;; configuration (prod, dev, the fixture that backs this endpoint's hermetic path in
          ;; complexity_test.clj) the invariant holds, and asserting it keeps us honest about
          ;; regressions in the common case.
          scored-vars [[:scale    :entity-count]
                       [:scale    :field-count]
                       [:scale    :collection-tree-size]
                       [:nominal  :name-collisions]
                       [:nominal  :repeated-measures]
                       [:nominal  :field-level-collisions]
                       [:semantic :synonym-pairs]]]
      (testing ":total equals the sum of additive-dimension :sub-total values (metadata excluded)"
        (doseq [catalog [:library :universe :metabot]
                :let [{:keys [total dimensions]} (get resp catalog)
                      add-totals (map (comp :sub-total dimensions) additive-dims)]]
          (is (= total (reduce + 0 (remove nil? add-totals)))
              (format "%s :total should equal sum of additive dimension :sub-total values" catalog))))
      (testing "universe is a superset of library on every scored variable"
        (doseq [[dim k] scored-vars
                metric  [:value :score]]
          (let [lib (get-in resp [:library  :dimensions dim :variables k metric])
                uni (get-in resp [:universe :dimensions dim :variables k metric])]
            (when (and (number? lib) (number? uni))
              (is (>= uni lib)
                  (format "universe %s %s %s (%s) should be ≥ library's (%s)"
                          dim k metric uni lib))))))
      (testing ":synonym-pairs can't exceed the number of distinct-name pairs possible"
        (doseq [catalog [:library :universe :metabot]
                :let [n         (entity-count resp catalog)
                      syn-pairs (var-value resp catalog :semantic :synonym-pairs)
                      max-pairs (/ (* n (dec n)) 2)]]
          (is (<= syn-pairs max-pairs)
              (format "%s :synonym-pairs (%d) can't exceed n*(n-1)/2 for n=%d" catalog syn-pairs n))))
      (testing "every catalog carries all four dimensions at the default level (2)"
        (doseq [catalog [:library :universe :metabot]]
          (is (= #{:scale :nominal :semantic :metadata}
                 (set (keys (get-in resp [catalog :dimensions])))))))
      (testing ":meta reports the current formula-version + level"
        (is (= 3 (get-in resp [:meta :formula-version])))
        (is (number? (get-in resp [:meta :level])))))))

(deftest complexity-endpoint-metabot-catalog-test
  (testing ":metabot mirrors :universe when neither content-verification nor use_verified_content is active"
    ;; Pin both gates explicitly instead of relying on test-env defaults — the reused-verbatim path
    ;; is only exercised when the scope is empty, and we want this assertion to keep passing even
    ;; if the ambient defaults shift.
    (mt/with-premium-features #{}
      (mt/with-temp-vals-in-db :model/Metabot (internal-metabot-id)
                               {:use_verified_content false :collection_id nil}
        (let [resp (mt/user-http-request :crowberto :get 200 endpoint)]
          (is (= (:universe resp) (:metabot resp)))))))
  (testing ":metabot is scored separately when :content-verification + use_verified_content are both active"
    ;; Positive path: verified-only filtering restricts Cards to those with an active verified
    ;; moderation review. We inject a fresh unverified Card so the assertion doesn't depend on
    ;; ambient test-env content — the `:universe` count includes this Card, `:metabot` excludes it.
    (mt/with-premium-features #{:content-verification}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Card    _           {:database_id db-id
                                                 :type        :model
                                                 :name        "Unverified Only Card"
                                                 :archived    false}]
        (mt/with-temp-vals-in-db :model/Metabot (internal-metabot-id)
                                 {:use_verified_content true :collection_id nil}
          (let [resp (mt/user-http-request :crowberto :get 200 endpoint)]
            (is (< (entity-count resp :metabot)
                   (entity-count resp :universe))
                ":metabot entity-count must be strictly < :universe when verified-only filters out the injected Card")))))))

(deftest complexity-endpoint-metabot-collection-scope-test
  (testing ":metabot is scoped to the internal Metabot's collection_id subtree (root + descendants)"
    ;; Fixture shape — exercises both halves of `metabot-collection-scope-ids`:
    ;;   parent     ← Metabot's collection_id; holds a Card directly (catches root-omitted regressions)
    ;;     └ child  → holds a nested Card (catches descent-dropped regressions)
    ;;   sibling    → holds the out-of-subtree Card
    ;;   empty      → no Cards; baseline scope so we can pin *exact* card-count deltas
    ;;
    ;; Tables pass through :metabot unfiltered, so ambient table counts cancel when we take
    ;; differentials against `empty`. That leaves us a clean count of Cards visible under each
    ;; scope, which lets us assert exact expected counts rather than relative inequalities.
    ;; Pin premium features off explicitly so `:verified-only?` can't drift in and confound.
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection {parent-id :id}  {:name "Metabot Scope Parent"
                                                         :location "/"}
                     :model/Collection {child-id :id}   {:name     "Metabot Scope Child"
                                                         :location (format "/%d/" parent-id)}
                     :model/Collection {sibling-id :id} {:name "Metabot Scope Sibling"
                                                         :location "/"}
                     :model/Collection {empty-id :id}   {:name "Metabot Scope Empty"
                                                         :location "/"}
                     :model/Database {db-id :id}        {}
                     :model/Card _                      {:database_id   db-id
                                                         :type          :model
                                                         :name          "Metabot Root Card"
                                                         :archived      false
                                                         :collection_id parent-id}
                     :model/Card _                      {:database_id   db-id
                                                         :type          :model
                                                         :name          "Metabot In-subtree Nested Card"
                                                         :archived      false
                                                         :collection_id child-id}
                     :model/Card _                      {:database_id   db-id
                                                         :type          :metric
                                                         :name          "Metabot Out-of-subtree Card"
                                                         :archived      false
                                                         :collection_id sibling-id}]
        (let [counts-with-scope (fn [cid]
                                  (mt/with-temp-vals-in-db :model/Metabot (internal-metabot-id)
                                                           {:use_verified_content false
                                                            :collection_id cid}
                                    (let [resp (mt/user-http-request :crowberto :get 200 endpoint)]
                                      {:metabot  (entity-count resp :metabot)
                                       :universe (entity-count resp :universe)})))
              empty-counts   (counts-with-scope empty-id)
              parent-counts  (counts-with-scope parent-id)
              sibling-counts (counts-with-scope sibling-id)
              empty-count    (:metabot empty-counts)
              parent-count   (:metabot parent-counts)
              sibling-count  (:metabot sibling-counts)]
          (testing "scope=parent counts both the root Card and the nested descendant Card"
            ;; If the root collection id were dropped from `metabot-collection-scope-ids`, the
            ;; root Card would vanish and `parent-count` would land at `empty-count + 1`. If
            ;; descent regressed, the nested Card would vanish and `parent-count` would again
            ;; be `empty-count + 1`. Either regression fails this assertion.
            (is (= (+ empty-count 2) parent-count)
                "scope=parent :metabot must include BOTH parent-card (root) AND child-card (descendant)"))
          (testing "scope=sibling counts only the in-scope Card (out-of-subtree Card is excluded)"
            ;; If the collection-id filter were dropped entirely, `sibling-count` would jump to
            ;; `empty-count + 3` (all three fixture Cards visible), failing this assertion.
            (is (= (inc empty-count) sibling-count)
                "scope=sibling :metabot must include only sibling-card — collection filter must apply"))
          (testing ":universe entity-count is unaffected by Metabot collection scope"
            ;; Guards against a regression where the subtree filter leaks into `:universe`
            ;; scoring. If it did, `:universe` counts would move in lockstep with `:metabot`
            ;; across the three scopes and this assertion would fail.
            (is (= (:universe empty-counts)
                   (:universe parent-counts)
                   (:universe sibling-counts))
                ":universe must be unscoped regardless of Metabot.collection_id")))))))

(deftest internal-metabot-scope-test
  (testing ":verified-only? is true only when the premium feature + use_verified_content both apply"
    (doseq [{:keys [features use-verified? expected-verified?]}
            [{:features #{}                        :use-verified? false :expected-verified? false}
             {:features #{}                        :use-verified? true  :expected-verified? false}
             {:features #{:content-verification}   :use-verified? false :expected-verified? false}
             {:features #{:content-verification}   :use-verified? true  :expected-verified? true}]]
      (testing (format "features=%s use_verified_content=%s" (pr-str features) use-verified?)
        (mt/with-premium-features features
          (mt/with-temp-vals-in-db :model/Metabot (internal-metabot-id)
                                   {:use_verified_content use-verified? :collection_id nil}
            (is (= {:verified-only? expected-verified? :collection-id nil}
                   (metabot-scope/internal-metabot-scope))))))))
  (testing ":collection-id is read straight from the internal Metabot row regardless of premium features"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "metabot scope test coll"}]
      (mt/with-premium-features #{}
        (mt/with-temp-vals-in-db :model/Metabot (internal-metabot-id)
                                 {:use_verified_content false :collection_id coll-id}
          (is (= {:verified-only? false :collection-id coll-id}
                 (metabot-scope/internal-metabot-scope))))))))
