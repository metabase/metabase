(ns metabase.explorations.query-plan.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(defn- orders-count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
         (lib/aggregate (lib/count))))))

(defn- clause-names
  [q clauses]
  (mapv #(lib/display-name q %) clauses))

(defn- card-filter-display-names
  [card]
  (let [mp (mt/metadata-provider)
        q  (lib/query mp (:dataset_query card))]
    (clause-names q (lib/filters q))))

(defn- insert-block-page-row!
  "Persist a block + page for `thread-id` and return the page pk."
  [thread-id metric-id {:keys [metrics dimensions]} dim-id]
  (let [block   (first (t2/insert-returning-instances!
                        :model/ExplorationBlock
                        {:exploration_thread_id thread-id
                         :metrics               metrics
                         :dimensions            dimensions
                         :position              0}))
        page-id (t2/insert-returning-pk! :model/ExplorationPage
                                         {:exploration_block_id (:id block)
                                          :card_id              metric-id
                                          :dimension_id         dim-id
                                          :query_type           "default"})]
    page-id))

(deftest per-block-context-scopes-applicability-test
  (testing "metric-and-dim-context returns one entry per block, with applicability scoped to that block's dims"
    (mt/with-temp [:model/Card metric {:type :metric :name "Revenue"
                                       :dataset_query (count-metric-query)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            ;; Two blocks sharing the same metric. Block A pairs it with d1 only;
            ;; block B with d2 only — even though the metric's dimension_mappings
            ;; resolve BOTH dims. Applicability must stay within each block.
            block-a  {:id 1
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d1" :display_name "Price"
                                    :effective_type :type/Number}]}
            block-b  {:id 2
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d2" :display_name "Name"
                                    :effective_type :type/Text}]}
            result   (qp.context/metric-and-dim-context [block-a block-b])
            blocks   (:blocks result)
            [ba bb]  blocks]
        (is (= 2 (count blocks)) "one context entry per block")
        (is (= [1 2] (map :block-id blocks)) "block-id carried through")
        (is (= ["Revenue" "Revenue"] (map :name blocks))
            "block name is computed from the metric Card (both blocks share the metric)")
        (testing "the shared metric is hydrated in both blocks"
          (is (= [cid] (map :metric-id (:metrics ba))))
          (is (= [cid] (map :metric-id (:metrics bb))))
          (is (= cid (-> ba :metrics first :card :id))
              "metric Card is hydrated (not just referenced)"))
        (testing "applicability is scoped to each block's own dimensions"
          (is (= #{"d1"} (set (keys (get-in ba [:applicability cid])))))
          (is (= #{"d2"} (set (keys (get-in bb [:applicability cid]))))))
        (testing "each block's :dimensions list is its own"
          (is (= ["d1"] (map :dimension-id (:dimensions ba))))
          (is (= ["d2"] (map :dimension-id (:dimensions bb)))))))))

(deftest build-row-context-resolves-from-block-test
  (testing "build-row-context resolves the dim target + snapshot from the row's page's block (not per-thread tables)"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}]
            block    (first (t2/insert-returning-instances!
                             :model/ExplorationBlock
                             {:exploration_thread_id (:id t)
                              :metrics               [{:card_id cid :dimension_mappings mappings}]
                              :dimensions            [{:dimension_id "d1" :display_name "Price"
                                                       :effective_type "type/Number"}]
                              :position              0}))
            page-id  (t2/insert-returning-pk! :model/ExplorationPage
                                              {:exploration_block_id (:id block)
                                               :card_id              cid
                                               :dimension_id         "d1"
                                               :query_type           "default"})
            row      {:card_id cid :dimension_id "d1" :page_id page-id :params {}}
            ctx      (qp.context/build-row-context row)]
        (is (some? ctx))
        (is (some? (:target ctx)) "dimension target resolved from the block's metric mappings")
        (is (= "Price" (:dim-label ctx)))
        (is (= "d1" (-> ctx :dim :dimension_id)))
        (is (= :type/Number (-> ctx :dim :effective_type)) "dim type keywordized by the model transform")))))

(deftest build-row-context-applies-explore-filters-test
  (testing "build-row-context scopes the metric Card to a single explore filter"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}]
            page-id  (insert-block-page-row!
                      (:id t) cid
                      {:metrics    [{:card_id cid
                                     :dimension_mappings mappings
                                     :explore_filters    [{:field_ref ["field" {} (mt/id :venues :price)]
                                                           :value     2}]}]
                       :dimensions [{:dimension_id "d1" :display_name "Price"
                                     :effective_type "type/Number"}]}
                      "d1")
            ctx      (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                    :page_id page-id :params {}})]
        (is (some? ctx))
        (is (some #(and (str/includes? % "Price") (str/includes? % "2"))
                  (card-filter-display-names (:card ctx))))))))

