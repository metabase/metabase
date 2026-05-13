(ns metabase.explorations.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.groups :as explorations.groups]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- do-with-sample-metrics-archived
  "Temporarily archive any metric cards belonging to the sample database so they
   don't interfere with test assertions. Restores them after `thunk` completes."
  [thunk]
  (let [sample-db-id   (t2/select-one-pk :model/Database :is_sample true)
        metric-ids     (when sample-db-id
                         (t2/select-pks-vec :model/Card
                                            :type :metric
                                            :archived false
                                            :database_id sample-db-id))]
    (if (seq metric-ids)
      (try
        (t2/query {:update :report_card
                   :set    {:archived true}
                   :where  [:in :id metric-ids]})
        (thunk)
        (finally
          (t2/query {:update :report_card
                     :set    {:archived false}
                     :where  [:in :id metric-ids]})))
      (thunk))))

(defmacro with-sample-metrics-archived
  "Execute `body` with any sample-database metric cards temporarily archived."
  [& body]
  `(do-with-sample-metrics-archived (fn [] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    GET /api/exploration/dimensions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimensions-returns-hydrated-metrics-test
  (testing "GET /api/exploration/dimensions returns metrics referencing dimensions by id"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Alpha Metric"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _m2 {:name          "Beta Metric"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions")
              metrics  (:metrics response)
              groups   (:dimension_groups response)
              dim-ids  (set (mapcat #(map :id (:dimensions %)) groups))]
          (is (= 2 (count metrics)))
          (is (every? #(contains? % :dimension_ids) metrics))
          (is (every? #(not (contains? % :dimensions)) metrics))
          (is (every? #(contains? % :dimension_mappings) metrics))
          (testing "every group has a name and a non-empty dimension list"
            (is (every? :name groups))
            (is (every? #(seq (:dimensions %)) groups)))
          (testing "every metric's dimension_ids appear in some group"
            (doseq [m metrics]
              (is (every? #(contains? dim-ids %) (:dimension_ids m))))))))))

(deftest dimensions-search-by-name-test
  (testing "GET /api/exploration/dimensions filters case-insensitively by metric name"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Revenue"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _m2 {:name          "Order Count"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions" :q "reven")]
          (is (= 1 (count (:metrics response))))
          (is (= "Revenue" (:name (first (:metrics response))))))))))

(deftest dimensions-search-by-dimension-display-name-test
  (testing "GET /api/exploration/dimensions matches metrics whose dimension display-name contains q"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card metric {:name          "Sales"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [hydrated (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
              dim-name (some-> hydrated :dimensions first :display_name)]
          (is (some? dim-name) "metric should have at least one hydrated dimension with a display_name")
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions"
                                               :q (subs dim-name 0 (min 3 (count dim-name))))]
            (is (some #(= (:id metric) (:id %)) (:metrics response))
                "metric should be returned because a dimension display-name matched")))))))

(deftest dimensions-search-no-match-test
  (testing "GET /api/exploration/dimensions returns empty lists when nothing matches"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m {:name          "Hello"
                                     :type          :metric
                                     :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions"
                                             :q "zzz_no_such_thing_zzz")]
          (is (= [] (:metrics response)))
          (is (= [] (:dimension_groups response))))))))

(deftest dimensions-respects-collection-perms-test
  (testing "GET /api/exploration/dimensions excludes metrics in collections the user can't read"
    (with-sample-metrics-archived
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/Card _hidden {:name          "Hidden Metric"
                                            :type          :metric
                                            :collection_id (:id collection)
                                            :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions")]
            (is (not-any? #(= "Hidden Metric" (:name %)) (:metrics response)))))))))

(defn- valid-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})})

(deftest exploration-create-persists-everything-and-runs-test
  (testing "POST / creates an exploration with one thread, persists selections, and materializes queries"
    (mt/with-temp [:model/User u {:email "create@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [body {:name         "Why is revenue down"
                  :description  "Q3 dip"
                  :prompt       "break down by region"
                  :metrics      [{:card_id (:id metric)
                                  :dimension_mappings [{:dimension_id "d1"
                                                        :table_id (mt/id :venues)
                                                        :target ["field" {} (mt/id :venues :price)]}]}]
                  :dimensions   [{:dimension_id "d1" :display_name "Price"
                                  :effective_type "type/Number"}]
                  :timeline_ids [(:id tl)]}
            resp (mt/user-http-request u :post 200 "exploration" body)
            thread (-> resp :threads first)
            q      (-> thread :queries first)]
        (is (= "Why is revenue down" (:name resp)))
        (is (= 1 (count (:threads resp))))
        (is (= "break down by region" (:prompt thread)))
        (is (some? (:started_at thread)))
        (is (= 1 (count (:metrics thread))))
        (is (= 1 (count (:dimensions thread))))
        (is (= 1 (count (:timelines thread))))
        (is (= 1 (count (:queries thread))))
        (is (= "d1" (:dimension_id q)))
        (is (= "pending" (:status q)))
        (let [mp  (lib-be/application-database-metadata-provider (mt/id))
              qry (lib/query mp (:dataset_query q))
              brk (first (lib/breakouts qry))]
          (is (= 1 (count (lib/breakouts qry)))
              "snapshot MBQL adds a breakout from the dimension's target")
          (is (= :default (:strategy (lib/binning brk)))
              "numeric dim with a usable fingerprint picks up default auto-binning"))))))

(deftest exploration-create-applies-default-binning-test
  (testing "POST / picks a sensible default temporal bucket / numeric binning per dim type"
    (mt/with-temp [:model/User u {:email "binning@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [tbl-id  (mt/id :venues)
            ;; Real venues field IDs; numeric/coordinate cases need fingerprinted Fields, the
            ;; temporal cases don't read fingerprints so any field works.
            id-fid  (mt/id :venues :id)
            num-fid (mt/id :venues :price)
            lat-fid (mt/id :venues :latitude)
            txt-fid (mt/id :venues :name)
            body    {:name    "binning"
                     :metrics [{:card_id (:id metric)
                                :dimension_mappings [{:dimension_id "dt"  :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id "d"   :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id "t"   :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id "n"   :table_id tbl-id :target ["field" {} num-fid]}
                                                     {:dimension_id "lat" :table_id tbl-id :target ["field" {} lat-fid]}
                                                     {:dimension_id "s"   :table_id tbl-id :target ["field" {} txt-fid]}]}]
                     :dimensions [{:dimension_id "dt"  :effective_type "type/DateTime"}
                                  {:dimension_id "d"   :effective_type "type/Date"}
                                  {:dimension_id "t"   :effective_type "type/Time"}
                                  {:dimension_id "n"   :effective_type "type/Number"}
                                  {:dimension_id "lat" :effective_type "type/Float" :semantic_type "type/Latitude"}
                                  {:dimension_id "s"   :effective_type "type/Text"}]}
            resp    (mt/user-http-request u :post 200 "exploration" body)
            mp      (lib-be/application-database-metadata-provider (mt/id))
            by-dim  (into {} (for [q (-> resp :threads first :queries)]
                               [(:dimension_id q) (->> (:dataset_query q)
                                                       (lib/query mp)
                                                       lib/breakouts
                                                       first)]))]
        (testing "DateTime dim → :month bucket"
          (is (= :month (lib/raw-temporal-bucket (get by-dim "dt"))))
          (is (nil? (lib/binning (get by-dim "dt")))))
        (testing "Date dim → :day bucket"
          (is (= :day (lib/raw-temporal-bucket (get by-dim "d")))))
        (testing "Time dim → :hour bucket"
          (is (= :hour (lib/raw-temporal-bucket (get by-dim "t")))))
        (testing "Number dim with a fingerprinted field → default auto-binning"
          (is (= :default (:strategy (lib/binning (get by-dim "n")))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim "n")))))
        (testing "Coordinate (semantic Latitude over Float) with a fingerprinted field → default auto-binning"
          (is (= :default (:strategy (lib/binning (get by-dim "lat"))))))
        (testing "Non-numeric / non-temporal dim → no bucket"
          (is (nil? (lib/binning (get by-dim "s"))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim "s")))))))))

(deftest exploration-create-skips-binning-when-fingerprint-missing-test
  (testing "POST / skips default numeric binning when the underlying Field has no min/max fingerprint"
    (mt/with-temp [:model/User u {:email "no-fp@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [field-id (mt/id :venues :price)]
        ;; Null the fingerprint to simulate a fresh-synced / native-result / all-null field.
        (mt/with-temp-vals-in-db :model/Field field-id {:fingerprint nil}
          (let [body {:name    "no fp"
                      :metrics [{:card_id (:id metric)
                                 :dimension_mappings [{:dimension_id "n"
                                                       :table_id (mt/id :venues)
                                                       :target ["field" {} field-id]}]}]
                      :dimensions [{:dimension_id "n" :effective_type "type/Number"}]}
                resp (mt/user-http-request u :post 200 "exploration" body)
                q    (-> resp :threads first :queries first)
                mp   (lib-be/application-database-metadata-provider (mt/id))
                qry  (lib/query mp (:dataset_query q))
                brk  (first (lib/breakouts qry))]
            (is (= 1 (count (lib/breakouts qry)))
                "the chosen dim still produces a breakout")
            (is (nil? (lib/binning brk))
                "no binning option is attached when the fingerprint can't supply min/max")
            (testing "the resulting query runs successfully through the QP (the original failure path)"
              (is (= :completed
                     (-> qry qp/userland-query qp/process-query :status))))))))))

(deftest exploration-create-strips-metric-default-breakout-test
  (testing "POST / drops the metric's default temporal breakout so only the chosen dim remains"
    (mt/with-temp [:model/User u {:email "strip@example.com"}
                   :model/Card metric {:type          :metric
                                       :creator_id    (:id u)
                                       :dataset_query {:database 1
                                                       :type     :query
                                                       :query    {:source-table 1
                                                                  :aggregation  [[:count]]
                                                                  :breakout     [[:field 2 {:temporal-unit :month}]]}}}]
      (let [body {:name       "no time pls"
                  :metrics    [{:card_id            (:id metric)
                                :dimension_mappings [{:dimension_id "d1"
                                                      :table_id     1
                                                      :target       ["field" {} 1]}]}]
                  :dimensions [{:dimension_id "d1" :display_name "Region"}]}
            resp (mt/user-http-request u :post 200 "exploration" body)
            q    (-> resp :threads first :queries first)
            mp   (lib-be/application-database-metadata-provider 1)
            qry  (lib/query mp (:dataset_query q))
            bos  (lib/breakouts qry)
            ids  (set (filter int? (tree-seq coll? seq (first bos))))]
        (is (= 1 (count bos))
            "metric's default temporal breakout is stripped before the chosen one is added")
        (is (contains? ids 1)
            "the surviving breakout points at the chosen dim's target (field 1)")
        (is (not (contains? ids 2))
            "the metric's original temporal breakout (field 2) is gone")))))

(deftest exploration-create-materializes-metric-x-dimension-matrix-test
  (testing "POST / creates one ExplorationQuery per (metric, dimension) pair"
    (mt/with-temp [:model/User u {:email "matrix@example.com"}
                   :model/Card m1 (valid-metric-card (:id u))
                   :model/Card m2 (valid-metric-card (:id u))]
      (let [mapping  [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}
                      {:dimension_id "d2" :table_id 1 :target ["field" {} 2]}]
            body     {:name "matrix"
                      :metrics [{:card_id (:id m1) :dimension_mappings mapping}
                                {:card_id (:id m2) :dimension_mappings mapping}]
                      :dimensions [{:dimension_id "d1"}
                                   {:dimension_id "d2"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)]
        (is (= 4 (count queries)) "2 metrics × 2 dimensions = 4 queries")
        (is (= #{[(:id m1) "d1"] [(:id m1) "d2"]
                 [(:id m2) "d1"] [(:id m2) "d2"]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (every? #(= "pending" (:status %)) queries))))))

(defn- venues-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})})

(defn- venues-dimension-mappings []
  [{:dimension_id "category" :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
   {:dimension_id "price"    :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}])

(defn- segment-filters
  "Extract :segment filter clauses (as `[:segment {} <id>]`) from a snapshot dataset_query at stage 0."
  [dataset-query]
  (let [mp  (lib-be/application-database-metadata-provider (mt/id))
        qry (lib/query mp dataset-query)]
    (filter (fn [f] (= :segment (first f))) (or (lib/filters qry) []))))

(deftest exploration-create-fans-out-applicable-segments-test
  (testing "POST / produces base + one extra row per Segment whose table_id matches the metric's source-table"
    (mt/with-temp [:model/User u {:email "segments@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Segment internal {:name       "internal"
                                            :table_id   (mt/id :venues)
                                            :definition (mt/mbql-query venues {:filter [:= $price 1]})}
                   :model/Segment premium  {:name       "premium"
                                            :table_id   (mt/id :venues)
                                            :definition (mt/mbql-query venues {:filter [:= $price 4]})}]
      (let [body    {:name       "fan-out"
                     :metrics    [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                     :dimensions [{:dimension_id "category" :display_name "Category"}
                                  {:dimension_id "price"    :display_name "Price"}]}
            resp    (mt/user-http-request u :post 200 "exploration" body)
            queries (-> resp :threads first :queries)
            base    (filter #(nil? (:segment_id %)) queries)
            segged  (remove #(nil? (:segment_id %)) queries)]
        (is (= 6 (count queries)) "2 dimensions × (1 base + 2 segments) = 6 queries")
        (is (= 2 (count base)))
        (is (= 4 (count segged)))
        (is (= #{(:id internal) (:id premium)}
               (set (map :segment_id segged))))
        (testing "every segmented query carries a :segment filter clause"
          (is (every? #(seq (segment-filters (:dataset_query %))) segged)))
        (testing "the unsegmented base rows have no :segment filter"
          (is (every? #(empty? (segment-filters (:dataset_query %))) base)))
        (testing "segmented row name includes the segment name"
          (let [segged-by-id (group-by :segment_id segged)
                a-internal   (some #(when (= "category" (:dimension_id %)) %)
                                   (get segged-by-id (:id internal)))]
            (is (= "Revenue by Category (internal)" (:name a-internal)))))))))

(deftest exploration-create-skips-segments-on-other-tables-test
  (testing "Segments whose table_id doesn't match the metric's source-table are not applied"
    (mt/with-temp [:model/User u {:email "seg-scope@example.com"}
                   :model/Card metric (venues-metric-card (:id u))
                   :model/Segment _other {:name       "users-only"
                                          :table_id   (mt/id :users)
                                          :definition (mt/mbql-query users {:filter [:not-null $id]})}]
      (let [body    {:name       "scope"
                     :metrics    [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                     :dimensions [{:dimension_id "category"} {:dimension_id "price"}]}
            resp    (mt/user-http-request u :post 200 "exploration" body)
            queries (-> resp :threads first :queries)]
        (is (= 2 (count queries))
            "venues metric × 2 dims; the users-table segment doesn't apply, so no fan-out")
        (is (every? #(nil? (:segment_id %)) queries))))))

(deftest exploration-create-without-selections-test
  (testing "POST / works without metrics/dimensions/timelines (drafty exploration)"
    (mt/with-temp [:model/User u {:email "empty@example.com"}]
      (let [resp (mt/user-http-request u :post 200 "exploration" {:name "empty"})]
        (is (= 1 (count (:threads resp))))
        (is (zero? (count (-> resp :threads first :metrics))))
        (is (zero? (count (-> resp :threads first :queries))))))))

(deftest exploration-get-permissions-test
  (testing "Only the creator (or a superuser) can GET an exploration"
    (mt/with-temp [:model/User owner {:email "p-owner@example.com"}
                   :model/User other {:email "p-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration" {:name "private"})]
        (mt/user-http-request other :get 403 (format "exploration/%d" eid))
        (let [resp (mt/user-http-request owner :get 200 (format "exploration/%d" eid))]
          (is (= eid (:id resp))))))))

(deftest exploration-create-skips-pairs-without-mapping-test
  (testing "POST / drops (metric, dimension) pairs where the metric has no mapping for the dimension"
    (mt/with-temp [:model/User u {:email "applicability@example.com"}
                   :model/Card revenue (valid-metric-card (:id u))
                   :model/Card signups (valid-metric-card (:id u))]
      (let [body {:name "applicability"
                  :metrics [{:card_id (:id revenue)
                             :dimension_mappings [{:dimension_id "plan"   :table_id 1 :target ["field" {} 1]}]}
                            {:card_id (:id signups)
                             :dimension_mappings [{:dimension_id "plan"   :table_id 1 :target ["field" {} 2]}
                                                  {:dimension_id "channel" :table_id 1 :target ["field" {} 3]}]}]
                  :dimensions [{:dimension_id "plan"} {:dimension_id "channel"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)]
        (is (= 3 (count queries))
            "revenue×plan, signups×plan, signups×channel — revenue×channel is dropped")
        (is (= #{[(:id revenue) "plan"]
                 [(:id signups) "plan"]
                 [(:id signups) "channel"]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (= [0 1 2] (sort (map :position queries)))
            "positions are sequential with no gaps from filtered pairs")))))

(deftest exploration-create-names-queries-by-metric-and-dimension-test
  (testing "POST / sets each query's name to '{metric} by {dimension}' using the dimension's display_name"
    (mt/with-temp [:model/User u {:email "naming@example.com"}
                   :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")]
      (let [body {:name "naming"
                  :metrics    [{:card_id (:id revenue)
                                :dimension_mappings [{:dimension_id "country" :table_id 1 :target ["field" {} 1]}
                                                     {:dimension_id "no-name" :table_id 1 :target ["field" {} 2]}]}]
                  :dimensions [{:dimension_id "country" :display_name "Country"}
                               {:dimension_id "no-name"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)
            by-dim   (into {} (map (juxt :dimension_id :name) queries))]
        (is (= "Revenue by Country" (get by-dim "country"))
            "uses the metric Card name and the dimension's display_name")
        (is (= "Revenue by no-name" (get by-dim "no-name"))
            "falls back to dimension_id when display_name is absent")))))

(deftest exploration-create-disambiguates-same-named-dimensions-test
  (testing "POST / qualifies same-named dimensions with their group's display name"
    (mt/with-temp
      [:model/User u {:email "ambig@example.com"}
       :model/Card revenue (assoc (valid-metric-card (:id u))
                                  :name "Revenue"
                                  :dimensions
                                  [{:id "users-created"  :name "CREATED_AT" :display_name "Created At"
                                    :group {:id "g-users"  :type "main"       :display_name "Users"}}
                                   {:id "orders-created" :name "CREATED_AT" :display_name "Created At"
                                    :group {:id "g-orders" :type "connection" :display_name "Orders"}}
                                   {:id "users-country"  :name "COUNTRY"    :display_name "Country"
                                    :group {:id "g-users"  :type "main"       :display_name "Users"}}])]
      (testing "two dims sharing a display_name → both names get the group prefix"
        (let [body {:name "ambig"
                    :metrics    [{:card_id (:id revenue)
                                  :dimension_mappings
                                  [{:dimension_id "users-created"  :table_id 1 :target ["field" {} 1]}
                                   {:dimension_id "orders-created" :table_id 1 :target ["field" {} 2]}]}]
                    :dimensions [{:dimension_id "users-created"  :display_name "Created At"}
                                 {:dimension_id "orders-created" :display_name "Created At"}]}
              by-dim (->> (mt/user-http-request u :post 200 "exploration" body)
                          :threads first :queries
                          (into {} (map (juxt :dimension_id :name))))]
          (is (= "Revenue by Users → Created At"  (get by-dim "users-created")))
          (is (= "Revenue by Orders → Created At" (get by-dim "orders-created")))))
      (testing "distinct display_names → no qualification"
        (let [body {:name "no-ambig"
                    :metrics    [{:card_id (:id revenue)
                                  :dimension_mappings
                                  [{:dimension_id "users-created" :table_id 1 :target ["field" {} 1]}
                                   {:dimension_id "users-country" :table_id 1 :target ["field" {} 3]}]}]
                    :dimensions [{:dimension_id "users-created" :display_name "Created At"}
                                 {:dimension_id "users-country" :display_name "Country"}]}
              by-dim (->> (mt/user-http-request u :post 200 "exploration" body)
                          :threads first :queries
                          (into {} (map (juxt :dimension_id :name))))]
          (is (= "Revenue by Created At" (get by-dim "users-created")))
          (is (= "Revenue by Country"    (get by-dim "users-country")))))
      (testing "single dim → no qualification even when it has a group"
        (let [body {:name "single"
                    :metrics    [{:card_id (:id revenue)
                                  :dimension_mappings
                                  [{:dimension_id "users-created" :table_id 1 :target ["field" {} 1]}]}]
                    :dimensions [{:dimension_id "users-created" :display_name "Created At"}]}
              q    (-> (mt/user-http-request u :post 200 "exploration" body)
                       :threads first :queries first)]
          (is (= "Revenue by Created At" (:name q))))))))

(deftest exploration-create-name-falls-back-without-group-test
  (testing "POST / leaves ambiguous dims unqualified when neither has a known :group (no NPE / no malformed name)"
    (mt/with-temp
      [:model/User u {:email "no-group@example.com"}
       ;; `:dimensions` left absent (nil) — represents pre-existing Cards without computed groups.
       :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")]
      (let [body {:name "no-group"
                  :metrics    [{:card_id (:id revenue)
                                :dimension_mappings
                                [{:dimension_id "a" :table_id 1 :target ["field" {} 1]}
                                 {:dimension_id "b" :table_id 1 :target ["field" {} 2]}]}]
                  :dimensions [{:dimension_id "a" :display_name "Created At"}
                               {:dimension_id "b" :display_name "Created At"}]}
            queries (-> (mt/user-http-request u :post 200 "exploration" body)
                        :threads first :queries)]
        (is (every? #(= "Revenue by Created At" (:name %)) queries)
            "falls back to plain display_name when no :group is available")))))

(deftest exploration-list-queries-endpoint-test
  (testing "GET /:id/queries returns lightweight summaries without dataset_query"
    (mt/with-temp [:model/User u {:email "list@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "list"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid       (:id resp)
            summaries (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid))]
        (is (= 1 (count summaries)))
        (let [s (first summaries)]
          (is (contains? s :status))
          (is (= "pending" (:status s)))
          (is (contains? s :position))
          (is (not (contains? s :dataset_query)) "dataset_query must not leak")
          (is (not (contains? s :result_data)) "result blob must not leak")
          (is (contains? s :interestingness_score) "score is included via the result-table left-join")
          (is (nil? (:interestingness_score s)) "pending queries have no result row, hence nil score")
          (is (contains? s :contextual_interestingness_score)
              "contextual score is included via the result-table left-join")
          (is (nil? (:contextual_interestingness_score s))
              "pending queries have no result row, hence nil contextual score"))))))

(deftest exploration-list-queries-includes-score-from-result-test
  (testing "GET /:id/queries surfaces both interestingness scores via the result-table left-join"
    (mt/with-temp [:model/User u {:email "score-list@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "score-list"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid (:id resp)
            qid (-> resp :threads first :queries first :id)]
        (t2/insert! :model/ExplorationQueryResult
                    {:exploration_query_id             qid
                     :result_data                      (byte-array [0])
                     :interestingness_score            0.42
                     :contextual_interestingness_score 0.83})
        (let [s (-> (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid)) first)]
          (is (= 0.42 (:interestingness_score s)))
          (is (= 0.83 (:contextual_interestingness_score s))))))))

(deftest exploration-get-includes-interestingness-on-queries-test
  (testing "GET /:id hydrates user_interestingness and both interestingness scores on each nested query"
    (mt/with-temp [:model/User u {:email "get-score@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "get-score"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid (:id resp)
            qid (-> resp :threads first :queries first :id)
            fetch-query (fn []
                          (-> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                              :threads first :queries first))]
        (testing "fresh query: scores nil (no result row), user_interestingness nil"
          (let [q (fetch-query)]
            (is (contains? q :interestingness_score))
            (is (nil? (:interestingness_score q)))
            (is (contains? q :contextual_interestingness_score))
            (is (nil? (:contextual_interestingness_score q)))
            (is (contains? q :user_interestingness))
            (is (nil? (:user_interestingness q)))))
        (testing "after a result row is inserted, both scores surface via hydration"
          (t2/insert! :model/ExplorationQueryResult
                      {:exploration_query_id             qid
                       :result_data                      (byte-array [0])
                       :interestingness_score            0.42
                       :contextual_interestingness_score 0.83})
          (let [q (fetch-query)]
            (is (= 0.42 (:interestingness_score q)))
            (is (= 0.83 (:contextual_interestingness_score q)))))
        (testing "user_interestingness on the query column round-trips through GET /:id"
          (mt/user-http-request u :put 200 (format "exploration/query/%d/interesting" qid)
                                {:user_interestingness 1})
          (is (= 1 (:user_interestingness (fetch-query)))))))))

(deftest exploration-list-queries-permissions-test
  (testing "GET /:id/queries enforces the same read-check as the parent exploration"
    (mt/with-temp [:model/User owner {:email "lq-owner@example.com"}
                   :model/User other {:email "lq-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration" {:name "lq-private"})]
        (mt/user-http-request other :get 403 (format "exploration/%d/queries" eid))))))

(defn- store-fake-result!
  "Insert an ExplorationQueryResult that mirrors the worker's serialization format so the
  result endpoint can replay it."
  [query-id qp-result]
  (let [bytes (cache.impl/do-with-serialization
               (fn [in result-fn]
                 (in qp-result)
                 (result-fn)))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :result_data          bytes})))

(defn- mark-done! [query-id]
  (t2/update! :model/ExplorationQuery query-id {:status "done"}))

(deftest exploration-query-result-streams-stored-result-test
  (testing "GET /query/:id streams the stored worker result as JSON"
    (mt/with-temp [:model/User u {:email "result@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp     (mt/user-http-request u :post 200 "exploration"
                                           {:name "result"
                                            :metrics [{:card_id (:id metric)
                                                       :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                            :dimensions [{:dimension_id "d1"}]})
            qid      (-> resp :threads first :queries first :id)
            qp-out   {:status :completed
                      :data   {:cols [{:name "x"} {:name "y"}]
                               :rows [["a" 1] ["b" 2]]}
                      :row_count 2}]
        (store-fake-result! qid qp-out)
        (mark-done! qid)
        (let [body (mt/user-http-request u :get 202 (format "exploration/query/%d" qid))]
          (is (= [["a" 1] ["b" 2]] (-> body :data :rows))
              "rows from the stored qp-result are streamed back")
          (is (= [{:name "x"} {:name "y"}] (-> body :data :cols))
              "cols metadata round-trips through the streaming rff"))))))

(deftest exploration-query-result-409-when-not-done-test
  (testing "GET /query/:id returns 409 with status info while the query is still pending"
    (mt/with-temp [:model/User u {:email "pending@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "pending"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)
            body (mt/user-http-request u :get 409 (format "exploration/query/%d" qid))]
        (is (= "pending" (:status body)))
        (is (= qid (:id body)))))))

(deftest exploration-query-result-permissions-test
  (testing "GET /query/:id enforces the parent exploration's read check"
    (mt/with-temp [:model/User owner {:email "qr-owner@example.com"}
                   :model/User other {:email "qr-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (mt/user-http-request owner :post 200 "exploration"
                                       {:name "qr-private"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request other :get 403 (format "exploration/query/%d" qid))))))

(deftest exploration-static-card-card-shaped-response-test
  (testing "GET /query/:id/static-card returns a card-shaped envelope with display, viz_settings, and dataset rows"
    (mt/with-temp [:model/User u {:email "static-card@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp   (mt/user-http-request u :post 200 "exploration"
                                         {:name "static"
                                          :metrics [{:card_id (:id metric)
                                                     :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                          :dimensions [{:dimension_id "d1"}]})
            qid    (-> resp :threads first :queries first :id)
            qp-out {:status :completed
                    :data   {:cols [{:name "x" :source :breakout}
                                    {:name "y" :source :aggregation}]
                             :rows [["a" 3] ["b" 1] ["c" 2]]}
                    :row_count 3}]
        (store-fake-result! qid qp-out)
        (mark-done! qid)
        (t2/update! :model/ExplorationQueryResult :exploration_query_id qid
                    {:display                :bar
                     :visualization_settings {:graph.x_axis.title_text "X"}})
        (let [body (mt/user-http-request u :get 200 (format "exploration/query/%d/static-card" qid))]
          (is (= "bar" (-> body :card :display))
              "display from exploration_query_result is returned")
          (is (= {:graph.x_axis.title_text "X"}
                 (-> body :card :visualization_settings))
              "visualization_settings from exploration_query_result is returned")
          (is (nil? (-> body :card :id))
              "card.id is nil — there's no real Card row")
          (is (= "completed" (-> body :dataset :status)))
          (is (= [["a" 3] ["b" 1] ["c" 2]] (-> body :dataset :data :rows))
              "rows come back in cached order when no sort param is supplied"))))))

(deftest exploration-static-card-sort-test
  (testing "GET /query/:id/static-card?sort=… re-orders rows in memory"
    (mt/with-temp [:model/User u {:email "static-sort@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp   (mt/user-http-request u :post 200 "exploration"
                                         {:name "sort"
                                          :metrics [{:card_id (:id metric)
                                                     :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                          :dimensions [{:dimension_id "d1"}]})
            qid    (-> resp :threads first :queries first :id)
            qp-out {:status :completed
                    :data   {:cols [{:name "label" :source :breakout}
                                    {:name "value" :source :aggregation}]
                             :rows [["a" 3] ["b" 1] ["c" 2]]}
                    :row_count 3}
            fetch  (fn [sort]
                     (-> (mt/user-http-request u :get 200
                                               (format "exploration/query/%d/static-card?sort=%s" qid sort))
                         :dataset :data :rows))]
        (store-fake-result! qid qp-out)
        (mark-done! qid)
        (is (= [["a" 3] ["c" 2] ["b" 1]] (fetch "value_desc")))
        (is (= [["b" 1] ["c" 2] ["a" 3]] (fetch "value_asc")))
        (is (= [["a" 3] ["b" 1] ["c" 2]] (fetch "label_asc")))
        (is (= [["c" 2] ["b" 1] ["a" 3]] (fetch "label_desc")))))))

(deftest exploration-static-card-409-when-not-done-test
  (testing "GET /query/:id/static-card returns 409 with status info while the query is still pending"
    (mt/with-temp [:model/User u {:email "static-pending@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "static-pending"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)
            body (mt/user-http-request u :get 409 (format "exploration/query/%d/static-card" qid))]
        (is (= "pending" (:status body)))
        (is (= qid (:id body)))))))

(deftest exploration-static-card-permissions-test
  (testing "GET /query/:id/static-card enforces the parent exploration's read check"
    (mt/with-temp [:model/User owner {:email "static-owner@example.com"}
                   :model/User other {:email "static-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (mt/user-http-request owner :post 200 "exploration"
                                       {:name "static-private"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request other :get 403 (format "exploration/query/%d/static-card" qid))))))

(deftest exploration-user-interestingness-roundtrip-test
  (testing "PUT /query/:id/interesting sets the rating; DELETE clears it; both reflected in /:id/queries"
    (mt/with-temp [:model/User u {:email "mark@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "mark"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid  (:id resp)
            qid  (-> resp :threads first :queries first :id)
            put! (fn [level]
                   (mt/user-http-request u :put 200 (format "exploration/query/%d/interesting" qid)
                                         {:user_interestingness level}))
            list-one (fn []
                       (first (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid))))]
        (testing "fresh query has nil rating"
          (is (nil? (:user_interestingness (list-one)))))
        (testing "PUT writes each of the three levels and the response reflects it"
          (doseq [level [0 1 2]]
            (let [marked (put! level)]
              (is (= level (:user_interestingness marked)))
              (is (= qid   (:id marked)))
              (is (= level (:user_interestingness (list-one)))
                  (format "summary list reflects level %d" level)))))
        (testing "PUT overwrites a prior rating (no idempotency carve-out)"
          (put! 2)
          (put! 0)
          (is (= 0 (:user_interestingness (list-one)))))
        (testing "DELETE clears user_interestingness"
          (let [cleared (mt/user-http-request u :delete 200 (format "exploration/query/%d/interesting" qid))]
            (is (nil? (:user_interestingness cleared)))
            (is (nil? (:user_interestingness (list-one))))))))))

(deftest exploration-user-interestingness-rejects-bad-levels-test
  (testing "PUT /query/:id/interesting rejects values outside {0,1,2}"
    (mt/with-temp [:model/User u {:email "mark-bad@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "bad"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request u :put 400 (format "exploration/query/%d/interesting" qid)
                              {:user_interestingness 3})
        (mt/user-http-request u :put 400 (format "exploration/query/%d/interesting" qid)
                              {:user_interestingness -1})
        (mt/user-http-request u :put 400 (format "exploration/query/%d/interesting" qid)
                              {})))))

(deftest exploration-user-interestingness-permissions-test
  (testing "PUT/DELETE /query/:id/interesting enforce write-check — non-owner gets 403"
    (mt/with-temp [:model/User owner {:email "mp-owner@example.com"}
                   :model/User other {:email "mp-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (mt/user-http-request owner :post 200 "exploration"
                                       {:name "mark-private"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request other :put 403 (format "exploration/query/%d/interesting" qid)
                              {:user_interestingness 2})
        (mt/user-http-request other :delete 403 (format "exploration/query/%d/interesting" qid))))))

(deftest exploration-user-interestingness-404-test
  (testing "PUT/DELETE on a nonexistent query id returns 404"
    (mt/with-temp [:model/User u {:email "mark-404@example.com"}]
      (mt/user-http-request u :put 404 "exploration/query/9999999/interesting"
                            {:user_interestingness 1})
      (mt/user-http-request u :delete 404 "exploration/query/9999999/interesting"))))

(deftest exploration-create-auto-creates-findings-document-test
  (testing "POST / auto-creates a 'Findings' document owned by the new exploration's thread"
    (mt/with-temp [:model/User u {:email "findings-auto@example.com"}]
      (let [resp (mt/user-http-request u :post 200 "exploration" {:name "x"})
            tid  (-> resp :threads first :id)
            docs (t2/select :model/Document :exploration_thread_id tid)]
        (is (= 1 (count docs)))
        (is (= "Findings" (:name (first docs))))
        (is (= (:id u) (:creator_id (first docs))))))))

(deftest exploration-documents-list-and-create-test
  (testing "GET/POST /thread/:thread-id/documents list and create empty documents with auto-named Findings"
    (mt/with-temp [:model/User u {:email "docs-api@example.com"}]
      (let [exp     (mt/user-http-request u :post 200 "exploration" {:name "doc host"})
            tid     (-> exp :threads first :id)
            url     (str "exploration/thread/" tid "/documents")
            initial (mt/user-http-request u :get 200 url)]
        (is (= ["Findings"] (mapv :name initial))
            "Listing returns the auto-created Findings doc")
        (let [d2 (mt/user-http-request u :post 200 url {})]
          (is (= "Findings 2" (:name d2)))
          (is (= tid (:exploration_thread_id d2)))
          (is (= {:type "doc" :content []} (:document (t2/select-one :model/Document :id (:id d2))))))
        (let [d3 (mt/user-http-request u :post 200 url {})]
          (is (= "Findings 3" (:name d3))))
        (let [after (mt/user-http-request u :get 200 url)]
          (is (= #{"Findings" "Findings 2" "Findings 3"} (set (map :name after)))))))))

(deftest exploration-documents-next-findings-name-skips-gaps-test
  (testing "Auto-naming picks max+1 even with gaps and ignores non-Findings docs"
    (mt/with-temp [:model/User u {:email "naming@example.com"}]
      (let [exp (mt/user-http-request u :post 200 "exploration" {:name "naming"})
            tid (-> exp :threads first :id)
            url (str "exploration/thread/" tid "/documents")]
        (t2/insert! :model/Document {:name "Findings 5"
                                     :document {:type "doc" :content []}
                                     :content_type "application/json+vnd.prose-mirror"
                                     :creator_id (:id u)
                                     :exploration_thread_id tid})
        (t2/insert! :model/Document {:name "Notes"
                                     :document {:type "doc" :content []}
                                     :content_type "application/json+vnd.prose-mirror"
                                     :creator_id (:id u)
                                     :exploration_thread_id tid})
        (is (= "Findings 6" (:name (mt/user-http-request u :post 200 url {}))))))))

(deftest exploration-documents-permissions-test
  (testing "Other users can't list or add documents on someone else's exploration thread"
    (mt/with-temp [:model/User owner {:email "doc-owner@example.com"}
                   :model/User other {:email "doc-other@example.com"}]
      (let [exp (mt/user-http-request owner :post 200 "exploration" {:name "private"})
            tid (-> exp :threads first :id)
            url (str "exploration/thread/" tid "/documents")]
        (mt/user-http-request other :get 403 url)
        (mt/user-http-request other :post 403 url {})))))

(deftest exploration-cascade-delete-test
  (testing "Deleting an exploration cascades to threads, selections, and queries"
    (mt/with-temp [:model/User u {:email "cd@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "cascade"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]
                                        :timeline_ids [(:id tl)]})
            eid  (:id resp)
            tid  (-> resp :threads first :id)]
        (t2/delete! :model/Exploration :id eid)
        (is (zero? (t2/count :model/ExplorationThread :exploration_id eid)))
        (is (zero? (t2/count :model/ExplorationThreadMetric :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadDimension :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id tid)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    auto-groups (pure fn)                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest auto-groups-emits-metric-and-leaf-levels-test
  (testing "Each distinct card_id produces a top-level 'sidebar' metric group; each (card_id, dimension_id) produces a leaf child"
    (let [groups (explorations.groups/auto-groups
                  [{:id 1 :card_id 10 :dimension_id "d1" :segment_id nil :name "Rev by D1"      :interestingness_score 0.5 :position 0}
                   {:id 2 :card_id 10 :dimension_id "d1" :segment_id 100 :name "Rev by D1 (S1)" :interestingness_score 0.7 :position 1}
                   {:id 3 :card_id 10 :dimension_id "d1" :segment_id 101 :name "Rev by D1 (S2)" :interestingness_score 0.3 :position 2}
                   {:id 4 :card_id 10 :dimension_id "d2" :segment_id nil :name "Rev by D2"      :interestingness_score 0.4 :position 3}
                   {:id 5 :card_id 20 :dimension_id "d1" :segment_id nil :name "Cnt by D1"      :interestingness_score 0.9 :position 4}]
                  {10 "Revenue" 20 "Count"})
          by-id  (into {} (map (juxt :id identity)) groups)]
      (is (= 5 (count groups)) "2 metric groups + 3 leaf (card, dim) groups")
      (is (= #{"auto:metric:10" "auto:metric:20" "auto:10:d1" "auto:10:d2" "auto:20:d1"}
             (set (map :id groups))))
      (testing "metric-level wrappers are 'sidebar' with empty :query_ids and nil parent"
        (is (= "sidebar" (:display_type (get by-id "auto:metric:10"))))
        (is (= "sidebar" (:display_type (get by-id "auto:metric:20"))))
        (is (every? #(= [] (:query_ids %))
                    [(get by-id "auto:metric:10") (get by-id "auto:metric:20")]))
        (is (every? #(nil? (:parent_group_id %))
                    [(get by-id "auto:metric:10") (get by-id "auto:metric:20")])))
      (testing "metric group :name comes from the card-names map"
        (is (= "Revenue" (:name (get by-id "auto:metric:10"))))
        (is (= "Count"   (:name (get by-id "auto:metric:20")))))
      (testing "leaves point at their metric via :parent_group_id"
        (is (= "auto:metric:10" (:parent_group_id (get by-id "auto:10:d1"))))
        (is (= "auto:metric:10" (:parent_group_id (get by-id "auto:10:d2"))))
        (is (= "auto:metric:20" (:parent_group_id (get by-id "auto:20:d1")))))
      (testing "leaf :display_type is 'page' for multi-query leaves, 'singleton' for solo"
        (is (= "page"      (:display_type (get by-id "auto:10:d1"))) "3 queries (base + 2 segments)")
        (is (= "singleton" (:display_type (get by-id "auto:10:d2"))) "1 query")
        (is (= "singleton" (:display_type (get by-id "auto:20:d1"))) "1 query"))
      (testing "leaf members enumerated in input/position order"
        (is (= [1 2 3] (:query_ids (get by-id "auto:10:d1"))))
        (is (= [4]     (:query_ids (get by-id "auto:10:d2"))))
        (is (= [5]     (:query_ids (get by-id "auto:20:d1")))))
      (testing "every group is type=auto"
        (is (every? #(= "auto" (:type %)) groups))))))

(deftest auto-groups-depth-first-positions-test
  (testing "Output order is depth-first (metric, its leaves, next metric, …); :position reifies the index"
    (let [groups (explorations.groups/auto-groups
                  [{:id 1 :card_id 10 :dimension_id "d1" :segment_id nil :name "Rev by D1" :interestingness_score 0.9}
                   {:id 2 :card_id 10 :dimension_id "d2" :segment_id nil :name "Rev by D2" :interestingness_score 0.4}
                   {:id 3 :card_id 20 :dimension_id "d1" :segment_id nil :name "Cnt by D1" :interestingness_score 0.8}]
                  {10 "Revenue" 20 "Count"})]
      (is (= ["auto:metric:10" "auto:10:d1" "auto:10:d2" "auto:metric:20" "auto:20:d1"]
             (mapv :id groups))
          "metric 10 (max 0.9) before metric 20 (max 0.8); each metric is immediately followed by its leaves, sorted within")
      (is (= [0 1 2 3 4] (mapv :position groups))
          ":position matches the position in the returned vector"))))

(deftest auto-groups-display-type-test
  (testing ":display_type reflects how the group should render"
    (testing "single query → 'sidebar' metric wrapper + 'singleton' leaf"
      (let [groups (explorations.groups/auto-groups
                    [{:id 1 :card_id 10 :dimension_id "d1" :segment_id nil :name "solo"}]
                    {10 "Solo metric"})]
        (is (= ["sidebar" "singleton"] (mapv :display_type groups)))))
    (testing "multiple queries sharing (card, dim) → 'sidebar' metric wrapper + 'page' leaf"
      (let [groups (explorations.groups/auto-groups
                    [{:id 1 :card_id 10 :dimension_id "d1" :segment_id nil :name "base"}
                     {:id 2 :card_id 10 :dimension_id "d1" :segment_id 100 :name "seg"}]
                    {10 "Multi"})]
        (is (= ["sidebar" "page"] (mapv :display_type groups)))))))

(deftest auto-groups-leaf-name-from-unsegmented-base-test
  (testing "Leaf group :name is taken from the unsegmented (segment_id=nil) base query; metric group :name comes from card-names"
    (let [groups (explorations.groups/auto-groups
                  [{:id 1 :card_id 10 :dimension_id "d1" :segment_id 100 :name "Rev by D1 (S1)"}
                   {:id 2 :card_id 10 :dimension_id "d1" :segment_id nil :name "Rev by D1"}
                   {:id 3 :card_id 10 :dimension_id "d1" :segment_id 101 :name "Rev by D1 (S2)"}]
                  {10 "Revenue"})
          [metric leaf] groups]
      (is (= 2 (count groups)))
      (is (= "Revenue"   (:name metric)) "metric name comes from the card-names map")
      (is (= "Rev by D1" (:name leaf))
          "even when base isn't first in the input, its name wins for the leaf"))))

(deftest auto-groups-sort-order-test
  (testing "Groups are ordered by max interestingness desc, applied independently at each level; nil-score groups sort last"
    (let [groups (explorations.groups/auto-groups
                  [;; card 10: one low-score query (0.2)
                   {:id 1 :card_id 10 :dimension_id "d1" :segment_id nil :name "10 low"  :interestingness_score 0.2}
                   ;; card 11: two leaves, max score 0.9 (best metric overall)
                   {:id 2 :card_id 11 :dimension_id "d1" :segment_id nil :name "11 high" :interestingness_score 0.9}
                   {:id 3 :card_id 11 :dimension_id "d2" :segment_id nil :name "11 mid"  :interestingness_score 0.4}
                   ;; card 12: only unscored queries
                   {:id 4 :card_id 12 :dimension_id "d1" :segment_id nil :name "12 none" :interestingness_score nil}]
                  {10 "Ten" 11 "Eleven" 12 "Twelve"})
          metric-names (->> groups (filter #(= "sidebar" (:display_type %))) (mapv :name))]
      (is (= ["Eleven" "Ten" "Twelve"] metric-names)
          "metric ordering uses max across all queries under the metric: 0.9 > 0.2 > nil")
      (testing "within metric 11, leaves sort by their own max score"
        (let [eleven-leaves (->> groups
                                 (filter #(= "auto:metric:11" (:parent_group_id %)))
                                 (mapv :name))]
          (is (= ["11 high" "11 mid"] eleven-leaves))))
      (is (= (vec (range (count groups))) (mapv :position groups))
          ":position reifies the depth-first sort order on the wire"))))

(deftest auto-groups-empty-input-test
  (testing "An empty input returns an empty vector (no nil)"
    (is (= [] (explorations.groups/auto-groups [] {})))
    (is (= [] (explorations.groups/auto-groups [] {10 "Unused"})))))

(deftest auto-groups-missing-card-name-test
  (testing "When a query's card_id isn't in card-names (e.g. archived Card), metric :name falls through to nil"
    (let [[metric] (explorations.groups/auto-groups
                    [{:id 1 :card_id 99 :dimension_id "d1" :segment_id nil :name "Q"}]
                    {})]
      (is (= "auto:metric:99" (:id metric)))
      (is (= "sidebar" (:display_type metric)))
      (is (nil? (:name metric))))))

(deftest exploration-get-includes-groups-test
  (testing "GET /:id attaches :groups to each thread, with one metric-level wrapper and (card, dim) leaves underneath"
    (mt/with-temp [:model/User u {:email "groups@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Segment _seg-a {:name "alpha"
                                          :table_id (mt/id :venues)
                                          :definition (mt/mbql-query venues {:filter [:= $price 1]})}
                   :model/Segment _seg-b {:name "beta"
                                          :table_id (mt/id :venues)
                                          :definition (mt/mbql-query venues {:filter [:= $price 4]})}]
      (let [body {:name "groups"
                  :metrics    [{:card_id (:id metric)
                                :dimension_mappings (venues-dimension-mappings)}]
                  :dimensions [{:dimension_id "category" :display_name "Category"}
                               {:dimension_id "price"    :display_name "Price"}]}
            {eid :id} (mt/user-http-request u :post 200 "exploration" body)
            resp      (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread    (-> resp :threads first)
            queries   (:queries thread)
            groups    (:groups thread)
            metric-groups (filter #(= "sidebar" (:display_type %)) groups)
            leaf-groups   (filter #(not= "sidebar" (:display_type %)) groups)]
        (is (= 6 (count queries)) "2 dimensions × (1 base + 2 segments) = 6 queries")
        (is (= 3 (count groups)) "1 metric wrapper + 2 (card, dim) leaves")
        (testing "metric wrapper"
          (is (= 1 (count metric-groups)) "one metric — one wrapper")
          (let [[m] metric-groups]
            (is (= "Revenue" (:name m)) "metric name comes from the Card via :metrics hydration")
            (is (nil? (:parent_group_id m)))
            (is (= [] (:query_ids m)) "metric wrappers carry no direct queries — queries live on leaves")
            (is (= (str "auto:metric:" (:id metric)) (:id m)))))
        (testing "leaves point at the metric wrapper"
          (is (every? #(= (str "auto:metric:" (:id metric)) (:parent_group_id %)) leaf-groups)))
        (testing "every group is type=auto with a string id"
          (is (every? #(= "auto" (:type %)) groups))
          (is (every? #(string? (:id %)) groups)))
        (testing "positions are 0..N-1 in depth-first order"
          (is (= (vec (range (count groups))) (mapv :position groups))))
        (testing "leaf :display_type matches the size of :query_ids"
          (is (every? #(contains? #{"singleton" "page"} (:display_type %)) leaf-groups))
          (doseq [g leaf-groups]
            (let [expected (if (= 1 (count (:query_ids g))) "singleton" "page")]
              (is (= expected (:display_type g))
                  (str "leaf " (:id g) " has " (count (:query_ids g)) " queries → " expected)))))
        (testing "every query appears in exactly one leaf group's :query_ids"
          (let [all-member-ids (mapcat :query_ids leaf-groups)
                query-ids      (map :id queries)]
            (is (= (count queries) (count all-member-ids))
                "members across leaves equal the total query count")
            (is (= (set query-ids) (set all-member-ids))
                "every query id is a member of some leaf")))
        (testing "leaf members on the same thread share the same (card, dim)"
          (let [qid->q (into {} (map (juxt :id identity)) queries)]
            (doseq [g leaf-groups]
              (let [members  (map qid->q (:query_ids g))
                    pair-set (set (map (juxt :card_id :dimension_id) members))]
                (is (= 1 (count pair-set))
                    (str "leaf " (:id g) " bundles a single (card, dim) partition"))))))
        (testing "leaf :name is the unsegmented base query's name"
          (let [qid->name (into {} (map (juxt :id :name)) queries)]
            (doseq [g leaf-groups]
              (let [base-name (some (fn [qid]
                                      (let [q (some #(when (= qid (:id %)) %) queries)]
                                        (when (nil? (:segment_id q)) (:name q))))
                                    (:query_ids g))]
                (is (= base-name (:name g))
                    (str "leaf " (:id g) " name matches the base query"))
                (is (contains? (set (vals qid->name)) (:name g)))))))))))

(deftest exploration-get-multi-metric-groups-test
  (testing "Multi-metric threads emit one metric wrapper per Card, each parenting its own leaves"
    (mt/with-temp [:model/User u {:email "multi-groups@example.com"}
                   :model/Card m1 (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Card m2 (assoc (venues-metric-card (:id u)) :name "Order count")]
      (let [body {:name "multi"
                  :metrics    [{:card_id (:id m1) :dimension_mappings (venues-dimension-mappings)}
                               {:card_id (:id m2) :dimension_mappings (venues-dimension-mappings)}]
                  :dimensions [{:dimension_id "category" :display_name "Category"}
                               {:dimension_id "price"    :display_name "Price"}]}
            {eid :id} (mt/user-http-request u :post 200 "exploration" body)
            resp      (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread    (-> resp :threads first)
            groups    (:groups thread)
            by-display (group-by :display_type groups)]
        (testing ":metrics carries the underlying Card hydrated under :card"
          (let [metrics (:metrics thread)]
            (is (= 2 (count metrics)))
            (is (= #{"Revenue" "Order count"}
                   (set (map (comp :name :card) metrics)))
                ":card on each metric exposes the Card's :name")
            (is (every? #(contains? (:card %) :type) metrics)
                ":card carries the projected Card columns")))
        (is (= 4 (count (get by-display "singleton"))) "2 metrics × 2 dimensions × 1 (no segments) = 4 leaves, all singletons")
        (is (= 2 (count (get by-display "sidebar")))   "two metrics → two top-level wrappers")
        (let [wrapper-names (set (map :name (get by-display "sidebar")))
              wrapper-ids   (set (map :id (get by-display "sidebar")))]
          (is (= #{"Revenue" "Order count"} wrapper-names))
          (is (= #{(str "auto:metric:" (:id m1)) (str "auto:metric:" (:id m2))} wrapper-ids))
          (testing "leaves are partitioned across the two wrappers by card_id"
            (let [leaves-by-parent (group-by :parent_group_id (get by-display "singleton"))]
              (is (= 2 (count (get leaves-by-parent (str "auto:metric:" (:id m1))))))
              (is (= 2 (count (get leaves-by-parent (str "auto:metric:" (:id m2))))))
              (is (every? wrapper-ids (keys leaves-by-parent))
                  "every leaf's parent is a known wrapper id"))))))))

(deftest exploration-get-empty-thread-has-empty-groups-test
  (testing "A thread with no queries gets :groups => []"
    (mt/with-temp [:model/User u {:email "no-groups@example.com"}]
      (let [{eid :id} (mt/user-http-request u :post 200 "exploration" {:name "no-groups"})
            resp      (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread    (-> resp :threads first)]
        (is (= [] (:queries thread)))
        (is (= [] (:groups thread)))))))

(deftest exploration-hydrates-timeline-events-and-per-query-scores-test
  (testing "GET /:id hydrates :timelines with the underlying Timeline + :events, and :queries with :timeline_interestingness"
    (mt/with-temp [:model/User u {:email "ti-hydrate@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:name       "Promotions"
                                       :creator_id (:id u)
                                       :icon       "star"}
                   :model/TimelineEvent _e {:timeline_id  (:id tl)
                                            :name         "Big sale"
                                            :timestamp    #t "2025-04-01T00:00:00Z"
                                            :time_matters true
                                            :timezone     "UTC"
                                            :icon         "star"
                                            :creator_id   (:id u)}]
      (let [create   (mt/user-http-request u :post 200 "exploration"
                                           {:name         "ti-hydrate"
                                            :prompt       "why did promotions move the needle"
                                            :metrics      [{:card_id (:id metric)
                                                            :dimension_mappings [{:dimension_id "d1"
                                                                                  :table_id (mt/id :venues)
                                                                                  :target ["field" {} (mt/id :venues :price)]}]}]
                                            :dimensions   [{:dimension_id "d1"}]
                                            :timeline_ids [(:id tl)]})
            eid      (:id create)
            qid      (-> create :threads first :queries first :id)
            score-row (first (t2/insert-returning-instances!
                              :model/ExplorationQueryTimelineInterestingness
                              {:exploration_query_id qid
                               :timeline_id          (:id tl)
                               :interestingness_score 0.62}))
            fetched  (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread   (-> fetched :threads first)
            tl-link  (-> thread :timelines first)
            q        (-> thread :queries first)]
        (is (some? score-row))
        (is (= (:id tl) (:timeline_id tl-link)))
        (is (some? (:timeline tl-link)) ":timelines join row hydrates the underlying Timeline")
        (is (= "Promotions" (-> tl-link :timeline :name)))
        (is (= 1 (count (-> tl-link :timeline :events)))
            ":events are hydrated under :timeline")
        (is (= "Big sale" (-> tl-link :timeline :events first :name)))
        (let [scores (:timeline_interestingness q)]
          (is (some? scores))
          (is (= 1 (count scores)))
          (is (= (:id tl) (-> scores first :timeline_id)))
          (is (= 0.62 (-> scores first :interestingness_score))))))))

(deftest exploration-queries-endpoint-includes-timeline-interestingness-test
  (testing "GET /:id/queries also hydrates :timeline_interestingness"
    (mt/with-temp [:model/User u {:email "ti-list@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:name "Releases" :creator_id (:id u)}]
      (let [create (mt/user-http-request u :post 200 "exploration"
                                         {:name         "ti-list"
                                          :metrics      [{:card_id (:id metric)
                                                          :dimension_mappings [{:dimension_id "d1"
                                                                                :table_id 1
                                                                                :target ["field" {} 1]}]}]
                                          :dimensions   [{:dimension_id "d1"}]
                                          :timeline_ids [(:id tl)]})
            eid    (:id create)
            qid    (-> create :threads first :queries first :id)]
        (t2/insert! :model/ExplorationQueryTimelineInterestingness
                    {:exploration_query_id  qid
                     :timeline_id           (:id tl)
                     :interestingness_score 0.4})
        (let [list-resp (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid))
              q         (first (filter #(= qid (:id %)) list-resp))]
          (is (some? q))
          (let [scores (:timeline_interestingness q)]
            (is (= 1 (count scores)))
            (is (= (:id tl) (-> scores first :timeline_id)))
            (is (= 0.4 (-> scores first :interestingness_score)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       PUT /api/exploration/:id (publish/move)                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest exploration-put-updates-metadata-test
  (testing "PUT /:id updates name/description/archived for the creator"
    (mt/with-temp [:model/Exploration e {:name "old" :creator_id (mt/user->id :rasta)}]
      (let [resp (mt/user-http-request :rasta :put 200 (format "exploration/%d" (:id e))
                                       {:name "new" :description "yo"})]
        (is (= "new" (:name resp)))
        (is (= "yo"  (:description resp)))
        (is (false? (:is_published resp)))))))

(deftest exploration-put-publish-to-collection-test
  (testing "PUT /:id can publish an unpublished exploration to a collection the caller can write"
    (mt/with-temp [:model/Collection c {}
                   :model/Exploration e {:name "to-publish" :creator_id (mt/user->id :rasta)}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) c)
        (let [resp (mt/user-http-request :rasta :put 200 (format "exploration/%d" (:id e))
                                         {:collection_id (:id c) :is_published true})]
          (is (true? (:is_published resp)))
          (is (= (:id c) (:collection_id resp))))))))

(deftest exploration-put-publish-requires-write-on-destination-test
  (testing "PUT /:id publish refuses when caller lacks write on the destination collection"
    (mt/with-temp [:model/Collection c {}
                   :model/Exploration e {:name "no-dest" :creator_id (mt/user->id :rasta)}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (mt/user-http-request :rasta :put 403 (format "exploration/%d" (:id e))
                              {:collection_id (:id c) :is_published true})))))

(deftest exploration-put-move-requires-write-on-source-collection-test
  (testing "Moving a published exploration requires the caller to write the source collection."
    (mt/with-temp [:model/Collection src  {}
                   :model/Collection dest {}
                   :model/Exploration e   {:name          "needs-src"
                                           :creator_id    (mt/user->id :rasta)
                                           :collection_id (:id src)
                                           :is_published  true}]
      (mt/with-non-admin-groups-no-collection-perms (:id src)
        (mt/with-non-admin-groups-no-collection-perms (:id dest)
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) dest)
          ;; user has dest write but no src perms — write-check on the published exploration
          ;; (which goes through src collection perms) fails first.
          (mt/user-http-request :rasta :put 403 (format "exploration/%d" (:id e))
                                {:collection_id (:id dest)}))))))

(deftest exploration-put-unpublish-test
  (testing "PUT /:id with is_published=false reverts the exploration to creator-only access."
    ;; Use crowberto (admin) as the unpublisher so the test is decoupled from the
    ;; "published-exploration writes go through collection perms" behavior.
    (mt/with-temp [:model/Collection c   {}
                   :model/Exploration e  {:name          "unpub"
                                          :creator_id    (mt/user->id :crowberto)
                                          :collection_id (:id c)
                                          :is_published  true}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (perms/grant-collection-read-permissions! (perms-group/all-users) c)
        (testing "before unpublish, rasta (collection-read) can see the exploration"
          (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id e))))
        (mt/user-http-request :crowberto :put 200 (format "exploration/%d" (:id e))
                              {:is_published false})
        (testing "after unpublish, rasta (non-creator) gets 403"
          (mt/user-http-request :rasta :get 403 (format "exploration/%d" (:id e))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Routed-database creation block                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest exploration-create-rejects-routed-database-metric-test
  (testing "POST / refuses when any selected metric lives in a router database"
    (mt/with-temp [:model/User u {:email "routed@example.com"}
                   :model/Card metric (assoc (valid-metric-card (:id u)) :name "Routed Metric")
                   :model/DatabaseRouter _ {:database_id    (mt/id)
                                            :user_attribute "team"}]
      (let [resp (mt/user-http-request u :post 400 "exploration"
                                       {:name    "routed"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1"
                                                                         :table_id (mt/id :venues)
                                                                         :target ["field" {} (mt/id :venues :price)]}]}]
                                        :dimensions [{:dimension_id "d1"}]})]
        (is (re-find #"routed database" (:message resp)))))))

(deftest dimensions-excludes-routed-database-metrics-test
  (testing "GET /api/exploration/dimensions hides metrics whose database is a router"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card        _ {:name          "Routed Hidden"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/DatabaseRouter _ {:database_id    (mt/id)
                                              :user_attribute "team"}]
        (let [resp  (mt/user-http-request :rasta :get 200 "exploration/dimensions")
              names (set (map :name (:metrics resp)))]
          (is (not (contains? names "Routed Hidden"))
              "metric on a router database is filtered out of /dimensions"))))))