(deftest build-row-context-applies-multiple-explore-filters-test
  (testing "build-row-context reduces multiple explore_filters onto the metric Card in order"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            page-id  (insert-block-page-row!
                      (:id t) cid
                      {:metrics    [{:card_id cid
                                     :dimension_mappings mappings
                                     :explore_filters    [{:field_ref ["field" {} (mt/id :venues :price)]
                                                           :value     2}
                                                          {:field_ref ["field" {} (mt/id :venues :name)]
                                                           :value     "Smallville"}]}]
                       :dimensions [{:dimension_id "d1" :display_name "Price"
                                     :effective_type "type/Number"}
                                    {:dimension_id "d2" :display_name "Name"
                                     :effective_type "type/Text"}]}
                      "d1")
            names    (card-filter-display-names
                      (:card (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                            :page_id page-id :params {}})))]
        (is (= 2 (count names)))
        (is (some #(and (str/includes? % "Price") (str/includes? % "2")) names))
        (is (some #(and (str/includes? % "Name") (str/includes? % "Smallville")) names))))))

(deftest build-row-context-applies-temporal-bucket-filter-test
  (testing "build-row-context applies the click ref's temporal bucket to the explore filter target"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (orders-count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid        (:id metric)
            created-at (mt/id :orders :created_at)
            mappings   [{:dimension_id "d1" :table_id (mt/id :orders)
                         :target ["field" {} created-at]}]
            page-id    (insert-block-page-row!
                        (:id t) cid
                        {:metrics    [{:card_id cid
                                       :dimension_mappings mappings
                                       :explore_filters    [{:field_ref ["field" {:temporal-unit :month} created-at]
                                                             :value     "2020-01-01T00:00:00Z"}]}]
                         :dimensions [{:dimension_id "d1" :display_name "Created At"
                                       :effective_type "type/DateTimeWithLocalTZ"}]}
                        "d1")
            ctx        (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                      :page_id page-id :params {}})
            q          (lib/query (mt/metadata-provider) (:dataset_query (:card ctx)))
            lhs        (get (first (lib/filters q)) 2)]
        (is (= :month (lib/raw-temporal-bucket lhs))
            "click ref's :month bucket is applied to the explore filter target")))))

(deftest build-row-context-applies-temporal-pattern-bucket-filter-test
  (testing "the temporal-pattern variants (day-of-week / hour-of-day) bucket the filter target too —"
    ;; These two are the cases the old `explore-filter-ref` special-cased off the page's
    ;; `query_type`. The bucket now rides on the click's own `:field_ref`, so a click on an
    ;; "Hour of day" bar must filter `hour(created_at) = 19`, not `created_at = 19` (which would
    ;; match nothing and silently render an empty chart).
    (doseq [[unit value] [[:day-of-week 3] [:hour-of-day 19]]]
      (testing (str "unit " unit)
        (mt/with-temp [:model/Card metric {:type :metric :dataset_query (orders-count-metric-query)}
                       :model/Exploration e {:name "x"}
                       :model/ExplorationThread t {:exploration_id (:id e)}]
          (let [cid        (:id metric)
                created-at (mt/id :orders :created_at)
                mappings   [{:dimension_id "d1" :table_id (mt/id :orders)
                             :target ["field" {} created-at]}]
                page-id    (insert-block-page-row!
                            (:id t) cid
                            {:metrics    [{:card_id cid
                                           :dimension_mappings mappings
                                           :explore_filters    [{:field_ref ["field" {:temporal-unit unit} created-at]
                                                                 :value     value}]}]
                             :dimensions [{:dimension_id "d1" :display_name "Created At"
                                           :effective_type "type/DateTimeWithLocalTZ"}]}
                            "d1")
                ctx        (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                          :page_id page-id :params {}})
                q          (lib/query (mt/metadata-provider) (:dataset_query (:card ctx)))
                lhs        (get (first (lib/filters q)) 2)]
            (is (= unit (lib/raw-temporal-bucket lhs))
                "the clicked bar's extraction unit is applied to the explore filter target")))))))

(deftest build-row-context-applies-binning-filter-test
  (testing "build-row-context applies the click ref's numeric binning to the explore filter target"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            price-id (mt/id :venues :price)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} price-id]}]
            page-id  (insert-block-page-row!
                      (:id t) cid
                      {:metrics    [{:card_id cid
                                     :dimension_mappings mappings
                                     :explore_filters    [{:field_ref ["field" {:binning {:strategy :default}} price-id]
                                                           :value     10}]}]
                       :dimensions [{:dimension_id "d1" :display_name "Price"
                                     :effective_type "type/Number"}]}
                      "d1")
            ctx      (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                    :page_id page-id :params {}})
            q        (lib/query (mt/metadata-provider) (:dataset_query (:card ctx)))
            lhs      (get (first (lib/filters q)) 2)]
        (is (= :default (:strategy (lib/binning lhs)))
            "click ref's default binning is applied to the explore filter target")))))

(deftest enrich-explore-filters-disambiguates-same-named-dimensions-test
  (testing "enrich-explore-filters qualifies ambiguous explore-filter dimension_names with the dim's group"
    ;; Block snapshots don't carry :group — it lives on the metric Card's :dimensions. When two
    ;; block dims share a display_name, explore-filter labels should mirror query :dimension_name
    ;; disambiguation (e.g. \"Users → Created At\"), not fall back to the bare name or the raw
    ;; column display name.
    (with-redefs [card/*syncing-metric-dimensions* true]
      (let [users-created  "00000000-0000-0000-0000-00000000aaaa"
            orders-created "00000000-0000-0000-0000-00000000bbbb"
            users-field    (mt/id :venues :latitude)
            orders-field   (mt/id :venues :longitude)]
        (mt/with-temp
          [:model/User u {:email "enrich-filter-ambig@example.com"}
           :model/Card metric (assoc {:type          :metric
                                      :creator_id    (:id u)
                                      :dataset_query (count-metric-query)}
                                     :dimensions
                                     [{:id users-created  :name "LATITUDE"  :display_name "Created At"
                                       :group {:id "g-users"  :type "main"       :display_name "Users"}}
                                      {:id orders-created :name "LONGITUDE" :display_name "Created At"
                                       :group {:id "g-orders" :type "connection" :display_name "Orders"}}])]
          (let [mp              (lib-be/application-database-metadata-provider (mt/id))
                block           {:dimensions [{:dimension_id users-created  :display_name "Created At"}
                                              {:dimension_id orders-created :display_name "Created At"}]}
                metric-selection {:dimension_mappings [{:dimension_id users-created  :table_id (mt/id :venues)
                                                        :target ["field" {} users-field]}
                                                       {:dimension_id orders-created :table_id (mt/id :venues)
                                                        :target ["field" {} orders-field]}]}
                filter          {:field_ref ["field" {} users-field] :value 40.7}
                [enriched]      (qp.context/enrich-explore-filters mp metric block metric-selection [filter])]
            (is (= "Users → Created At" (:dimension_name enriched))
                "the clicked filter is labeled with the dim's group when the display_name is shared")))))))

;;; ---------------------------------------------------------------------------
;;; build-row-context — "Explore further" filter edge cases
;;; ---------------------------------------------------------------------------

(deftest build-row-context-fails-closed-on-unresolvable-explore-filter-test
  (testing "build-row-context throws when an :explore_filters entry names a field the metric query can't resolve"
    ;; The row's own dimension d1 resolves; the *filter*'s field_ref points at a column that isn't
    ;; on the metric query, so the filter can't be applied. Fail closed — the runner catches and
    ;; records a row-level error — rather than render an unfiltered chart the block title still
    ;; prefixes with the clicked segment.
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            page-id  (insert-block-page-row!
                      (:id t) cid
                      {:metrics    [{:card_id cid
                                     :dimension_mappings mappings
                                     ;; a column from another table — not resolvable on this query
                                     :explore_filters    [{:field_ref ["field" {} (mt/id :orders :total)]
                                                           :value     10}]}]
                       :dimensions [{:dimension_id "d1" :display_name "Name"
                                     :effective_type "type/Text"}]}
                      "d1")]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Could not resolve explore filter field ref"
             (qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                            :page_id page-id :params {}})))))))

(deftest build-row-context-exposes-explore-filters-as-cache-key-material-test
  (testing "the ctx exposes stable :explore-filters for the discovery cache key —"
    (testing "it repeats across rebuilds, while the reconstructed dataset_query hash does not"
      ;; `qp.variants/cached-discovery` keys on `:explore-filters` so two threads sharing a
      ;; (card, dim, k) but scoped to different segments don't share top-N results. It can't key on
      ;; the filtered `:dataset_query`: that's rebuilt per row via `lib/=`, minting fresh
      ;; `:lib/uuid`s, so its hash differs every call and the cache would never hit.
      (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                     :model/Exploration e {:name "x"}
                     :model/ExplorationThread t {:exploration_id (:id e)}]
        (let [cid      (:id metric)
              filters  [{:field_ref ["field" {} (mt/id :venues :name)] :value "foo"}]
              mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                         :target ["field" {} (mt/id :venues :name)]}]
              page-id  (insert-block-page-row!
                        (:id t) cid
                        {:metrics    [{:card_id cid
                                       :dimension_mappings mappings
                                       :explore_filters    filters}]
                         :dimensions [{:dimension_id "d1" :display_name "Name"
                                       :effective_type "type/Text"}]}
                        "d1")
              build!   #(qp.context/build-row-context {:card_id cid :dimension_id "d1"
                                                       :page_id page-id :params {}})
              c1       (build!)
              c2       (build!)]
          (is (= filters (:explore-filters c1))
              "the filter chain is exposed on the ctx")
          (is (= (:explore-filters c1) (:explore-filters c2))
              "explore-filters is identical across rebuilds — a usable cache key")
          (is (not= (hash (:dataset_query (:card c1)))
                    (hash (:dataset_query (:card c2))))
              "the filtered dataset_query hash differs per rebuild (fresh :lib/uuids) — why it can't be the key"))))))
