(ns metabase.explorations.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.explorations.api]
   [metabase.explorations.blocks :as explorations.blocks]
   [metabase.explorations.query-plan :as query-plan]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.explorations.queues :as explorations.queues]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.queries.models.card :as card]
   [metabase.query-processor :as qp]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest thread-status-test
  (let [status  #'metabase.explorations.api/thread-status
        q       (fn [s] {:status s})
        base    {:started_at :t :completed_at :t}]
    (testing "not started -> pending"
      (is (= "pending" (status {:started_at nil :completed_at nil}))))
    (testing "started, not done -> running"
      (is (= "running" (status {:started_at :t :completed_at nil}))))
    (testing "canceled wins even once the completion stamp is set"
      (is (= "canceled" (status (assoc base :canceled_at :t)))))
    (testing "planner had nothing applicable -> empty (not an error)"
      (is (= "empty" (status (assoc base :query_plan_transcript {:outcome :skip-empty} :queries [])))))
    (testing "planning failed/errored -> failed"
      (is (= "failed" (status (assoc base :query_plan_transcript {:outcome :failed} :queries []))))
      (is (= "failed" (status (assoc base :query_plan_transcript {:outcome :error} :queries [])))))
    (testing "plan ok but every query errored -> failed"
      (is (= "failed" (status (assoc base :query_plan_transcript {:outcome :ok}
                                     :queries [(q "error") (q "error")])))))
    (testing "at least one chart done -> completed"
      (is (= "completed" (status (assoc base :query_plan_transcript {:outcome :ok}
                                        :queries [(q "done") (q "error")])))))
    (testing "terminal with no queries and no usable outcome -> failed"
      (is (= "failed" (status (assoc base :queries [])))))))

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

(defn- finalize-queries!
  "For each pending ExplorationQuery row that has no dataset_query yet, build and
  persist the MBQL dataset_query using the same variant machinery the production
  runner uses. This replicates the `finalize-row!` step from the async runner
  (which doesn't execute in the test environment)."
  [queries]
  (doseq [q queries
          :when (nil? (:dataset_query q))]
    (when-let [ctx (qp.context/build-row-context q)]
      (when-let [dq (qp.variants/dataset-query (:query_type q) ctx)]
        (t2/update! :model/ExplorationQuery (:id q)
                    {:dataset_query dq})))))

(defn- vectorize-clauses
  "`mt/user-http-request` decodes JSON arrays as lists, but MBQL normalization (and
  the stricter query schema) only coerces vector-form clauses — a list-form order-by
  collapses to nil. Recursively turn seqs into vectors so callers can `lib/query` the
  response's `:dataset_query`, mirroring how a real FE request body decodes (arrays →
  vectors)."
  [x]
  (walk/postwalk (fn [v] (if (seq? v) (vec v) v)) x))

(defn- duid
  "Deterministic valid-uuid dimension id for a short test label, e.g. `(duid \"d1\")`.
  Dimension ids are uuid-validated at the API edge, so payload fixtures can't use bare
  labels; this hex-encodes the label into the uuid digits, keeping ids stable and
  distinct per label while satisfying the schema."
  [label]
  (let [hex (apply str (map #(format "%02x" (int %)) label))
        _   (assert (<= (count hex) 32) (str "label too long for duid: " label))
        pad (str (apply str (repeat (- 32 (count hex)) "0")) hex)]
    (str (subs pad 0 8) "-" (subs pad 8 12) "-" (subs pad 12 16) "-"
         (subs pad 16 20) "-" (subs pad 20 32))))

(defn- ->blocks-body
  "Adapt a test body that uses top-level `:metrics`/`:dimensions` into the `:blocks` payload
  the API now requires, wrapping them in a single block. Bodies that already carry `:blocks`
  pass through. Lets the existing create-test suite express a metric×dimension selection
  without block boilerplate; `:timeline_ids` stays thread-scoped at the top level."
  [{:keys [metrics dimensions blocks] :as body}]
  (if blocks
    body
    (-> body
        (dissoc :metrics :dimensions)
        (assoc :blocks [{:type "metric" :metrics metrics :dimensions dimensions}]))))

(defn- create-exploration!
  "POST a new exploration as `user`, then synchronously run the query planner for
  each created thread (production does this in an async worker that doesn't run in
  tests). Also finalizes each query's dataset_query (production does this in the
  runner's per-row execution step). Returns the re-hydrated exploration so callers
  see materialized :queries with dataset_query populated."
  [user body]
  (let [resp (mt/user-http-request user :post 200 "exploration" (->blocks-body body))]
    (doseq [thread (:threads resp)]
      (query-plan/generate-query-plan! (:id thread)))
    (let [hydrated (mt/user-http-request user :get 200 (str "exploration/" (:id resp)))]
      (finalize-queries! (mapcat :queries (:threads hydrated)))
      (vectorize-clauses (mt/user-http-request user :get 200 (str "exploration/" (:id resp)))))))

(defn- explore-further-and-hydrate!
  "POST explore-further, plan the new thread, and finalize its queries — mirrors
  [[create-exploration!]] for the follow-up thread the endpoint adds."
  [user expl-id page-id explore-filters]
  (let [_resp (mt/user-http-request user :post 200
                                    (format "exploration/%d/explore-further" expl-id)
                                    {:page_id         page-id
                                     :explore_filters explore-filters})
        new-thread-id (->> (t2/select :model/ExplorationThread
                                      :exploration_id expl-id
                                      {:order-by [[:position :desc] [:id :desc]]})
                           first :id)]
    (query-plan/generate-query-plan! new-thread-id)
    (let [hydrated (mt/user-http-request user :get 200 (format "exploration/%d" expl-id))]
      (finalize-queries! (mapcat :queries (:threads hydrated)))
      (vectorize-clauses (mt/user-http-request user :get 200 (format "exploration/%d" expl-id))))))

(defn- filter-display-names
  "Human-readable filter clause names from a finalized `dataset_query`."
  [dataset-query]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))
        q  (lib/query mp dataset-query)]
    (mapv #(lib/display-name q %) (or (lib/filters q) []))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    GET /api/exploration/dimensions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimensions-returns-hydrated-metrics-test
  (testing "GET /api/exploration/dimensions returns metrics referencing dimensions by id"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Alpha Metric"
                                      :type          :metric
                                      :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                     :model/Card _m2 {:name          "Beta Metric"
                                      :type          :metric
                                      :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
        (let [response       (mt/user-http-request :rasta :get 200 "exploration/dimensions")
              all-metrics    (:metrics response)
              ;; Scope to this test's own metrics — other tests' temp :metric Cards can be live
              ;; in the catalog during a parallel run, so an exact total count isn't reliable.
              metrics        (filter #(#{"Alpha Metric" "Beta Metric"} (:name %)) all-metrics)
              groups         (:dimension_groups response)
              metric-dim-ids (set (mapcat :dimension_ids all-metrics))]
          (is (= 2 (count metrics)) "both of this test's metrics are present")
          (is (every? #(contains? % :dimension_ids) metrics))
          (is (every? #(not (contains? % :dimensions)) metrics))
          (is (every? #(contains? % :dimension_mappings) metrics))
          (testing "every group has a name and a non-empty dimension list"
            (is (every? :name groups))
            (is (every? #(seq (:dimensions %)) groups)))
          (testing "every grouped dimension belongs to some metric's dimension_ids"
            ;; groups drop dimensions scoring below min-interestingness, so the reverse
            ;; (every metric dimension appears in a group) no longer holds.
            (doseq [g groups]
              (is (every? #(contains? metric-dim-ids (:id %)) (:dimensions g))))))))))

(deftest dimensions-search-by-name-test
  (testing "GET /api/exploration/dimensions filters case-insensitively by metric name"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Revenue"
                                      :type          :metric
                                      :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                     :model/Card _m2 {:name          "Order Count"
                                      :type          :metric
                                      :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions" :q "reven")]
          (is (= 1 (count (:metrics response))))
          (is (= "Revenue" (:name (first (:metrics response))))))))))

(deftest dimensions-search-by-dimension-display-name-test
  (testing "GET /api/exploration/dimensions matches metrics whose dimension display-name contains q"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card metric {:name          "Sales"
                                         :type          :metric
                                         :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
        (let [hydrated (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
              dim-name (some-> hydrated :dimensions first :display_name)]
          (is (some? dim-name) "metric should have at least one hydrated dimension with a display-name")
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions"
                                               :q (subs dim-name 0 (min 3 (count dim-name))))]
            (is (some #(= (:id metric) (:id %)) (:metrics response))
                "metric should be returned because a dimension display-name matched")))))))

(deftest dimensions-search-no-match-test
  (testing "GET /api/exploration/dimensions returns empty lists when nothing matches"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m {:name          "Hello"
                                     :type          :metric
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
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
                                            :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions")]
            (is (not-any? #(= "Hidden Metric" (:name %)) (:metrics response)))))))))

(deftest dimensions-drops-unresolvable-dimensions-test
  (testing "GET /api/exploration/dimensions silently drops dimensions whose target ref doesn't resolve against the metric's dataset_query (UXW-4083)"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card metric {:name          "Filter target"
                                         :type          :metric
                                         :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
        (let [good-id "11111111-1111-1111-1111-111111111111"
              bad-id  "22222222-2222-2222-2222-222222222222"
              good-mapping {:dimension-id good-id
                            :type         :table
                            :target       [:field {} (mt/id :venues :name)]
                            :table-id     (mt/id :venues)}
              bad-mapping  {:dimension-id bad-id
                            :type         :table
                            :target       [:field {} 999999999]
                            :table-id     (mt/id :venues)}]
          ;; Replace whatever sync wrote with a minimal pair: one resolvable, one not.
          ;; Suppress the after-update auto-sync so it can't reconcile our hand-crafted
          ;; row back to the computed dimensions.
          (with-redefs [card/*syncing-metric-dimensions* true]
            (t2/update! :model/Card (:id metric)
                        {:dimensions         [{:id good-id :name "NAME" :display-name "Good"
                                               :effective-type :type/Text}
                                              {:id bad-id  :name "ZZZ"  :display-name "Unresolvable"
                                               :effective-type :type/Text}]
                         :dimension_mappings [good-mapping bad-mapping]}))
          (let [response   (mt/user-http-request :rasta :get 200 "exploration/dimensions")
                the-metric (first (filter #(= (:id metric) (:id %)) (:metrics response)))]
            (is (some? the-metric) "metric should be present in response")
            (is (contains? (set (:dimension_ids the-metric)) good-id)
                "resolvable dimension should be retained")
            (is (not (contains? (set (:dimension_ids the-metric)) bad-id))
                "dimension whose target field doesn't exist should be silently dropped")
            (is (= [good-id] (mapv :dimension_id (:dimension_mappings the-metric)))
                "matching mapping should be dropped too (mapping contents are snake_case on the wire)")))))))

(defn- valid-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))})

(deftest exploration-create-persists-everything-and-runs-test
  (testing "POST / creates an exploration with one thread, persists selections, and materializes queries"
    (mt/with-temp [:model/User u {:email "create@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [body {:name         "Why is revenue down"
                  :description  "Q3 dip"
                  :prompt       "break down by region"
                  :metrics      [{:card_id (:id metric)
                                  :dimension_mappings [{:dimension_id (duid "d1")
                                                        :table_id (mt/id :venues)
                                                        :target ["field" {} (mt/id :venues :price)]}]}]
                  :dimensions   [{:dimension_id (duid "d1") :display_name "Price"
                                  :effective_type "type/Number"}]
                  :timeline_ids [(:id tl)]}
            resp (create-exploration! u body)
            thread (-> resp :threads first)
            q      (-> thread :queries first)]
        (is (= "Why is revenue down" (:name resp)))
        (is (= 1 (count (:threads resp))))
        (is (= "break down by region" (:prompt thread)))
        (is (some? (:started_at thread)))
        (is (= "running" (:status thread))
            "a started, not-yet-completed thread reports a derived :status")
        (is (not (contains? thread :query_plan_transcript))
            "the internal query-plan transcript is not exposed on the wire")
        (is (= 1 (t2/count :model/ExplorationBlock :exploration_thread_id (:id thread))))
        (testing "snake_case API payloads are persisted in the internal kebab-case shape"
          (let [block (t2/select-one :model/ExplorationBlock :exploration_thread_id (:id thread))]
            (is (= (duid "d1") (-> block :dimensions first :dimension-id)))
            (is (= "Price" (-> block :dimensions first :display-name)))
            (is (= (duid "d1") (-> block :metrics first :dimension_mappings first :dimension-id)))
            (is (= (mt/id :venues) (-> block :metrics first :dimension_mappings first :table-id)))))
        (is (= 1 (t2/count :model/ExplorationThreadTimeline :exploration_thread_id (:id thread))))
        (is (= 1 (count (:queries thread))))
        (is (= (duid "d1") (:dimension_id q)))
        (is (= "pending" (:status q)))
        (let [mp  (lib-be/application-database-metadata-provider (mt/id))
              qry (lib/query mp (:dataset_query q))
              brk (first (lib/breakouts qry))]
          (is (= 1 (count (lib/breakouts qry)))
              "snapshot MBQL adds a breakout from the dimension's target")
          (is (= :default (:strategy (lib/binning brk)))
              "numeric dim with a usable fingerprint picks up default auto-binning"))))))

(deftest exploration-get-hydrates-thread-timelines-test
  (testing "GET /api/exploration/:id hydrates thread :timelines so the detail page can offer them"
    (mt/with-temp [:model/User u {:email "tl-hydrate@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u) :name "Releases"}]
      (let [body      {:name         "Timeline hydrate"
                       :metrics      [{:card_id (:id metric)
                                       :dimension_mappings [{:dimension_id (duid "d1")
                                                             :table_id (mt/id :venues)
                                                             :target ["field" {} (mt/id :venues :price)]}]}]
                       :dimensions   [{:dimension_id (duid "d1") :display_name "Price"
                                       :effective_type "type/Number"}]
                       :timeline_ids [(:id tl)]}
            resp      (create-exploration! u body)
            timelines (-> resp :threads first :timelines)]
        (is (= 1 (count timelines)))
        (is (= (:id tl) (-> timelines first :timeline_id)))
        (is (= "Releases" (-> timelines first :timeline :name))
            "nested :timeline is hydrated for the picker")))))

(deftest exploration-block-naming-by-type-test
  (testing "GET builds block headings + page names from the block :type"
    (mt/with-temp [:model/User u {:email "group-naming@example.com"}
                   :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")
                   :model/Card signups (assoc (valid-metric-card (:id u)) :name "Signups")]
      (let [mapping (fn [card-id]
                      [{:dimension_id (duid "d1")
                        :table_id (mt/id :venues)
                        :target ["field" {} (mt/id :venues :price)]
                        :card_id card-id}])
            dims    [{:dimension_id (duid "d1") :display_name "Price" :effective_type "type/Number"}]
            body    {:name   "Naming"
                     :blocks [;; metric-anchored: one metric crossed with a dimension
                              {:type       "metric"
                               :metrics    [{:card_id (:id revenue)
                                             :dimension_mappings (mapping (:id revenue))}]
                               :dimensions dims}
                              ;; dimension-anchored: one dimension crossed with two metrics
                              {:type       "dimension"
                               :metrics    [{:card_id (:id revenue)
                                             :dimension_mappings (mapping (:id revenue))}
                                            {:card_id (:id signups)
                                             :dimension_mappings (mapping (:id signups))}]
                               :dimensions dims}]}
            resp    (create-exploration! u body)
            blocks  (-> resp :threads first :blocks)
            metric-block    (first (filter #(= "metric" (:type %)) blocks))
            dimension-block (first (filter #(= "dimension" (:type %)) blocks))
            page-names (fn [block] (set (map :name (:pages block))))
            long-names (fn [block] (set (map :long_name (:pages block))))]
        (testing "metric-anchored block: heading is the metric, pages are the dimension"
          (is (= "Revenue" (:name metric-block)))
          (is (= #{"Price"} (page-names metric-block)))
          (testing "long_name is self-describing (carries the metric the heading drops)"
            (is (= #{"Revenue by Price"} (long-names metric-block)))))
        (testing "dimension-anchored block: heading is By <dimension>, pages are the metrics"
          (is (= "By Price" (:name dimension-block)))
          (is (= #{"Revenue" "Signups"} (page-names dimension-block)))
          (testing "long_name is self-describing (carries the dimension the heading drops)"
            (is (= #{"Revenue by Price" "Signups by Price"} (long-names dimension-block)))))))))

(deftest exploration-dimension-group-heading-disambiguation-test
  (testing "GET qualifies same-named dimension-anchored group headings by their source"
    ;; Suppress the post-insert dimension auto-sync so our fixture dims survive on the Card.
    (with-redefs [card/*syncing-metric-dimensions* true]
      (let [users-created  "00000000-0000-0000-0000-0000000a1111"
            orders-created "00000000-0000-0000-0000-0000000b2222"]
        (mt/with-temp
          [:model/User u {:email "dim-heading@example.com"}
           :model/Card revenue (assoc (valid-metric-card (:id u))
                                      :name "Revenue"
                                      :dimensions
                                      [{:id users-created  :name "CREATED_AT" :display-name "Created At"
                                        :group {:id "g-users"  :type "main"       :display-name "Users"}}
                                       {:id orders-created :name "CREATED_AT" :display-name "Created At"
                                        :group {:id "g-orders" :type "connection" :display-name "Orders"}}])]
          (let [mapping  (fn [dim-id field-id]
                           [{:dimension_id dim-id :table_id 1 :target ["field" {} field-id]}])
                dim-grp  (fn [dim-id field-id]
                           {:type       "dimension"
                            :metrics    [{:card_id (:id revenue)
                                          :dimension_mappings (mapping dim-id field-id)}]
                            :dimensions [{:dimension_id dim-id :display_name "Created At"}]})
                headings (fn [body]
                           (->> (create-exploration! u body) :threads first :blocks
                                (filter #(= "dimension" (:type %)))
                                (map :name)
                                set))]
            (testing "two dimension blocks sharing a base name → headings qualified by source"
              (is (= #{"By Users - Created At" "By Orders - Created At"}
                     (headings {:name   "ambig-headings"
                                :blocks [(dim-grp users-created 1)
                                         (dim-grp orders-created 2)]}))))
            (testing "a single dimension group keeps the plain heading even with a known source"
              (is (= #{"By Created At"}
                     (headings {:name   "single-heading"
                                :blocks [(dim-grp users-created 1)]}))))))))))

(deftest exploration-create-persists-blocks-verbatim-test
  (testing "POST / persists each :blocks entry as its own ExplorationBlock row — no dedup across blocks"
    (mt/with-temp [:model/User u {:email "groups@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [mapping [{:dimension_id (duid "d1")
                      :table_id (mt/id :venues)
                      :target ["field" {} (mt/id :venues :price)]}]
            ;; Two blocks sharing the same metric: a metric block (metric + d1) and a
            ;; dimension block (the same metric, with d2). Timelines are thread-scoped,
            ;; sent once at the top level. Each block is stored verbatim — the shared
            ;; metric is NOT deduped across blocks.
            body {:name         "Blocked create"
                  :prompt       "via blocks"
                  :timeline_ids [(:id tl)]
                  :blocks       [{:type       "metric"
                                  :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                                  :dimensions [{:dimension_id (duid "d1") :display_name "Price"
                                                :effective_type "type/Number"}]}
                                 {:type       "dimension"
                                  :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                                  :dimensions [{:dimension_id (duid "d2") :display_name "Category"
                                                :effective_type "type/Text"}]}]}
            resp   (mt/user-http-request u :post 200 "exploration" body)
            tid    (-> resp :threads first :id)
            blocks (t2/select :model/ExplorationBlock
                              :exploration_thread_id tid {:order-by [[:position :asc]]})]
        (is (= "Blocked create" (:name resp)))
        (is (= 2 (count blocks)) "one row per block, no dedup")
        (is (= ["metric" "dimension"] (map :type blocks)) "anchor type stored in payload order")
        (is (= [0 1] (map :position blocks)))
        (testing "each block keeps its own metrics + dimensions selection"
          (is (= [(:id metric) (:id metric)] (map #(-> % :metrics first :card_id) blocks)))
          (is (= [(duid "d1") (duid "d2")] (map #(-> % :dimensions first :dimension-id) blocks))))
        (testing "timelines are thread-scoped, stored once"
          (is (= 1 (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid))))))))

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
                                :dimension_mappings [{:dimension_id (duid "dt")  :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id (duid "d")   :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id (duid "t")   :table_id tbl-id :target ["field" {} id-fid]}
                                                     {:dimension_id (duid "n")   :table_id tbl-id :target ["field" {} num-fid]}
                                                     {:dimension_id (duid "lat") :table_id tbl-id :target ["field" {} lat-fid]}
                                                     {:dimension_id (duid "s")   :table_id tbl-id :target ["field" {} txt-fid]}]}]
                     :dimensions [{:dimension_id (duid "dt")  :effective_type "type/DateTime"}
                                  {:dimension_id (duid "d")   :effective_type "type/Date"}
                                  {:dimension_id (duid "t")   :effective_type "type/Time"}
                                  {:dimension_id (duid "n")   :effective_type "type/Number"}
                                  {:dimension_id (duid "lat") :effective_type "type/Float" :semantic_type "type/Latitude"}
                                  {:dimension_id (duid "s")   :effective_type "type/Text"}]}
            resp    (create-exploration! u body)
            mp      (lib-be/application-database-metadata-provider (mt/id))
            by-dim  (into {} (for [q       (-> resp :threads first :queries)
                                   :when   (= "default" (:query_type q))]
                               [(:dimension_id q) (->> (:dataset_query q)
                                                       (lib/query mp)
                                                       lib/breakouts
                                                       first)]))]
        (testing "DateTime dim → :month bucket"
          (is (= :month (lib/raw-temporal-bucket (get by-dim (duid "dt")))))
          (is (nil? (lib/binning (get by-dim (duid "dt"))))))
        (testing "Date dim → :day bucket"
          (is (= :day (lib/raw-temporal-bucket (get by-dim (duid "d"))))))
        (testing "Time dim → :hour bucket"
          (is (= :hour (lib/raw-temporal-bucket (get by-dim (duid "t"))))))
        (testing "Number dim with a fingerprinted field → default auto-binning"
          (is (= :default (:strategy (lib/binning (get by-dim (duid "n"))))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim (duid "n"))))))
        (testing "Coordinate (semantic Latitude over Float) with a fingerprinted field → default auto-binning"
          (is (= :default (:strategy (lib/binning (get by-dim (duid "lat")))))))
        (testing "Non-numeric / non-temporal dim → no bucket"
          (is (nil? (lib/binning (get by-dim (duid "s")))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim (duid "s"))))))))))

(deftest exploration-create-skips-binning-when-fingerprint-missing-test
  (testing "POST / skips default numeric binning when the underlying Field has no min/max fingerprint"
    (mt/with-temp [:model/User u {:email "no-fp@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [field-id (mt/id :venues :price)]
        ;; Null the fingerprint to simulate a fresh-synced / native-result / all-null field.
        (mt/with-temp-vals-in-db :model/Field field-id {:fingerprint nil}
          (let [body {:name    "no fp"
                      :metrics [{:card_id (:id metric)
                                 :dimension_mappings [{:dimension_id (duid "n")
                                                       :table_id (mt/id :venues)
                                                       :target ["field" {} field-id]}]}]
                      :dimensions [{:dimension_id (duid "n") :effective_type "type/Number"}]}
                resp (create-exploration! u body)
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
                                       :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :products))) (lib/aggregate (lib/count)) (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :products :created_at)) :month)))))}]
      (let [dim-fid  (mt/id :products :category)
            temp-fid (mt/id :products :created_at)
            body     {:name       "no time pls"
                      :metrics    [{:card_id            (:id metric)
                                    :dimension_mappings [{:dimension_id (duid "d1")
                                                          :table_id     (mt/id :products)
                                                          :target       ["field" {} dim-fid]}]}]
                      :dimensions [{:dimension_id (duid "d1") :display_name "Region"}]}
            resp (create-exploration! u body)
            q    (->> resp :threads first :queries (filter #(= "default" (:query_type %))) first)
            mp   (lib-be/application-database-metadata-provider (mt/id))
            qry  (lib/query mp (:dataset_query q))
            bos  (lib/breakouts qry)
            col  (lib/find-matching-column qry -1 (first bos) (lib/breakoutable-columns qry))]
        (is (= 1 (count bos))
            "metric's default temporal breakout is stripped before the chosen one is added")
        (is (= dim-fid (:id col))
            "the surviving breakout resolves to the chosen dim's target field")
        (is (not= temp-fid (:id col))
            "the metric's original temporal breakout (created_at) is gone — the only breakout is the chosen dim")))))

(deftest exploration-create-materializes-metric-x-dimension-matrix-test
  (testing "POST / creates one ExplorationQuery per (metric, dimension) pair"
    (mt/with-temp [:model/User u {:email "matrix@example.com"}
                   :model/Card m1 (valid-metric-card (:id u))
                   :model/Card m2 (valid-metric-card (:id u))]
      (let [mapping  [{:dimension_id (duid "category") :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
                      {:dimension_id (duid "price")    :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}]
            body     {:name "matrix"
                      :metrics [{:card_id (:id m1) :dimension_mappings mapping}
                                {:card_id (:id m2) :dimension_mappings mapping}]
                      :dimensions [{:dimension_id (duid "category") :display_name "Category"}
                                   {:dimension_id (duid "price")    :display_name "Price"}]}
            resp     (create-exploration! u body)
            all-queries (-> resp :threads first :queries)
            ;; The metric×dimension matrix is the set of base "default" queries (ignore
            ;; extra variants like top-n-other that high-cardinality dims also emit).
            queries  (filter #(= "default" (:query_type %)) all-queries)]
        (is (= 4 (count queries)) "2 metrics × 2 dimensions = 4 default queries")
        (is (= #{[(:id m1) (duid "category")] [(:id m1) (duid "price")]
                 [(:id m2) (duid "category")] [(:id m2) (duid "price")]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (every? #(= "pending" (:status %)) all-queries))))))

(defn- venues-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))})

(defn- venues-dimension-mappings
  "Wire-shape (snake_case) dimension mappings for HTTP request payloads. `defendpoint` decodes
  these to the internal kebab-case shape via the `:metabase.metrics.core/dimension-mapping`
  schema the request schemas reference."
  []
  [{:dimension_id (duid "category") :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
   {:dimension_id (duid "price")    :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}])

(defn- stored-venues-dimension-mappings
  "Internal-shape (kebab-case) dimension mappings for direct t2 block fixtures — the canonical
  stored shape, bypassing the API edge conversion."
  []
  [{:dimension-id (duid "category") :table-id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
   {:dimension-id (duid "price")    :table-id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}])

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
                                            :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 1)))))}
                   :model/Segment premium  {:name       "premium"
                                            :table_id   (mt/id :venues)
                                            :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 4)))))}]
      (let [body    {:name       "fan-out"
                     :metrics    [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                     :dimensions [{:dimension_id (duid "category") :display_name "Category"}
                                  {:dimension_id (duid "price")    :display_name "Price"}]}
            resp    (create-exploration! u body)
            queries (-> resp :threads first :queries)
            ;; Filter to default queries to isolate segment fan-out behavior;
            ;; top-n-other variant also fans out so total query count is higher.
            defaults (filter #(= "default" (:query_type %)) queries)
            base     (filter #(nil? (:segment_id %)) defaults)
            segged   (remove #(nil? (:segment_id %)) defaults)]
        (is (= 6 (count defaults)) "2 dimensions × (1 base + 2 segments) = 6 default queries")
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
                a-internal   (some #(when (= (duid "category") (:dimension_id %)) %)
                                   (get segged-by-id (:id internal)))]
            (is (= "Revenue by Category (internal)" (:name a-internal)))))))))

(deftest exploration-create-skips-segments-on-other-tables-test
  (testing "Segments whose table_id doesn't match the metric's source-table are not applied"
    (mt/with-temp [:model/User u {:email "seg-scope@example.com"}
                   :model/Card metric (venues-metric-card (:id u))
                   :model/Segment _other {:name       "users-only"
                                          :table_id   (mt/id :users)
                                          :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :users))) (lib/filter (lib/not-null (lib.metadata/field mp (mt/id :users :id)))))))}]
      (let [body    {:name       "scope"
                     :metrics    [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                     :dimensions [{:dimension_id (duid "category")} {:dimension_id (duid "price")}]}
            resp    (create-exploration! u body)
            queries (-> resp :threads first :queries)]
        (is (pos? (count queries))
            "venues metric × 2 dims produces at least one query")
        (is (every? #(nil? (:segment_id %)) queries)
            "the users-table segment doesn't apply, so no segment fan-out")))))

(defn- products-monthly-metric-card
  "Metric Card with a default `:month` temporal breakout on `products.created_at`. Used to
  exercise the time-facet variant, which fires only when the metric carries a temporal breakout."
  [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :products))) (lib/aggregate (lib/count)) (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :products :created_at)) :month)))))})

(defn- query-types
  [queries]
  (set (map :query_type queries)))

(deftest exploration-create-temporal-dim-emits-pattern-variants-test
  (testing "POST / with a datetime dim emits default + day-of-week + hour-of-day"
    (mt/with-temp [:model/User u {:email "temporal-dt@example.com"}
                   :model/Card metric (venues-metric-card (:id u))]
      (let [mapping [{:dimension_id (duid "created")
                      ;; a mapping's :table_id is the table of the *target* column (see
                      ;; `column->computed-pair` in `metabase.lib-metric.dimension.jvm`),
                      ;; which for joined dimensions differs from the metric's source table
                      :table_id     (mt/id :people)
                      :target       ["field" {} (mt/id :people :created_at)]}]
            body    {:name       "dt"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id   (duid "created")
                                   :display_name   "Created"
                                   :effective_type "type/DateTime"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)]
        (is (= #{"default" "temporal-pattern-day" "temporal-pattern-hour"}
               (query-types queries)))
        (is (every? #(= (duid "created") (:dimension_id %)) queries))))))

(deftest exploration-create-date-dim-skips-hour-of-day-test
  (testing "POST / with a pure-date dim emits default + day-of-week (no HoD)"
    (mt/with-temp [:model/User u {:email "temporal-date@example.com"}
                   :model/Card metric (venues-metric-card (:id u))]
      (let [mapping [{:dimension_id (duid "created")
                      :table_id     (mt/id :venues)
                      :target       ["field" {} (mt/id :checkins :date)]}]
            body    {:name       "date"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id   (duid "created")
                                   :display_name   "Created"
                                   :effective_type "type/Date"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)]
        (is (= #{"default" "temporal-pattern-day"} (query-types queries)))))))

(deftest exploration-create-time-facet-test
  (testing "POST / with a low-cardinality categorical dim + metric with default temporal breakout emits default + time-facet"
    (mt/with-temp [:model/User u {:email "time-facet@example.com"}
                   :model/Card metric (assoc (products-monthly-metric-card (:id u)) :name "Sales")]
      (let [mapping [{:dimension_id (duid "cat")
                      :table_id     (mt/id :products)
                      :target       ["field" {} (mt/id :products :category)]}]
            body    {:name       "facet"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id (duid "cat") :display_name "Category"}]}
            thread  (-> (create-exploration! u body) :threads first)
            queries (:queries thread)
            facet   (first (filter #(= "time-facet" (:query_type %)) queries))
            pages   (->> thread :blocks (mapcat :pages))
            by-long (into {} (map (juxt :long_name identity)) pages)]
        (is (= #{"default" "time-facet"} (query-types queries)))
        (is (= "line" (:display facet))
            "time-facet variant explicitly sets :display \"line\"")
        (is (= "Sales by Category over time" (:name facet)))
        (testing "the default and time-facet variants become two pages, named from parts"
          (is (= #{"Sales by Category" "Sales by Category over time"}
                 (set (map :long_name pages)))
              "long_name: full <metric> by <dimension> <variant>")
          (is (= "Category" (:name (by-long "Sales by Category")))
              "short name of the default page drops the metric (it's the block heading)")
          (is (= "Category over time" (:name (by-long "Sales by Category over time")))
              "short name carries the variant qualifier"))))))

(deftest exploration-create-time-facet-skipped-without-default-breakout-test
  (testing "POST / categorical dim but metric has no default temporal breakout → no time-facet"
    (mt/with-temp [:model/User u {:email "no-default-breakout@example.com"}
                   :model/Card metric (venues-metric-card (:id u))]
      (let [mapping [{:dimension_id (duid "price")
                      :table_id     (mt/id :venues)
                      :target       ["field" {} (mt/id :venues :price)]}]
            body    {:name       "no-facet"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id (duid "price") :display_name "Price" :effective_type "type/Number"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)]
        ;; Numeric dim → default (auto-binned); no top-n-other; and no time-facet because the
        ;; metric has no default temporal breakout.
        (is (= #{"default"} (query-types queries)))))))

(deftest exploration-create-high-cardinality-routes-to-top-n-other-test
  (testing "POST / categorical dim with very high distinct-count → no default, no time-facet, just top-n-other"
    (mt/with-temp [:model/User u {:email "high-card@example.com"}
                   :model/Card metric (products-monthly-metric-card (:id u))]
      (let [mapping [{:dimension_id (duid "email")
                      ;; :table_id is the target column's table, not the metric's source table
                      :table_id     (mt/id :people)
                      :target       ["field" {} (mt/id :people :email)]}]
            body    {:name       "high-card"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id (duid "email") :display_name "Email"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)]
        (is (= #{"top-n-other"} (query-types queries))
            "people.email has ~2500 distinct values → exceeds both default and time-facet gates; top-n-other is the only safe shape")))))

(deftest exploration-create-time-facet-skips-segments-test
  (testing "POST / time-facet variant does NOT fan out across segments (category + time + segment filter is too noisy to surface)"
    (mt/with-temp [:model/User u {:email "facet-no-seg@example.com"}
                   :model/Card metric (assoc (products-monthly-metric-card (:id u)) :name "Sales")
                   :model/Segment s {:name       "premium"
                                     :table_id   (mt/id :products)
                                     :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :products))) (lib/filter (lib/> (lib.metadata/field mp (mt/id :products :price)) 50)))))}]
      (let [mapping [{:dimension_id (duid "cat")
                      :table_id     (mt/id :products)
                      :target       ["field" {} (mt/id :products :category)]}]
            body    {:name       "facet-no-seg"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id (duid "cat") :display_name "Category"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)
            by-type (group-by :query_type queries)]
        (testing "default still fans out: 1 base + 1 segment"
          (is (= 2 (count (get by-type "default"))))
          (is (= #{nil (:id s)} (set (map :segment_id (get by-type "default"))))))
        (testing "time-facet has exactly one unsegmented row"
          (is (= 1 (count (get by-type "time-facet"))))
          (is (nil? (:segment_id (first (get by-type "time-facet")))))
          (testing "and its dataset_query carries no :segment filter"
            (is (empty? (segment-filters (:dataset_query (first (get by-type "time-facet"))))))))))))

(deftest exploration-create-segments-multiply-every-variant-test
  (testing "Segment fan-out applies uniformly to each candidate variant"
    (mt/with-temp [:model/User u {:email "seg-multiply@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Segment s {:name       "cheap"
                                     :table_id   (mt/id :venues)
                                     :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 1)))))}]
      (let [mapping [{:dimension_id (duid "created")
                      ;; a mapping's :table_id is the table of the *target* column (see
                      ;; `column->computed-pair` in `metabase.lib-metric.dimension.jvm`),
                      ;; which for joined dimensions differs from the metric's source table
                      :table_id     (mt/id :people)
                      :target       ["field" {} (mt/id :people :created_at)]}]
            body    {:name       "seg"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id   (duid "created")
                                   :display_name   "Created"
                                   :effective_type "type/DateTime"}]}
            queries (-> (create-exploration! u body)
                        :threads first :queries)
            by-seg  (group-by (comp boolean :segment_id) queries)]
        (is (= 6 (count queries)) "3 variants × (1 base + 1 segment) = 6")
        (is (= #{"default" "temporal-pattern-day" "temporal-pattern-hour"}
               (set (map :query_type (get by-seg false)))))
        (is (= #{"default" "temporal-pattern-day" "temporal-pattern-hour"}
               (set (map :query_type (get by-seg true)))))
        (is (every? #(= (:id s) (:segment_id %)) (get by-seg true)))))))

(deftest exploration-create-variants-grouped-into-pages-test
  (testing "variants for a (card, dim) are materialized and partitioned across the block's pages"
    (mt/with-temp [:model/User u {:email "groups-collapse@example.com"}
                   :model/Card metric (venues-metric-card (:id u))]
      (let [mapping [{:dimension_id (duid "created")
                      ;; a mapping's :table_id is the table of the *target* column (see
                      ;; `column->computed-pair` in `metabase.lib-metric.dimension.jvm`),
                      ;; which for joined dimensions differs from the metric's source table
                      :table_id     (mt/id :people)
                      :target       ["field" {} (mt/id :people :created_at)]}]
            body    {:name       "collapse"
                     :metrics    [{:card_id (:id metric) :dimension_mappings mapping}]
                     :dimensions [{:dimension_id   (duid "created")
                                   :display_name   "Created"
                                   :effective_type "type/DateTime"}]}
            resp    (create-exploration! u body)
            thread  (first (:threads resp))
            queries (:queries thread)
            blocks  (:blocks thread)
            pages   (mapcat :pages blocks)]
        (is (pos? (count queries)))
        (is (= 1 (count blocks)) "one block for the single (metric, dim) selection")
        (is (= (set (map :id queries)) (set (mapcat :query_ids pages)))
            "every query belongs to a page; pages cover exactly the thread's queries")
        (is (= (count queries) (reduce + (map (comp count :query_ids) pages)))
            "no query is double-counted across pages")))))

(deftest exploration-create-without-selections-test
  (testing "POST / works without metrics/dimensions/timelines (drafty exploration)"
    (mt/with-temp [:model/User u {:email "empty@example.com"}]
      (let [resp (mt/user-http-request u :post 200 "exploration" {:name "empty"})]
        (is (= 1 (count (:threads resp))))
        (is (zero? (count (-> resp :threads first :metrics))))
        (is (zero? (count (-> resp :threads first :queries))))))))

(deftest exploration-restart-reruns-existing-thread-test
  (testing "POST /thread/:thread-id/restart re-runs that thread in place, keeping selections"
    (mt/with-temp [:model/User u {:email "restart@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [body      {:name         "Why is revenue down"
                       :prompt       "break down by region"
                       :metrics      [{:card_id (:id metric)
                                       :dimension_mappings [{:dimension_id (duid "d1")
                                                             :table_id (mt/id :venues)
                                                             :target ["field" {} (mt/id :venues :price)]}]}]
                       :dimensions   [{:dimension_id (duid "d1") :display_name "Price"
                                       :effective_type "type/Number"}]
                       :timeline_ids [(:id tl)]}
            created   (create-exploration! u body)
            expl-id   (:id created)
            thread    (-> created :threads first)
            orig-tid  (:id thread)]
        (is (pos? (count (:queries thread))) "the first run materialized queries")
        ;; Simulate a finished run so we can prove restart clears the terminal-state gates.
        (t2/update! :model/ExplorationThread orig-tid
                    {:query_plan_started_at (t/offset-date-time)
                     :analysis_started_at   (t/offset-date-time)
                     :completed_at          (t/offset-date-time)})
        (let [resp     (mt/user-http-request u :post 200 (format "exploration/thread/%d/restart" orig-tid))
              threads  (:threads resp)
              rerun    (first threads)]
          (is (= 1 (count threads)) "restart does NOT add a thread")
          (is (= orig-tid (:id rerun)) "it re-runs the same thread")
          (is (some? (:started_at rerun)) "started_at re-stamped so the planner re-claims it")
          (is (nil? (:query_plan_started_at rerun)) "plan-claim gate cleared")
          (is (nil? (:analysis_started_at rerun)) "analysis-claim gate cleared")
          (is (nil? (:completed_at rerun)) "completion gate cleared")
          (is (empty? (:queries rerun)) "previously generated queries are wiped")
          (testing "selections are preserved"
            ;; Selections live in the thread's ExplorationBlock rows, which restart does
            ;; NOT delete (only the materialized queries are wiped, so the query-derived
            ;; :blocks tree in the response has empty pages until the planner re-runs below).
            (let [blocks (t2/select :model/ExplorationBlock :exploration_thread_id orig-tid)]
              (is (= 1 (count blocks)) "the Research-plan block survives the restart")
              (is (= 1 (count (:metrics (first blocks)))) "its metric selection is preserved")
              (is (= [(duid "d1")] (mapv :dimension-id (:dimensions (first blocks))))
                  "its dimension selection is preserved"))
            (is (= 1 (count (:timelines rerun)))))
          (testing "the planner regenerates queries for the same thread"
            (query-plan/generate-query-plan! orig-tid)
            (let [hydrated (mt/user-http-request u :get 200 (format "exploration/%d" expl-id))
                  planned  (-> hydrated :threads first)]
              (is (= orig-tid (:id planned)))
              (is (pos? (count (:queries planned)))))))))))

(deftest exploration-restart-permissions-test
  (testing "Only a user with write access can restart an exploration"
    (mt/with-temp [:model/User owner {:email "rs-owner@example.com"}
                   :model/User other {:email "rs-other@example.com"}]
      (let [created (mt/user-http-request owner :post 200 "exploration"
                                          {:name "private"
                                           :collection_id (:id (collection/user->personal-collection (:id owner)))})
            tid     (-> created :threads first :id)]
        ;; Perms ride the thread's parent exploration, resolved by `write-check-thread`.
        ;; Mark the thread terminal — restart refuses in-flight threads with a 409.
        (t2/update! :model/ExplorationThread tid {:completed_at (t/offset-date-time)})
        (mt/user-http-request other :post 403 (format "exploration/thread/%d/restart" tid))
        (let [resp (mt/user-http-request owner :post 200 (format "exploration/thread/%d/restart" tid))]
          (is (= 1 (count (:threads resp))) "still a single thread after restart"))))))

(deftest exploration-restart-targets-the-requested-thread-test
  (testing "POST /thread/:thread-id/restart restarts the addressed thread, not the exploration's newest one —"
    (testing "an exploration holds several threads once \"Explore further\" is used, each with its own Restart"
      (mt/with-temp [:model/User u {:email "rs-multi@example.com"}]
        (let [created  (mt/user-http-request u :post 200 "exploration" {:name "multi"})
              expl-id  (:id created)
              root-tid (-> created :threads first :id)
              ;; A later thread, as "Explore further" creates: higher position, so it's the one the
              ;; old "latest thread" rule would have picked.
              drill    (first (t2/insert-returning-instances!
                               :model/ExplorationThread
                               {:exploration_id expl-id :name "drill" :position 1
                                :completed_at   (t/offset-date-time)}))]
          (t2/update! :model/ExplorationThread root-tid {:completed_at (t/offset-date-time)})
          (mt/user-http-request u :post 200 (format "exploration/thread/%d/restart" root-tid))
          (is (nil? (t2/select-one-fn :completed_at :model/ExplorationThread :id root-tid))
              "the named (root) thread was reset")
          (is (some? (t2/select-one-fn :completed_at :model/ExplorationThread :id (:id drill)))
              "the newest thread was left alone"))))))

(deftest exploration-restart-404s-on-unknown-thread-test
  (testing "POST /thread/:thread-id/restart 404s for a thread that doesn't exist"
    ;; The thread is the whole address, so a caller can't name a thread in one exploration while
    ;; addressing another — the mismatch the exploration-scoped route had to guard against isn't
    ;; expressible here. Perms ride the thread's parent exploration (see the permissions test).
    (mt/with-temp [:model/User u {:email "rs-404@example.com"}]
      (mt/user-http-request u :post 404 "exploration/thread/9999999/restart"))))

(deftest exploration-get-permissions-test
  (testing "Only the creator (or a superuser) can GET an exploration"
    (mt/with-temp [:model/User owner {:email "p-owner@example.com"}
                   :model/User other {:email "p-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration"
                                            {:name "private"
                                             :collection_id (:id (collection/user->personal-collection (:id owner)))})]
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
                             :dimension_mappings [{:dimension_id (duid "plan")   :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}]}
                            {:card_id (:id signups)
                             :dimension_mappings [{:dimension_id (duid "plan")   :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
                                                  {:dimension_id (duid "channel") :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}]}]
                  :dimensions [{:dimension_id (duid "plan")} {:dimension_id (duid "channel")}]}
            resp     (create-exploration! u body)
            all-queries (-> resp :threads first :queries)
            ;; ignore extra planner variants (e.g. top-n-other); the matrix is the base
            ;; "default" queries
            queries  (filter #(= "default" (:query_type %)) all-queries)]
        (is (= 3 (count queries))
            "revenue×plan, signups×plan, signups×channel — revenue×channel is dropped")
        (is (= #{[(:id revenue) (duid "plan")]
                 [(:id signups) (duid "plan")]
                 [(:id signups) (duid "channel")]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (= (range (count all-queries)) (sort (map :position all-queries)))
            "positions are sequential with no gaps from filtered pairs")))))

(deftest exploration-create-names-queries-by-metric-and-dimension-test
  (testing "POST / sets each query's name to '{metric} by {dimension}' using the dimension's display_name"
    (mt/with-temp [:model/User u {:email "naming@example.com"}
                   :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")]
      (let [body {:name "naming"
                  :metrics    [{:card_id (:id revenue)
                                :dimension_mappings [{:dimension_id (duid "country") :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :category_id)]}
                                                     {:dimension_id (duid "no-name") :table_id (mt/id :venues) :target ["field" {} (mt/id :venues :price)]}]}]
                  :dimensions [{:dimension_id (duid "country") :display_name "Country"}
                               {:dimension_id (duid "no-name")}]}
            resp     (create-exploration! u body)
            ;; base "default" query carries the plain '{metric} by {dimension}' name;
            ;; variants like top-n-other add suffixes, so look only at the default queries
            queries  (filter #(= "default" (:query_type %)) (-> resp :threads first :queries))
            by-dim   (into {} (map (juxt :dimension_id :name) queries))]
        (is (= "Revenue by Country" (get by-dim (duid "country")))
            "uses the metric Card name and the dimension's display_name")
        (is (= (str "Revenue by " (duid "no-name")) (get by-dim (duid "no-name")))
            "falls back to dimension_id when display_name is absent")))))

(deftest exploration-create-disambiguates-same-named-dimensions-test
  (testing "POST / qualifies same-named dimensions with their group's display name"
    ;; Suppress the post-insert dimension auto-sync so our fixture dims survive on the Card —
    ;; the after-insert sync would otherwise overwrite them with computed venue-table dims.
    (with-redefs [card/*syncing-metric-dimensions* true]
      (let [users-created  "00000000-0000-0000-0000-00000000aaaa"
            orders-created "00000000-0000-0000-0000-00000000bbbb"
            users-country  "00000000-0000-0000-0000-00000000cccc"]
        (mt/with-temp
          [:model/User u {:email "ambig@example.com"}
           :model/Card revenue (assoc (valid-metric-card (:id u))
                                      :name "Revenue"
                                      :dimensions
                                      [{:id users-created  :name "CREATED_AT" :display-name "Created At"
                                        :group {:id "g-users"  :type "main"       :display-name "Users"}}
                                       {:id orders-created :name "CREATED_AT" :display-name "Created At"
                                        :group {:id "g-orders" :type "connection" :display-name "Orders"}}
                                       {:id users-country  :name "COUNTRY"    :display-name "Country"
                                        :group {:id "g-users"  :type "main"       :display-name "Users"}}])]
          (testing "two dims sharing a display_name → both dimension_names get the group prefix"
            (let [body {:name "ambig"
                        :metrics    [{:card_id (:id revenue)
                                      :dimension_mappings
                                      [{:dimension_id users-created  :table_id 1 :target ["field" {} 1]}
                                       {:dimension_id orders-created :table_id 1 :target ["field" {} 2]}]}]
                        :dimensions [{:dimension_id users-created  :display_name "Created At"}
                                     {:dimension_id orders-created :display_name "Created At"}]}
                  ;; :dimension_name is the API-computed dimension label (with disambiguation).
                  ;; The full query :name stored in DB is plain "Revenue by Created At".
                  by-dim (->> (create-exploration! u body)
                              :threads first :queries
                              (into {} (map (juxt :dimension_id :dimension_name))))]
              (is (= "Users → Created At"  (get by-dim users-created)))
              (is (= "Orders → Created At" (get by-dim orders-created)))))
          (testing "distinct display_names → no qualification"
            (let [body {:name "no-ambig"
                        :metrics    [{:card_id (:id revenue)
                                      :dimension_mappings
                                      [{:dimension_id users-created :table_id 1 :target ["field" {} 1]}
                                       {:dimension_id users-country :table_id 1 :target ["field" {} 3]}]}]
                        :dimensions [{:dimension_id users-created :display_name "Created At"}
                                     {:dimension_id users-country :display_name "Country"}]}
                  by-dim (->> (create-exploration! u body)
                              :threads first :queries
                              (into {} (map (juxt :dimension_id :dimension_name))))]
              (is (= "Created At" (get by-dim users-created)))
              (is (= "Country"    (get by-dim users-country)))))
          (testing "single dim → no qualification even when it has a group"
            (let [body {:name "single"
                        :metrics    [{:card_id (:id revenue)
                                      :dimension_mappings
                                      [{:dimension_id users-created :table_id 1 :target ["field" {} 1]}]}]
                        :dimensions [{:dimension_id users-created :display_name "Created At"}]}
                  q    (-> (create-exploration! u body)
                           :threads first :queries first)]
              (is (= "Created At" (:dimension_name q))))))))))

(deftest exploration-create-name-falls-back-without-group-test
  (testing "POST / leaves ambiguous dims unqualified when neither has a known :group (no NPE / no malformed name)"
    (mt/with-temp
      [:model/User u {:email "no-group@example.com"}
       ;; `:dimensions` left absent (nil) — represents pre-existing Cards without computed groups.
       :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")]
      (let [body {:name "no-group"
                  :metrics    [{:card_id (:id revenue)
                                :dimension_mappings
                                [{:dimension_id (duid "a") :table_id 1 :target ["field" {} 1]}
                                 {:dimension_id (duid "b") :table_id 1 :target ["field" {} 2]}]}]
                  :dimensions [{:dimension_id (duid "a") :display_name "Created At"}
                               {:dimension_id (duid "b") :display_name "Created At"}]}
            queries (-> (mt/user-http-request u :post 200 "exploration" body)
                        :threads first :queries)]
        (is (every? #(= "Revenue by Created At" (:name %)) queries)
            "falls back to plain display_name when no :group is available")))))

(deftest exploration-get-attaches-dimension-name-test
  (testing "hydrate-exploration assoc's :dimension_name onto each query using the dim's display_name"
    (mt/with-temp [:model/User u {:email "dim-name@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [body {:name "dim-name"
                  :metrics    [{:card_id (:id metric)
                                :dimension_mappings
                                [{:dimension_id (duid "country") :table_id 1 :target ["field" {} 1]}
                                 {:dimension_id (duid "no-name") :table_id 1 :target ["field" {} 2]}]}]
                  :dimensions [{:dimension_id (duid "country") :display_name "Country"}
                               {:dimension_id (duid "no-name")}]}
            by-dim (->> (create-exploration! u body)
                        :threads first :queries
                        (into {} (map (juxt :dimension_id :dimension_name))))]
        (is (= "Country" (get by-dim (duid "country")))
            "ships the dim's display_name as :dimension_name when unambiguous")
        (is (= (duid "no-name") (get by-dim (duid "no-name")))
            "falls back to dimension_id when display_name is missing")))))

(deftest exploration-get-dimension-name-disambiguates-test
  (testing "hydrate-exploration prefixes :dimension_name with the dim's group when two dims share a display_name"
    ;; Suppress the post-insert dimension auto-sync so our fixture dims survive on the Card —
    ;; the after-insert sync would otherwise overwrite them with computed venue-table dims.
    (with-redefs [card/*syncing-metric-dimensions* true]
      (let [users-created  "00000000-0000-0000-0000-00000000dddd"
            orders-created "00000000-0000-0000-0000-00000000eeee"
            users-country  "00000000-0000-0000-0000-00000000ffff"]
        (mt/with-temp
          [:model/User u {:email "dim-name-ambig@example.com"}
           :model/Card metric (assoc (valid-metric-card (:id u))
                                     :dimensions
                                     [{:id users-created  :name "CREATED_AT" :display-name "Created At"
                                       :group {:id "g-users"  :type "main"       :display-name "Users"}}
                                      {:id orders-created :name "CREATED_AT" :display-name "Created At"
                                       :group {:id "g-orders" :type "connection" :display-name "Orders"}}
                                      {:id users-country  :name "COUNTRY"    :display-name "Country"
                                       :group {:id "g-users"  :type "main"       :display-name "Users"}}])]
          (testing "shared display_name → both :dimension_names carry the group prefix"
            (let [body   {:name "ambig"
                          :metrics    [{:card_id (:id metric)
                                        :dimension_mappings
                                        [{:dimension_id users-created  :table_id 1 :target ["field" {} 1]}
                                         {:dimension_id orders-created :table_id 1 :target ["field" {} 2]}]}]
                          :dimensions [{:dimension_id users-created  :display_name "Created At"}
                                       {:dimension_id orders-created :display_name "Created At"}]}
                  by-dim (->> (create-exploration! u body)
                              :threads first :queries
                              (into {} (map (juxt :dimension_id :dimension_name))))]
              (is (= "Users → Created At"  (get by-dim users-created)))
              (is (= "Orders → Created At" (get by-dim orders-created)))))
          (testing "distinct display_names → no qualification"
            (let [body   {:name "no-ambig"
                          :metrics    [{:card_id (:id metric)
                                        :dimension_mappings
                                        [{:dimension_id users-created :table_id 1 :target ["field" {} 1]}
                                         {:dimension_id users-country :table_id 1 :target ["field" {} 3]}]}]
                          :dimensions [{:dimension_id users-created :display_name "Created At"}
                                       {:dimension_id users-country :display_name "Country"}]}
                  by-dim (->> (create-exploration! u body)
                              :threads first :queries
                              (into {} (map (juxt :dimension_id :dimension_name))))]
              (is (= "Created At" (get by-dim users-created)))
              (is (= "Country"    (get by-dim users-country)))))))))) ; binding+let+with-temp+testing+deftest

(deftest exploration-get-includes-interestingness-on-queries-test
  (testing "GET /:id hydrates both interestingness scores on each nested query"
    (mt/with-temp [:model/User u {:email "get-score@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (create-exploration! u
                                      {:name "get-score"
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            eid (:id resp)
            qid (-> resp :threads first :queries first :id)
            fetch-query (fn []
                          (-> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                              :threads first :queries first))]
        (testing "fresh query: scores nil (no result row)"
          (let [q (fetch-query)]
            (is (contains? q :interestingness_score))
            (is (nil? (:interestingness_score q)))
            (is (contains? q :contextual_interestingness_score))
            (is (nil? (:contextual_interestingness_score q)))
            (is (contains? q :row_count))
            (is (nil? (:row_count q)))))
        (testing "after a result row is inserted, both scores surface via hydration"
          (let [sr-id (first (t2/insert-returning-pks! :model/StoredResult
                                                       ;; Production-shaped: real query + unrestricted
                                                       ;; token, so the derived-data gate admits the
                                                       ;; creator on their current perms.
                                                       {:result_data       (byte-array [0])
                                                        :row_count         37
                                                        :creator_id        (:id u)
                                                        :database_id       (mt/id)
                                                        :dataset_query     (:dataset_query metric)
                                                        :data_access_token {}}))]
            (t2/insert! :model/ExplorationQueryResult
                        {:exploration_query_id             qid
                         :stored_result_id                 sr-id
                         :interestingness_score            0.42
                         :contextual_interestingness_score 0.83}))
          (let [q (fetch-query)]
            (is (= 0.42 (:interestingness_score q)))
            (is (= 0.83 (:contextual_interestingness_score q)))
            (is (= 37 (:row_count q)) "row_count hydrates from the linked stored_result")))))))

(defn- store-fake-result!
  "Insert a StoredResult holding the worker-serialized bytes plus an ExplorationQueryResult
  that points at it, mirroring what the runner produces so the read endpoints can replay it.
  Stamps `creator_id`, `dataset_query`, `database_id`, and an unrestricted (`{}`) `data_access_token`
  as the real runner does for a user with full data access, so the cached-read gate sees a
  production-shaped snapshot and admits the creator on their *current* perms (not on being the
  creator, which is no longer a bypass)."
  [query-id qp-result]
  (let [bytes         (qp.core/do-with-serialization
                       (fn [in result-fn]
                         (in qp-result)
                         (result-fn)))
        card-id       (t2/select-one-fn :card_id :model/ExplorationQuery :id query-id)
        ;; The metric Card's own query — a real, runnable query with a source table the creator can
        ;; query. The finalized ExplorationQuery.dataset_query is nil for these fake-dimension rows,
        ;; and the gate needs a query it can resolve source tables from to compare the lens.
        dataset-query (t2/select-one-fn :dataset_query :model/Card :id card-id)
        creator-id    (t2/select-one-fn :creator_id :model/Exploration
                                        {:select [:e.creator_id]
                                         :from   [[:exploration :e]]
                                         :join   [[:exploration_thread :t] [:= :t.exploration_id :e.id]
                                                  [:exploration_query :q]  [:= :q.exploration_thread_id :t.id]]
                                         :where  [:= :q.id query-id]})
        sr-id         (first (t2/insert-returning-pks!
                              :model/StoredResult
                              {:result_data       bytes
                               :creator_id        creator-id
                               :database_id       (mt/id)
                               :dataset_query     dataset-query
                               :data_access_token {}}))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :stored_result_id     sr-id})))

(defn- mark-done! [query-id]
  (t2/update! :model/ExplorationQuery query-id {:status "done"}))

(deftest exploration-query-result-streams-stored-result-test
  (testing "GET /query/:id streams the stored worker result as JSON"
    (mt/with-temp [:model/User u {:email "result@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp     (create-exploration! u
                                          {:name "result"
                                           :metrics [{:card_id (:id metric)
                                                      :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                           :dimensions [{:dimension_id (duid "d1")}]})
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
      (let [resp (create-exploration! u
                                      {:name "pending"
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            qid  (-> resp :threads first :queries first :id)
            body (mt/user-http-request u :get 409 (format "exploration/query/%d" qid))]
        (is (= "pending" (:status body)))
        (is (= qid (:id body)))))))

(deftest exploration-query-result-permissions-test
  (testing "GET /query/:id enforces the parent exploration's read check"
    (mt/with-temp [:model/User owner {:email "qr-owner@example.com"}
                   :model/User other {:email "qr-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (create-exploration! owner
                                      {:name "qr-private"
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request other :get 403 (format "exploration/query/%d" qid))))))

(deftest exploration-page-starred-roundtrip-test
  (testing "PUT /page/:id/starred sets the flag both ways; reflected in GET /:id"
    (mt/with-temp [:model/User u {:email "page-mark@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (create-exploration! u
                                      {:name "page-mark"
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            eid     (:id resp)
            page-id (-> resp :threads first :blocks first :pages first :id)
            fetch-page (fn []
                         (-> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                             :threads first :blocks first :pages first))]
        (testing "fresh page defaults to not starred"
          (is (false? (:starred (fetch-page)))))
        (testing "PUT :starred true stars the page"
          (mt/user-http-request u :put 204 (format "exploration/page/%d/starred" page-id) {:starred true})
          (is (true? (:starred (fetch-page)))))
        (testing "PUT :starred false unstars the page"
          (mt/user-http-request u :put 204 (format "exploration/page/%d/starred" page-id) {:starred false})
          (is (false? (:starred (fetch-page)))))))))

(deftest exploration-page-starred-permissions-test
  (testing "PUT /page/:id/starred enforces write-check — non-owner gets 403"
    (mt/with-temp [:model/User owner {:email "page-mp-owner@example.com"}
                   :model/User other {:email "page-mp-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (create-exploration! owner
                                      {:name "page-mark-private"
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            page-id (-> resp :threads first :blocks first :pages first :id)]
        (mt/user-http-request other :put 403 (format "exploration/page/%d/starred" page-id) {:starred true})))))

(deftest exploration-page-starred-404-test
  (testing "PUT on a nonexistent page id returns 404"
    (mt/with-temp [:model/User u {:email "page-mark-404@example.com"}]
      (mt/user-http-request u :put 404 "exploration/page/9999999/starred" {:starred true}))))

(deftest exploration-page-hidden-roundtrip-test
  (testing "PUT /pages/hidden sets the flag both ways; reflected in GET /:id"
    (mt/with-temp [:model/User u {:email "page-hide@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (create-exploration! u
                                      {:name "page-hide"
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            eid     (:id resp)
            page-id (-> resp :threads first :blocks first :pages first :id)
            fetch-page (fn []
                         (-> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                             :threads first :blocks first :pages first))]
        (testing "fresh page defaults to not hidden"
          (is (false? (:hidden (fetch-page)))))
        (testing "PUT :hidden true hides the page"
          (mt/user-http-request u :put 204 "exploration/pages/hidden" {:page_ids [page-id] :hidden true})
          (is (true? (:hidden (fetch-page)))))
        (testing "PUT :hidden false unhides the page"
          (mt/user-http-request u :put 204 "exploration/pages/hidden" {:page_ids [page-id] :hidden false})
          (is (false? (:hidden (fetch-page)))))))))

(deftest exploration-pages-hidden-bulk-test
  (testing "PUT /pages/hidden hides every page id it is given in one call"
    (mt/with-temp [:model/User u {:email "pages-hide-bulk@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (create-exploration! u
                                      {:name "pages-hide-bulk"
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}
                                                                       {:dimension_id (duid "d2") :table_id 1 :target ["field" {} 2]}]}]
                                       :dimensions [{:dimension_id (duid "d1")} {:dimension_id (duid "d2")}]})
            eid      (:id resp)
            page-ids (->> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                          :threads first :blocks (mapcat :pages) (map :id))
            hidden?  (fn []
                       (->> (mt/user-http-request u :get 200 (format "exploration/%d" eid))
                            :threads first :blocks (mapcat :pages) (map :hidden)))]
        (is (<= 2 (count page-ids)) "sanity: exploration has multiple pages to bulk-hide")
        (mt/user-http-request u :put 204 "exploration/pages/hidden" {:page_ids (vec page-ids) :hidden true})
        (is (every? true? (hidden?)))))))

(deftest exploration-page-hidden-permissions-test
  (testing "PUT /pages/hidden enforces write-check — non-owner gets 403"
    (mt/with-temp [:model/User owner {:email "page-hide-owner@example.com"}
                   :model/User other {:email "page-hide-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (create-exploration! owner
                                      {:name "page-hide-private"
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))
                                       :metrics [{:card_id (:id metric)
                                                  :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                       :dimensions [{:dimension_id (duid "d1")}]})
            page-id (-> resp :threads first :blocks first :pages first :id)]
        (mt/user-http-request other :put 403 "exploration/pages/hidden" {:page_ids [page-id] :hidden true})))))

(deftest exploration-page-hidden-404-test
  (testing "PUT with a nonexistent page id returns 404"
    (mt/with-temp [:model/User u {:email "page-hide-404@example.com"}]
      (mt/user-http-request u :put 404 "exploration/pages/hidden" {:page_ids [9999999] :hidden true}))))

(deftest exploration-explore-further-creates-filtered-thread-test
  (testing "POST /:id/explore-further copies the clicked block into a new filtered thread"
    (mt/with-temp [:model/User u {:email "explore-further@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Number of venues")
                   :model/Timeline tl {:creator_id (:id u) :name "Releases"}]
      (let [filter-value 2
            field-ref    ["field" {} (mt/id :venues :price)]
            body         {:name         "base drill"
                          :prompt       "why down?"
                          :metrics      [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                          :dimensions   [{:dimension_id (duid "category") :display_name "Category"}
                                         {:dimension_id (duid "price")    :display_name "Price"}]
                          :timeline_ids [(:id tl)]}
            created      (create-exploration! u body)
            expl-id      (:id created)
            orig-thread  (-> created :threads first)
            page-id      (some :id (filter #(str/includes? (:name %) "Price")
                                           (-> created :threads first :blocks first :pages)))
            explore-body {:page_id         page-id
                          :explore_filters [{:field_ref field-ref
                                             :value filter-value
                                             :display_value "2"}]}
            hydrated     (explore-further-and-hydrate! u expl-id page-id (:explore_filters explore-body))
            threads      (sort-by :position (:threads hydrated))
            [orig new]   threads
            new-block    (-> new :blocks first)
            new-queries  (:queries new)]
        (is (= 2 (count threads)) "explore-further adds a thread; restart would keep 1")
        (is (= (:id orig-thread) (:id orig)))
        (is (= 1 (:position new)))
        (testing "the drill thread records the page it was drilled from (sidebar nesting)"
          (is (= page-id (:source_page_id new)))
          (is (nil? (:source_page_id orig))))
        (is (= "Number of venues → Price: 2" (:name new))
            "thread name uses Metric → Column: Value for top-level follow-ups")
        (testing "new block copies type/dimensions and appends explore_filters onto metrics"
          (let [persisted (t2/select-one :model/ExplorationBlock :exploration_thread_id (:id new))]
            (is (= "metric" (:type new-block)))
            (is (= [(duid "category") (duid "price")] (mapv :dimension-id (:dimensions persisted))))
            (let [persisted-filters (:explore_filters (first (:metrics persisted)))]
              (is (= 1 (count persisted-filters)))
              (is (= filter-value (:value (first persisted-filters))))
              (is (= "Price" (:dimension_name (first persisted-filters))))
              (is (contains? (first persisted-filters) :display_value)))))
        (testing "filtered blocks expose explore_filters on the block node and unprefixed page names"
          (let [price-page (some #(when (str/includes? (:name %) "Price") %) (:pages new-block))]
            (is (some? price-page))
            (is (= [{:field_ref      field-ref
                     :value          filter-value
                     :dimension_name "Price"
                     :display_value  "2"}]
                   (map #(select-keys % [:field_ref :value :dimension_name :display_value])
                        (:explore_filters new-block)))
                "block node echoes persisted explore_filters")
            (is (str/includes? (:name price-page) "Price")
                "page short name is heading-relative, without the clicked value prefix")
            (is (= "Number of venues by Price" (:long_name price-page)))))
        (testing "timelines are copied from the source thread"
          (is (= 1 (count (:timelines new))))
          (is (= (:id tl) (-> new :timelines first :timeline_id))))
        (testing "every finalized query inherits the explore filter"
          (is (pos? (count new-queries)))
          (is (every? #(some (fn [fname]
                               (and (str/includes? fname "Price")
                                    (str/includes? fname (str filter-value))))
                             (filter-display-names (:dataset_query %)))
                      new-queries)))))))

(deftest exploration-explore-further-enqueues-planning-test
  (testing "POST /:id/explore-further enqueues a plan message for the new follow-up thread"
    ;; Regression: the endpoint stamped `started_at` but never called `start-thread!`, so under the
    ;; persistent-queue model the follow-up thread was created and marked started yet never planned —
    ;; "Explore further" returned 200 and then did nothing. `started_at` is only a state marker; the
    ;; plan message enqueued by `start-thread!` is what actually triggers planning (see
    ;; `metabase.explorations.queues`).
    (mt/with-temp [:model/User u {:email "explore-further-enqueue@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Number of venues")]
      (let [body     {:name       "base drill"
                      :prompt     "why down?"
                      :metrics    [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                      :dimensions [{:dimension_id (duid "category") :display_name "Category"}
                                   {:dimension_id (duid "price")    :display_name "Price"}]}
            created  (create-exploration! u body)
            expl-id  (:id created)
            page-id  (some :id (filter #(str/includes? (:name %) "Price")
                                       (-> created :threads first :blocks first :pages)))
            enqueued (atom [])]
        (with-redefs [explorations.queues/start-thread! (fn [tid] (swap! enqueued conj tid))]
          (mt/user-http-request u :post 200 (format "exploration/%d/explore-further" expl-id)
                                {:page_id         page-id
                                 :explore_filters [{:field_ref     ["field" {} (mt/id :venues :price)]
                                                    :value         2
                                                    :display_value "2"}]}))
        (let [new-thread-id (->> (t2/select :model/ExplorationThread
                                            :exploration_id expl-id
                                            {:order-by [[:position :desc] [:id :desc]]})
                                 first :id)]
          (is (= [new-thread-id] @enqueued)
              "explore-further must enqueue planning for the new thread via start-thread!"))))))

(deftest exploration-explore-further-permissions-and-404-test
  (testing "POST /:id/explore-further enforces write-check and 404s unknown pages"
    (mt/with-temp [:model/User owner {:email "ef-owner@example.com"}
                   :model/User other {:email "ef-other@example.com"}
                   :model/Card metric (venues-metric-card (:id owner))]
      (let [resp (create-exploration! owner
                                      {:name         "private drill"
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))
                                       :metrics      [{:card_id (:id metric) :dimension_mappings (venues-dimension-mappings)}]
                                       :dimensions   [{:dimension_id (duid "category") :display_name "Category"}]})
            expl-id (:id resp)
            page-id (-> resp :threads first :blocks first :pages first :id)
            body    {:page_id         page-id
                     :explore_filters [{:field_ref ["field" {} (mt/id :venues :category_id)] :value 1}]}]
        (mt/user-http-request other :post 403 (format "exploration/%d/explore-further" expl-id) body)
        (mt/user-http-request owner :post 404 (format "exploration/%d/explore-further" expl-id)
                              (assoc body :page_id 9999999))
        (testing "an empty explore_filters is rejected — it would just clone the source thread unscoped"
          (mt/user-http-request owner :post 400 (format "exploration/%d/explore-further" expl-id)
                                (assoc body :explore_filters [])))))))

(deftest exploration-cascade-delete-test
  (testing "Deleting an exploration cascades to threads, selections, and queries"
    (mt/with-temp [:model/User u {:email "cd@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name         "cascade"
                                        :timeline_ids [(:id tl)]
                                        :blocks       [{:name       "Group"
                                                        :metrics    [{:card_id (:id metric)
                                                                      :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                                        :dimensions [{:dimension_id (duid "d1")}]}]})
            eid  (:id resp)
            tid  (-> resp :threads first :id)]
        (t2/delete! :model/Exploration :id eid)
        (is (zero? (t2/count :model/ExplorationThread :exploration_id eid)))
        (is (zero? (t2/count :model/ExplorationBlock :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id tid)))))))

(deftest exploration-http-delete-returns-204-test
  (testing "DELETE /api/exploration/:id returns 204 and removes the row — guards a malli regression where returning the Ring response map `generic-204-no-content` instead of literal `nil` made the `:- :nil` schema reject the response and yield a 400"
    (mt/with-temp [:model/User u {:email "http-delete@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "http-delete"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id (duid "d1")}]})
            eid  (:id resp)]
        ;; Live exploration: delete via HTTP.
        (mt/user-http-request u :delete 204 (format "exploration/%d" eid))
        (is (false? (t2/exists? :model/Exploration :id eid))))
      (testing "archived (trashed) exploration deletes via HTTP DELETE with the same status — the trash → permanently-delete path the user reported as 400"
        (let [resp2 (mt/user-http-request u :post 200 "exploration"
                                          {:name "trash-then-delete"
                                           :metrics [{:card_id (:id metric)
                                                      :dimension_mappings [{:dimension_id (duid "d1") :table_id 1 :target ["field" {} 1]}]}]
                                           :dimensions [{:dimension_id (duid "d1")}]})
              eid2  (:id resp2)]
          (mt/user-http-request u :put 200 (format "exploration/%d" eid2) {:archived true})
          (mt/user-http-request u :delete 204 (format "exploration/%d" eid2))
          (is (false? (t2/exists? :model/Exploration :id eid2))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    blocks-tree (pure fn)                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- pages-of [block] (:pages block))
(defn- page-by-id [tree] (into {} (mapcat (fn [b] (map (juxt :id identity) (pages-of b)))) tree))

(deftest blocks-tree-emits-blocks-and-pages-test
  (testing "Each block becomes a node; each of its pages bundles that page's queries by page_id"
    (let [blocks  [{:id 1 :metrics [{:card_id 10}]} {:id 2 :metrics [{:card_id 20}]}]
          pages   [{:id 100 :exploration_block_id 1 :card_id 10 :dimension_id (duid "d1") :query_type "default" :hidden false}
                   {:id 101 :exploration_block_id 1 :card_id 10 :dimension_id (duid "d2") :query_type "default" :hidden true}
                   {:id 200 :exploration_block_id 2 :card_id 20 :dimension_id (duid "d1") :query_type "default" :hidden false}]
          queries [{:id 1 :page_id 100 :segment_id nil :name "Rev by D1"      :interestingness_score 0.5}
                   {:id 2 :page_id 100 :segment_id 100 :name "Rev by D1 (S1)" :interestingness_score 0.7}
                   {:id 3 :page_id 100 :segment_id 101 :name "Rev by D1 (S2)" :interestingness_score 0.3}
                   {:id 4 :page_id 101 :segment_id nil :name "Rev by D2"      :interestingness_score 0.4}
                   {:id 5 :page_id 200 :segment_id nil :name "Cnt by D1"      :interestingness_score 0.9}]
          tree    (explorations.blocks/blocks-tree blocks pages {10 "Revenue block" 20 "Count block"} queries)
          by-id   (into {} (map (juxt :id identity)) tree)
          p->     (page-by-id tree)]
      (is (= [1 2] (mapv :id tree)) "one node per block, in authoring order")
      (is (= [0 1] (mapv :position tree)) ":position reifies block order")
      (testing "block headings come from the metric card name; all metric-anchored here"
        (is (= "Revenue block" (:name (by-id 1))))
        (is (= "Count block"   (:name (by-id 2))))
        (is (every? #(= "metric" (:type %)) tree)))
      (testing "pages nest under their block (score-sorted)"
        (is (= [100 101] (mapv :id (:pages (by-id 1)))) "page 100 (max 0.7) before page 101 (0.4)")
        (is (= [200]     (mapv :id (:pages (by-id 2))))))
      (testing "page :query_ids bundle that page's queries in input order"
        (is (= [1 2 3] (:query_ids (p-> 100))))
        (is (= [4]     (:query_ids (p-> 101))))
        (is (= [5]     (:query_ids (p-> 200)))))
      (testing "page :position reifies score order within the block"
        (is (= [0 1] (mapv :position (:pages (by-id 1))))))
      (testing "page :hidden is passed through from the persisted page row"
        (is (false? (:hidden (p-> 100))))
        (is (true?  (:hidden (p-> 101))))
        (is (false? (:hidden (p-> 200))))))))

(deftest blocks-tree-positions-test
  (testing "blocks in authoring order; pages within a block score-sorted; positions reified"
    (let [blocks  [{:id 10} {:id 20}]
          pages   [{:id 1 :exploration_block_id 10 :card_id 1 :dimension_id (duid "d1") :query_type "default"}
                   {:id 2 :exploration_block_id 10 :card_id 1 :dimension_id (duid "d2") :query_type "default"}
                   {:id 3 :exploration_block_id 20 :card_id 2 :dimension_id (duid "d1") :query_type "default"}]
          queries [{:id 1 :page_id 1 :segment_id nil :name "Rev by D1" :interestingness_score 0.9}
                   {:id 2 :page_id 2 :segment_id nil :name "Rev by D2" :interestingness_score 0.4}
                   {:id 3 :page_id 3 :segment_id nil :name "Cnt by D1" :interestingness_score 0.8}]
          tree    (explorations.blocks/blocks-tree blocks pages {} queries)]
      (is (= [10 20] (mapv :id tree)))
      (is (= [0 1]   (mapv :position tree)))
      (is (= [[1 2] [3]] (mapv (fn [b] (mapv :id (:pages b))) tree))
          "block 10 pages [1 (0.9) then 2 (0.4)]; block 20 page [3]"))))

(deftest blocks-tree-page-name-generated-from-parts-test
  (testing "page names are generated from the metric + dimension (+ variant), independent of the query :name"
    (let [blocks  [{:id 5 :metrics [{:card_id 10}]}]
          pages   [{:id 1 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d1") :query_type "default"}]
          queries [{:id 1 :page_id 1 :segment_id nil :dimension_name "Price" :name "some stored query name"}]
          [block] (explorations.blocks/blocks-tree blocks pages {10 "Revenue"} queries)
          [page]  (:pages block)]
      (is (= "Revenue" (:name block)))
      (is (= "Price" (:name page))
          "short name drops the metric, which the block heading already shows")
      (is (= "Revenue by Price" (:long_name page))
          "long name is self-describing — metric + dimension"))))

(deftest blocks-tree-explore-further-naming-test
  (testing "filtered blocks expose explore_filters on the block node with unprefixed page names"
    (let [filters [{:field_ref      ["field" {} 1]
                    :value          "texas"
                    :dimension_name "State"
                    :display_value  "Texas"}
                   {:field_ref      ["field" {} 2]
                    :value          "2024"
                    :dimension_name "Year"
                    :display_value  "2024"}]
          blocks  [{:id 5 :metrics [{:card_id 10 :explore_filters filters}]}]
          pages   [{:id 1 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d1") :query_type "default"}]
          queries [{:id 1 :page_id 1 :segment_id nil :dimension_name "Category" :name "stored name"}]
          [block] (explorations.blocks/blocks-tree blocks pages {10 "Orders"} queries)
          [page]  (:pages block)]
      (is (= filters (:explore_filters block))
          "block node carries the complete explore_filters list")
      (is (= "Category" (:name page))
          "page short name is heading-relative, without the clicked value prefix")
      (is (= "Orders by Category" (:long_name page))
          "long name stays self-describing"))))

(deftest blocks-tree-page-sort-prefers-contextual-test
  (testing "page sort uses contextual_interestingness_score when present, else interestingness_score"
    (let [blocks  [{:id 5}]
          pages   [{:id 1 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d1") :query_type "default"}
                   {:id 2 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d2") :query_type "default"}]
          queries [{:id 1 :page_id 1 :segment_id nil :dimension_name "D1"
                    :interestingness_score 0.95 :contextual_interestingness_score 0.2}
                   {:id 2 :page_id 2 :segment_id nil :dimension_name "D2"
                    :interestingness_score 0.1 :contextual_interestingness_score 0.85}]
          [block] (explorations.blocks/blocks-tree blocks pages {} queries)]
      (is (= [2 1] (mapv :id (:pages block)))
          "page 2 (effective 0.85 contextual) sorts above page 1 (0.2), not by 0.95 heuristic"))))

(deftest blocks-tree-page-sort-order-test
  (testing "pages within a block sort by max interestingness desc; nil-score pages last"
    (let [blocks  [{:id 5}]
          pages   [{:id 1 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d1") :query_type "default"}
                   {:id 2 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d2") :query_type "default"}
                   {:id 3 :exploration_block_id 5 :card_id 10 :dimension_id (duid "d3") :query_type "default"}]
          queries [{:id 1 :page_id 1 :segment_id nil :dimension_name "D1" :interestingness_score 0.4}
                   {:id 2 :page_id 2 :segment_id nil :dimension_name "D2" :interestingness_score 0.9}
                   {:id 3 :page_id 3 :segment_id nil :dimension_name "D3" :interestingness_score nil}]
          [block] (explorations.blocks/blocks-tree blocks pages {} queries)]
      (is (= [2 1 3] (mapv :id (:pages block))) "high (0.9), mid (0.4), then nil-score last")
      (is (= [0 1 2] (mapv :position (:pages block))) ":position reifies the sorted order"))))

(deftest blocks-tree-empty-input-test
  (testing "No blocks returns an empty vector (no nil)"
    (is (= [] (explorations.blocks/blocks-tree [] [] {} [])))
    (is (= [] (explorations.blocks/blocks-tree [] [] {} [{:id 1 :page_id 1}]))))
  (testing "a block with no pages still emits its node with empty :pages"
    (let [[block] (explorations.blocks/blocks-tree [{:id 7}] [] {} [])]
      (is (= 7 (:id block)))
      (is (= [] (:pages block))))))

(deftest exploration-get-includes-blocks-and-pages-test
  (testing "GET /:id attaches nested :blocks → :pages to each thread"
    (mt/with-temp [:model/User u {:email "groups@example.com"}
                   :model/Card metric (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Segment _seg-a {:name "alpha"
                                          :table_id (mt/id :venues)
                                          :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 1)))))}
                   :model/Segment _seg-b {:name "beta"
                                          :table_id (mt/id :venues)
                                          :definition (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 4)))))}]
      (let [body {:name "groups"
                  :metrics    [{:card_id (:id metric)
                                :dimension_mappings (venues-dimension-mappings)}]
                  :dimensions [{:dimension_id (duid "category") :display_name "Category"}
                               {:dimension_id (duid "price")    :display_name "Price"}]}
            resp      (create-exploration! u body)
            {eid :id} resp
            resp      (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread    (-> resp :threads first)
            queries   (:queries thread)
            blocks    (:blocks thread)
            block-id  (t2/select-one-pk :model/ExplorationBlock
                                        :exploration_thread_id (:id thread))
            pages     (mapcat :pages blocks)]
        (is (= 9 (count queries))
            "category (default+top-n-other) × 3 + price (default) × 3 = 9 queries")
        (testing "one metric-anchored block"
          (is (= 1 (count blocks)))
          (let [[b] blocks]
            (is (= "Revenue" (:name b)) "metric-anchored heading is the metric name")
            (is (= "metric" (:type b)))
            (is (= block-id (:id b)) "block node id is the persisted block PK")
            (is (= 0 (:position b)))))
        (testing "pages partition the queries by (card, dim, query_type)"
          ;; category → default + top-n-other = 2 pages; price → default = 1 page
          (is (= 3 (count pages)))
          (let [all-member-ids (mapcat :query_ids pages)]
            (is (= (count queries) (count all-member-ids)) "no query double-counted")
            (is (= (set (map :id queries)) (set all-member-ids)) "every query on some page")))
        (testing "each page bundles a single (card, dim) partition"
          (let [qid->q (into {} (map (juxt :id identity)) queries)]
            (doseq [p pages]
              (let [members  (map qid->q (:query_ids p))
                    pair-set (set (map (juxt :card_id :dimension_id) members))]
                (is (= 1 (count pair-set))
                    (str "page " (:id p) " bundles a single (card, dim) partition"))))))
        (testing "pages are named '<dimension> <variant>', the variant qualifier distinguishing same-dimension pages"
          (is (= #{"Category" "Category (Top values + Other)" "Price"}
                 (set (map :name pages))))
          (is (= 2 (count (filter #(str/includes? (:name %) "Category") pages)))
              "category's default and top-n-other are distinct, separately-named pages"))
        (testing "page :position is 0..N-1 within the block"
          (is (= (vec (range (count pages))) (sort (map :position pages)))))))))

(deftest exploration-get-multiple-blocks-test
  (testing "Threads with multiple blocks emit one node per block, each with its own pages"
    (mt/with-temp [:model/User u {:email "multi-groups@example.com"}
                   :model/Card m1 (assoc (venues-metric-card (:id u)) :name "Revenue")
                   :model/Card m2 (assoc (venues-metric-card (:id u)) :name "Order count")]
      (let [dims [{:dimension_id (duid "category") :display_name "Category"}
                  {:dimension_id (duid "price")    :display_name "Price"}]
            body {:name "multi"
                  :blocks [{:type       "metric"
                            :metrics    [{:card_id (:id m1) :dimension_mappings (venues-dimension-mappings)}]
                            :dimensions dims}
                           {:type       "metric"
                            :metrics    [{:card_id (:id m2) :dimension_mappings (venues-dimension-mappings)}]
                            :dimensions dims}]}
            {eid :id} (create-exploration! u body)
            resp       (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread     (-> resp :threads first)
            blocks     (:blocks thread)]
        (is (= 2 (count blocks)) "two blocks → two top-level nodes")
        (is (= #{"Revenue" "Order count"} (set (map :name blocks)))
            "metric-anchored headings are the metric names")
        (is (every? #(= "metric" (:type %)) blocks))
        (is (every? #(int? (:id %)) blocks) "block node ids are the persisted block PKs")
        (testing "each block has its own pages (category default+top-n-other + price default = 3)"
          (is (every? #(= 3 (count (:pages %))) blocks)))
        (testing "no query is shared across blocks/pages"
          (let [all (mapcat (fn [b] (mapcat :query_ids (:pages b))) blocks)]
            (is (= (count all) (count (distinct all))))))))))

(deftest exploration-get-empty-thread-has-empty-blocks-test
  (testing "A thread with no queries gets :blocks => []"
    (mt/with-temp [:model/User u {:email "no-groups@example.com"}]
      (let [{eid :id} (mt/user-http-request u :post 200 "exploration" {:name "no-groups"})
            resp      (mt/user-http-request u :get 200 (format "exploration/%d" eid))
            thread    (-> resp :threads first)]
        (is (= [] (:queries thread)))
        (is (= [] (:blocks thread)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       PUT /api/exploration/:id (move)                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest exploration-put-updates-metadata-test
  (testing "PUT /:id updates name/description for the creator"
    (mt/with-temp [:model/Exploration e {:name "old" :creator_id (mt/user->id :rasta)}]
      (let [resp (mt/user-http-request :rasta :put 200 (format "exploration/%d" (:id e))
                                       {:name "new" :description "yo"})]
        (is (= "new" (:name resp)))
        (is (= "yo"  (:description resp)))))))

(deftest exploration-put-ignores-unlisted-columns-test
  (testing "PUT /:id strips request-body keys outside the update schema before `t2/update!`. The
            schema is an open map, so without an allow-list a caller with write access could
            mass-assign protected columns — reassigning `creator_id` (ownership / \"My explorations\"
            attribution) is the sharpest case."
    (mt/with-temp [:model/User owner {:email "owner@example.com"}
                   :model/User thief {:email "thief@example.com"}
                   :model/Exploration e {:name "old" :creator_id (:id owner)}]
      (let [before (t2/select-one :model/Exploration :id (:id e))]
        (mt/user-http-request owner :put 200 (format "exploration/%d" (:id e))
                              {:name       "new"
                               :creator_id (:id thief)
                               :entity_id  "smuggled_entity_id_00"})
        (let [after (t2/select-one :model/Exploration :id (:id e))]
          (is (= "new" (:name after)) "the allow-listed field is still updated")
          (is (= (:id owner) (:creator_id after))
              "creator_id must not be reassignable through the request body")
          (is (= (:entity_id before) (:entity_id after))
              "entity_id must not be overwritable through the request body"))))))

(deftest exploration-create-in-collection-test
  (testing "POST / places the exploration in the requested collection when the caller can write it"
    (mt/with-temp [:model/Collection c {}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) c)
        (let [resp (mt/user-http-request :rasta :post 200 "exploration"
                                         {:name "in-coll" :collection_id (:id c)})]
          (is (= (:id c) (:collection_id resp))))))))

(deftest exploration-create-defaults-to-root-test
  (testing "POST / with no :collection_id leaves the exploration in the root collection"
    (let [resp (mt/user-http-request :rasta :post 200 "exploration" {:name "rootish"})]
      (is (nil? (:collection_id resp))))))

(deftest exploration-create-requires-write-on-collection-test
  (testing "POST / refuses when the caller lacks write on the destination collection"
    (mt/with-temp [:model/Collection c {}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (mt/user-http-request :rasta :post 403 "exploration"
                              {:name "denied" :collection_id (:id c)})))))

(deftest exploration-put-move-to-collection-test
  (testing "PUT /:id can move an exploration into a collection the caller can write"
    (mt/with-temp [:model/Collection c {}
                   :model/Exploration e {:name "to-move" :creator_id (mt/user->id :rasta)}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) c)
        (let [resp (mt/user-http-request :rasta :put 200 (format "exploration/%d" (:id e))
                                         {:collection_id (:id c)})]
          (is (= (:id c) (:collection_id resp))))))))

(deftest exploration-put-move-requires-write-on-destination-test
  (testing "PUT /:id move refuses when caller lacks write on the destination collection"
    (mt/with-temp [:model/Collection c {}
                   :model/Exploration e {:name "no-dest" :creator_id (mt/user->id :rasta)}]
      (mt/with-non-admin-groups-no-collection-perms (:id c)
        (mt/user-http-request :rasta :put 403 (format "exploration/%d" (:id e))
                              {:collection_id (:id c)})))))

(deftest exploration-put-move-requires-write-on-source-collection-test
  (testing "Moving an exploration in a shared collection requires write on the source collection."
    (mt/with-temp [:model/Collection src  {}
                   :model/Collection dest {}
                   :model/Exploration e   {:name          "needs-src"
                                           :creator_id    (mt/user->id :rasta)
                                           :collection_id (:id src)}]
      (mt/with-non-admin-groups-no-collection-perms (:id src)
        (mt/with-non-admin-groups-no-collection-perms (:id dest)
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) dest)
          ;; user has dest write but no src perms — write-check on the exploration
          ;; (which goes through src collection perms) fails first.
          (mt/user-http-request :rasta :put 403 (format "exploration/%d" (:id e))
                                {:collection_id (:id dest)}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Routed-database metrics                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimensions-includes-routed-database-metrics-test
  (when config/ee-available?
    (testing "GET /api/exploration/dimensions includes metrics whose database is a router — routed
              results are gated per-lens on read (see stored_result.data_access_token) rather than
              hidden from the picker"
      (with-sample-metrics-archived
        (mt/with-temp [:model/Card        _ {:name          "Routed Metric"
                                             :type          :metric
                                             :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                       :model/DatabaseRouter _ {:database_id    (mt/id)
                                                :user_attribute "team"}]
          (let [resp  (mt/user-http-request :rasta :get 200 "exploration/dimensions")
                names (set (map :name (:metrics resp)))]
            (is (contains? names "Routed Metric")
                "metric on a router database is selectable in /dimensions")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              POST /api/exploration/thread/:thread-id/cancel                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- minimal-cancel-fixture!
  "Create an Exploration + Thread + N pending ExplorationQuery rows owned by `user-id`, sharing a
  single dummy metric Card. Returns `{:thread-id ..., :eq-ids [...]}`. Cancellation tests don't
  need the full create flow; this skips planning and result writing entirely."
  [user-id n]
  (let [card        (first (t2/insert-returning-instances! :model/Card
                                                           {:name          "cancel-fixture metric"
                                                            :type          :metric
                                                            :creator_id    user-id
                                                            :database_id   (mt/id)
                                                            :display       "table"
                                                            :visualization_settings {}
                                                            :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}))
        exploration (first (t2/insert-returning-instances! :model/Exploration
                                                           {:name       "cancel-fixture"
                                                            :creator_id user-id}))
        thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                           {:exploration_id (:id exploration)
                                                            :position       0
                                                            :started_at     (t/offset-date-time)}))
        group-id    (t2/insert-returning-pk! :model/ExplorationBlock
                                             {:exploration_thread_id (:id thread)})
        eq-ids      (vec (for [i (range n)]
                           (let [page-id (t2/insert-returning-pk! :model/ExplorationPage
                                                                  {:exploration_block_id group-id
                                                                   :card_id              (:id card)
                                                                   :dimension_id         (str "d" i)
                                                                   :query_type           "default"})]
                             (:id (first (t2/insert-returning-instances! :model/ExplorationQuery
                                                                         {:exploration_thread_id (:id thread)
                                                                          :card_id               (:id card)
                                                                          :database_id           (:database_id card)
                                                                          :page_id               page-id
                                                                          :dimension_id          (str "d" i)
                                                                          :dataset_query         (:dataset_query card)
                                                                          :status                "pending"
                                                                          :position              i}))))))]
    {:thread-id (:id thread) :eq-ids eq-ids}))

(deftest thread-cancel-sets-timestamps-and-flips-pending-test
  (testing "POST /thread/:id/cancel stamps canceled_at + completed_at and bulk-flips pending EQs"
    (mt/with-model-cleanup [:model/ExplorationQuery :model/ExplorationThread :model/Exploration :model/Card]
      (let [{:keys [thread-id eq-ids]} (minimal-cancel-fixture! (mt/user->id :rasta) 3)
            resp (mt/user-http-request :rasta :post 200 (str "exploration/thread/" thread-id "/cancel"))]
        (is (= thread-id (:id resp)))
        (is (some? (:canceled_at resp)))
        (is (some? (:completed_at resp)))
        (let [thread (t2/select-one :model/ExplorationThread :id thread-id)]
          (is (some? (:canceled_at thread)))
          (is (some? (:completed_at thread))))
        (is (every? #(= "canceled" %)
                    (map :status (t2/select :model/ExplorationQuery :id [:in eq-ids])))
            "all pending EQs are flipped to canceled")))))

(deftest thread-cancel-idempotent-on-already-canceled-test
  (testing "cancelling an already-canceled thread is a 200 no-op that returns the existing timestamps"
    (mt/with-model-cleanup [:model/ExplorationQuery :model/ExplorationThread :model/Exploration :model/Card]
      (let [{:keys [thread-id]} (minimal-cancel-fixture! (mt/user->id :rasta) 1)
            first-resp  (mt/user-http-request :rasta :post 200 (str "exploration/thread/" thread-id "/cancel"))
            second-resp (mt/user-http-request :rasta :post 200 (str "exploration/thread/" thread-id "/cancel"))]
        (is (= (:canceled_at first-resp) (:canceled_at second-resp))
            "second cancel must not overwrite the original canceled_at — the CAS WHERE clause matched 0 rows")))))

(deftest thread-cancel-idempotent-on-completed-test
  (testing "cancelling a thread whose completed_at is already set (natural finish) is a 200 no-op
            that leaves canceled_at NULL"
    (mt/with-model-cleanup [:model/ExplorationQuery :model/ExplorationThread :model/Exploration :model/Card]
      (let [{:keys [thread-id]} (minimal-cancel-fixture! (mt/user->id :rasta) 1)
            _    (t2/update! :model/ExplorationThread thread-id
                             {:completed_at (t/offset-date-time)})
            resp (mt/user-http-request :rasta :post 200 (str "exploration/thread/" thread-id "/cancel"))]
        (is (nil? (:canceled_at resp))
            "naturally-completed thread keeps canceled_at NULL — cancel was a no-op")
        (is (some? (:completed_at resp))
            "completed_at is still set from the natural finish")))))

(deftest thread-cancel-requires-write-perm-test
  (testing "cancel requires write perm on the parent exploration's collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection coll {:name "cancel-restricted"}
                     :model/Card card {:name          "cancel-perm-fixture"
                                       :type          :metric
                                       :creator_id    (mt/user->id :crowberto)
                                       :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                     :model/Exploration exploration {:name          "cancel-perm-fixture"
                                                     :creator_id    (mt/user->id :crowberto)
                                                     :collection_id (:id coll)}
                     :model/ExplorationThread thread {:exploration_id (:id exploration)
                                                      :position       0
                                                      :started_at     (t/offset-date-time)}
                     :model/ExplorationBlock group {:exploration_thread_id (:id thread)}
                     :model/ExplorationPage page {:exploration_block_id (:id group) :card_id (:id card)
                                                  :dimension_id (duid "d1") :query_type "default"}
                     :model/ExplorationQuery _q {:exploration_thread_id (:id thread)
                                                 :card_id               (:id card)
                                                 :page_id               (:id page)
                                                 :dimension_id          (duid "d1")
                                                 :dataset_query         (:dataset_query card)
                                                 :status                "pending"
                                                 :position              0}]
        ;; Non-admin groups have no root perms (via the wrapper); the fresh Collection grants none.
        ;; :rasta (member of All Users only) gets 403; admin :crowberto bypasses collection perms.
        (mt/user-http-request :rasta :post 403 (str "exploration/thread/" (:id thread) "/cancel"))
        (mt/user-http-request :crowberto :post 200 (str "exploration/thread/" (:id thread) "/cancel"))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       GET /api/exploration/mine                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- touch-revision!
  "Insert a bare `revision` row attributing a touch of `model`/`id` to `user-id` at `ts`. The
  `/mine` query keys off `user_id` + `timestamp` only, so the snapshot can be empty."
  [model id user-id ts]
  (t2/insert! :model/Revision
              {:model model :model_id id :user_id user-id :object {}
               :timestamp ts :is_creation false :is_reversion false :most_recent false}))

(defn- m-index-by
  "Index a `GET /mine` response's `:data` rows by `:name`."
  [resp]
  (into {} (map (juxt :name identity)) (:data resp)))

(deftest mine-membership-and-permissions-test
  (testing "GET /mine returns explorations the caller created or edited, excluding moved-away and archived"
    (mt/with-temp [:model/User       me  {:email "mine-member@example.com"}
                   :model/User       other {:email "mine-other@example.com"}
                   :model/Collection readable {:name "readable"}
                   :model/Collection hidden   {:name "hidden"}]
      ;; Temp collections auto-grant All Users read-write; revoke it on `hidden` so the caller
      ;; (a fresh user, member of All Users only) genuinely cannot see it.
      (perms/revoke-collection-permissions! (perms-group/all-users) (:id hidden))
      (mt/with-temp [:model/Exploration _created  {:name "created-by-me" :creator_id (:id me) :collection_id (:id readable)}
                     :model/Exploration edited    {:name "edited-by-me"  :creator_id (:id other) :collection_id (:id readable)}
                     :model/Exploration _untouched {:name "untouched"    :creator_id (:id other) :collection_id (:id readable)}
                     :model/Exploration _moved    {:name "moved-away"    :creator_id (:id me) :collection_id (:id hidden)}
                     :model/Exploration _archived {:name "archived"      :creator_id (:id me) :collection_id (:id readable) :archived true}]
        ;; `me` edited an exploration `other` created.
        (touch-revision! "Exploration" (:id edited) (:id me) (t/offset-date-time))
        (let [resp (mt/user-http-request me :get 200 "exploration/mine")
              by-name (m-index-by resp)]
          (testing "created-by-me is present"
            (is (contains? by-name "created-by-me")))
          (testing "edited-by-me is present even though someone else created it"
            (is (contains? by-name "edited-by-me"))
            (testing "and the hydrated creator is the other user, not the caller"
              (is (= (:email other) (-> by-name (get "edited-by-me") :creator :email)))))
          (testing "an exploration the caller never touched is absent"
            (is (not (contains? by-name "untouched"))))
          (testing "an exploration moved into a collection the caller can't read is absent"
            (is (not (contains? by-name "moved-away"))))
          (testing "an archived exploration is absent"
            (is (not (contains? by-name "archived"))))
          (testing "total reflects the visible, post-filter count"
            (is (= 2 (:total resp))))
          (testing "rows don't leak the internal total_count column"
            (is (not (contains? (get by-name "created-by-me") :total_count)))))))))

(deftest mine-pagination-test
  (testing "GET /mine pages with a stable order and a post-filter total"
    (mt/with-temp [:model/User       me {:email "mine-page@example.com"}
                   :model/Collection coll {:name "page-coll"}
                   :model/Exploration _e1 {:name "e1" :creator_id (:id me) :collection_id (:id coll)}
                   :model/Exploration _e2 {:name "e2" :creator_id (:id me) :collection_id (:id coll)}
                   :model/Exploration _e3 {:name "e3" :creator_id (:id me) :collection_id (:id coll)}]
      (let [page1 (mt/user-http-request me :get 200 "exploration/mine" :limit 2 :offset 0)
            page2 (mt/user-http-request me :get 200 "exploration/mine" :limit 2 :offset 2)]
        (testing "total is the same across pages and reflects all three"
          (is (= 3 (:total page1)))
          (is (= 3 (:total page2))))
        (testing "the envelope echoes limit/offset"
          (is (= 2 (:limit page1)))
          (is (= 0 (:offset page1)))
          (is (= 2 (:offset page2))))
        (testing "the two pages partition the result set with no overlap"
          (is (= 2 (count (:data page1))))
          (is (= 1 (count (:data page2))))
          (is (= #{"e1" "e2" "e3"}
                 (into #{} (map :name) (concat (:data page1) (:data page2)))))))
      (testing "an unpaged request returns everything with nil limit/offset"
        (let [resp (mt/user-http-request me :get 200 "exploration/mine")]
          (is (nil? (:limit resp)))
          (is (nil? (:offset resp)))
          (is (= 3 (count (:data resp)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              POST /api/exploration/:id/explore-further                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- insert-explore-fixture!
  "Directly persist an exploration -> thread -> block -> page -> query chain so the
  explore-further endpoint has a clicked page to copy. `metrics` is the block's
  metric-selection JSON (each entry needs at least `:card_id`). Returns a map of the
  created ids."
  [{:keys [creator-id collection-id card-id database-id dimension-id metrics dimensions query-type]}]
  (let [expl   (first (t2/insert-returning-instances! :model/Exploration
                                                      {:name "src" :creator_id creator-id
                                                       :collection_id collection-id}))
        thread (first (t2/insert-returning-instances! :model/ExplorationThread
                                                      {:exploration_id (:id expl) :name "t" :position 0}))
        block  (first (t2/insert-returning-instances! :model/ExplorationBlock
                                                      {:exploration_thread_id (:id thread)
                                                       :type "metric" :metrics metrics
                                                       :dimensions (or dimensions []) :position 0}))
        page   (first (t2/insert-returning-instances! :model/ExplorationPage
                                                      {:exploration_block_id (:id block)
                                                       :card_id card-id :dimension_id dimension-id}))]
    (t2/insert! :model/ExplorationQuery
                {:exploration_thread_id (:id thread) :card_id card-id :database_id database-id
                 :dimension_id dimension-id :page_id (:id page) :query_type (or query-type "default")})
    {:exploration-id (:id expl) :thread-id (:id thread) :block-id (:id block) :page-id (:id page)}))

(deftest explore-further-rejects-page-from-another-exploration-test
  (testing "POST /:id/explore-further 404s when page_id belongs to a different exploration —"
    (testing "even for an admin, so a page can never be copied across explorations (IDOR)"
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       metric {:name          "Revenue"
                                               :type          :metric
                                               :dataset_query (lib/->legacy-MBQL
                                                               (let [mp (mt/metadata-provider)]
                                                                 (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                     (lib/aggregate (lib/count)))))}]
        (let [common {:creator-id   (mt/user->id :crowberto)
                      :collection-id (:id coll)
                      :card-id      (:id metric)
                      :database-id  (mt/id)
                      :dimension-id (duid "d1")
                      :metrics      [{:card_id (:id metric)}]}
              a       (insert-explore-fixture! common)
              b       (insert-explore-fixture! common)
              body    {:explore_filters [{:field_ref ["field" {} (mt/id :venues :name)]
                                          :value     "Texas"}]}]
          (testing "cross-exploration page is rejected"
            (mt/user-http-request :crowberto :post 404
                                  (str "exploration/" (:exploration-id a) "/explore-further")
                                  (assoc body :page_id (:page-id b))))
          (testing "control: a page from the same exploration is accepted"
            (mt/user-http-request :crowberto :post 200
                                  (str "exploration/" (:exploration-id a) "/explore-further")
                                  (assoc body :page_id (:page-id a)))))))))

(deftest explore-further-preserves-prior-filter-on-compound-drill-test
  (testing "POST /:id/explore-further keeps the source block's existing explore filters and appends the new one —"
    (testing "so drilling within an already-drilled thread doesn't silently drop the earlier segment scope"
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       metric {:name          "Revenue"
                                               :type          :metric
                                               :dataset_query (lib/->legacy-MBQL
                                                               (let [mp (mt/metadata-provider)]
                                                                 (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                     (lib/aggregate (lib/count)))))}]
        (let [prior  {:field_ref ["field" {} (mt/id :venues :name)]  :value "Texas"}
              new-f  {:field_ref ["field" {} (mt/id :venues :price)] :value 2}
              src    (insert-explore-fixture!
                      {:creator-id    (mt/user->id :crowberto)
                       :collection-id (:id coll)
                       :card-id       (:id metric)
                       :database-id   (mt/id)
                       :dimension-id  (duid "d1")
                       :metrics       [{:card_id (:id metric) :explore_filters [prior]}]})
              _      (mt/user-http-request :crowberto :post 200
                                           (str "exploration/" (:exploration-id src) "/explore-further")
                                           {:page_id         (:page-id src)
                                            :explore_filters [new-f]})
              new-block (->> (t2/select :model/ExplorationBlock
                                        {:join  [[:exploration_thread :t]
                                                 [:= :t.id :exploration_block.exploration_thread_id]]
                                         :where [:and
                                                 [:= :t.exploration_id (:exploration-id src)]
                                                 [:not= :exploration_block.exploration_thread_id (:thread-id src)]]})
                             first)
              filters (:explore_filters (first (:metrics new-block)))]
          (is (= [prior new-f]
                 (mapv #(select-keys % [:field_ref :value]) filters))
              "both the prior (Texas) and the newly clicked (price) filter are present, in drill order"))))))

(deftest explore-further-nested-thread-name-omits-metric-prefix-test
  (testing "a drill from a follow-up thread names only the formatted filters"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       metric {:name          "Revenue"
                                             :type          :metric
                                             :dataset_query (lib/->legacy-MBQL
                                                             (let [mp (mt/metadata-provider)]
                                                               (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                   (lib/aggregate (lib/count)))))}]
      (let [src (insert-explore-fixture!
                 {:creator-id    (mt/user->id :crowberto)
                  :collection-id (:id coll)
                  :card-id       (:id metric)
                  :database-id   (mt/id)
                  :dimension-id  (duid "price")
                  :metrics       [{:card_id (:id metric)
                                   :dimension_mappings (stored-venues-dimension-mappings)}]
                  :dimensions    [{:dimension-id (duid "price") :display-name "Price"}]})]
        ;; Mark the source thread as a follow-up so the next drill is nested. Any real page works;
        ;; a made-up id would violate the source_page_id FK.
        (t2/update! :model/ExplorationThread (:thread-id src) {:source_page_id (:page-id src)})
        (mt/user-http-request :crowberto :post 200
                              (str "exploration/" (:exploration-id src) "/explore-further")
                              {:page_id         (:page-id src)
                               :explore_filters [{:field_ref ["field" {} (mt/id :venues :price)]
                                                  :value     2
                                                  :display_value "2"}]})
        (let [new-thread (t2/select-one :model/ExplorationThread
                                        :exploration_id (:exploration-id src)
                                        {:order-by [[:position :desc] [:id :desc]]})]
          (is (= "Price: 2" (:name new-thread))
              "nested follow-up omits the metric prefix"))))))

(deftest explore-further-thread-name-includes-every-clicked-value-test
  (testing "a click on a chart with several breakouts carries one value per dimension —"
    (testing "the new thread is named for all of them, since its queries are scoped to all of them"
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       metric {:name          "Number of venues"
                                               :type          :metric
                                               :dataset_query (lib/->legacy-MBQL
                                                               (let [mp (mt/metadata-provider)]
                                                                 (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                     (lib/aggregate (lib/count)))))}]
        (let [src (insert-explore-fixture!
                   {:creator-id    (mt/user->id :crowberto)
                    :collection-id (:id coll)
                    :card-id       (:id metric)
                    :database-id   (mt/id)
                    :dimension-id  (duid "category")
                    :metrics       [{:card_id (:id metric)
                                     :dimension_mappings (stored-venues-dimension-mappings)}]
                    :dimensions    [{:dimension-id (duid "category") :display-name "Category"}
                                    {:dimension-id (duid "price") :display-name "Price"}]})]
          (mt/user-http-request :crowberto :post 200
                                (str "exploration/" (:exploration-id src) "/explore-further")
                                {:page_id         (:page-id src)
                                 :explore_filters [{:field_ref ["field" {} (mt/id :venues :category_id)]
                                                    :value     "gadget"}
                                                   {:field_ref ["field" {} (mt/id :venues :price)]
                                                    :value     2}]})
          (let [new-thread (t2/select-one :model/ExplorationThread
                                          :exploration_id (:exploration-id src)
                                          {:order-by [[:position :desc] [:id :desc]]})]
            (is (= "Number of venues → Category: gadget, Price: 2" (:name new-thread))
                "top-level follow-up names all filters as Metric → Column: Value")))))))

(deftest explore-further-disambiguates-same-named-filter-dimensions-test
  (testing "POST /:id/explore-further qualifies ambiguous explore-filter dimension_names with the dim's group"
    (with-redefs [card/*syncing-metric-dimensions* true]
      (let [users-created  "00000000-0000-0000-0000-00000000aaaa"
            orders-created "00000000-0000-0000-0000-00000000bbbb"
            users-field    (mt/id :venues :latitude)
            orders-field   (mt/id :venues :longitude)]
        (mt/with-temp
          [:model/User u {:email "explore-further-ambig@example.com"}
           :model/Card metric (assoc (venues-metric-card (:id u))
                                     :name "Revenue"
                                     :dimensions
                                     [{:id users-created  :name "LATITUDE"  :display-name "Created At"
                                       :group {:id "g-users"  :type "main"       :display-name "Users"}}
                                      {:id orders-created :name "LONGITUDE" :display-name "Created At"
                                       :group {:id "g-orders" :type "connection" :display-name "Orders"}}])]
          (let [body      {:name       "ambig drill"
                           :metrics    [{:card_id (:id metric)
                                         :dimension_mappings
                                         [{:dimension_id users-created  :table_id (mt/id :venues)
                                           :target ["field" {} users-field]}
                                          {:dimension_id orders-created :table_id (mt/id :venues)
                                           :target ["field" {} orders-field]}]}]
                           :dimensions [{:dimension_id users-created  :display_name "Created At"}
                                        {:dimension_id orders-created :display_name "Created At"}]}
                created   (create-exploration! u body)
                expl-id   (:id created)
                page-id   (->> created :threads first :blocks first :pages
                               (some #(when (= "Users → Created At" (:name %)) (:id %))))
                _         (is (some? page-id) "find the users-created page by its disambiguated name")
                filter    {:field_ref ["field" {} users-field] :value 40.7 :display_value "40.7"}
                hydrated  (explore-further-and-hydrate! u expl-id page-id [filter])
                new-thread (->> hydrated :threads (sort-by :position) last)
                persisted  (t2/select-one :model/ExplorationBlock :exploration_thread_id (:id new-thread))]
            (is (= "Revenue → Users → Created At: 40.7" (:name new-thread))
                "thread name uses the group-qualified filter dimension label")
            (is (= "Users → Created At"
                   (:dimension_name (first (:explore_filters (first (:metrics persisted))))))
                "persisted explore_filters carry the group-qualified dimension_name")))))))

;;; |                                 Create-time reference permission checks                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-checks-block-card-permissions-test
  (testing "POST / read-checks every metric card referenced by the blocks payload"
    (mt/with-temp [:model/User u {:email "block-card-perms@example.com"}
                   :model/Collection hidden {:name "hidden-metrics"}
                   :model/Card secret (assoc (valid-metric-card (mt/user->id :crowberto))
                                             :collection_id (:id hidden))]
      ;; Temp collections auto-grant All Users read-write; revoke it so the caller genuinely
      ;; cannot read the metric card.
      (perms/revoke-collection-permissions! (perms-group/all-users) (:id hidden))
      (let [base {:name          "block perm check"
                  :collection_id (:id (collection/user->personal-collection (:id u)))}]
        (testing "an unreadable card id is a 403"
          (mt/user-http-request u :post 403 "exploration"
                                (assoc base :blocks [{:type    "metric"
                                                      :metrics [{:card_id (:id secret)}]}])))
        (testing "a nonexistent card id is a 404"
          (mt/user-http-request u :post 404 "exploration"
                                (assoc base :blocks [{:type    "metric"
                                                      :metrics [{:card_id Integer/MAX_VALUE}]}])))
        (testing "nothing was persisted by the rejected requests"
          (is (zero? (t2/count :model/Exploration :name "block perm check"))))))))

(deftest create-checks-timeline-permissions-test
  (testing "POST / read-checks every attached timeline id"
    (mt/with-temp [:model/User u {:email "tl-perms@example.com"}
                   :model/Collection hidden {:name "hidden-timelines"}
                   :model/Timeline secret-tl {:creator_id    (mt/user->id :crowberto)
                                              :collection_id (:id hidden)}]
      (perms/revoke-collection-permissions! (perms-group/all-users) (:id hidden))
      (let [base {:name          "tl perm check"
                  :collection_id (:id (collection/user->personal-collection (:id u)))}]
        (testing "an unreadable timeline id is a 403"
          (mt/user-http-request u :post 403 "exploration"
                                (assoc base :timeline_ids [(:id secret-tl)])))
        (testing "a nonexistent timeline id is a 404"
          (mt/user-http-request u :post 404 "exploration"
                                (assoc base :timeline_ids [Integer/MAX_VALUE])))
        (testing "nothing was persisted by the rejected requests"
          (is (zero? (t2/count :model/Exploration :name "tl perm check"))))))))

(deftest explore-further-checks-card-permissions-test
  (testing "POST /:id/explore-further read-checks the metric card it re-attaches into the new thread"
    (mt/with-temp [:model/User owner {:email "ef-card-perms@example.com"}
                   :model/Collection hidden {:name "hidden-drill-metrics"}
                   :model/Card metric (assoc (venues-metric-card (mt/user->id :crowberto))
                                             :collection_id (:id hidden))]
      ;; Temp collections auto-grant All Users read-write, so creating the exploration passes the
      ;; attach-time read-check; the revoke below then makes the card unreadable for the drill.
      (let [resp           (create-exploration! owner
                                                {:name          "drill perm check"
                                                 :collection_id (:id (collection/user->personal-collection (:id owner)))
                                                 :metrics       [{:card_id (:id metric)
                                                                  :dimension_mappings (venues-dimension-mappings)}]
                                                 :dimensions    [{:dimension_id (duid "category") :display_name "Category"}]})
            expl-id        (:id resp)
            page-id        (-> resp :threads first :blocks first :pages first :id)
            body           {:page_id         page-id
                            :explore_filters [{:field_ref ["field" {} (mt/id :venues :category_id)]
                                               :value     1}]}
            threads-before (t2/count :model/ExplorationThread :exploration_id expl-id)]
        (perms/revoke-collection-permissions! (perms-group/all-users) (:id hidden))
        (testing "an unreadable card is a 403"
          (mt/user-http-request owner :post 403 (format "exploration/%d/explore-further" expl-id) body))
        (testing "no follow-up thread was persisted by the rejected request"
          (is (= threads-before (t2/count :model/ExplorationThread :exploration_id expl-id))))))))

(deftest create-dedupes-timeline-ids-test
  (testing "POST / dedupes repeated timeline_ids instead of 500ing on the unique constraint"
    (mt/with-temp [:model/User u {:email "tl-dupes@example.com"}
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name         "tl dupes"
                                        :timeline_ids [(:id tl) (:id tl)]})
            tid  (-> resp :threads first :id)]
        (is (= 1 (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid))
            "the duplicate id collapses to a single attachment")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  POST /thread/:thread-id/restart CAS guard                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest restart-refuses-in-flight-thread-test
  (testing "POST /thread/:thread-id/restart refuses non-terminal or mid-execution threads with a 409"
    (mt/with-temp [:model/User u {:email "restart-guard@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [created (create-exploration! u {:name       "restart guard"
                                            :metrics    [{:card_id (:id metric)
                                                          :dimension_mappings [{:dimension_id (duid "d1")
                                                                                :table_id (mt/id :venues)
                                                                                :target ["field" {} (mt/id :venues :price)]}]}]
                                            :dimensions [{:dimension_id (duid "d1") :display_name "Price"
                                                          :effective_type "type/Number"}]})
            tid     (-> created :threads first :id)
            eq-id   (t2/select-one-fn :id :model/ExplorationQuery :exploration_thread_id tid)]
        (testing "an in-flight (non-terminal) thread returns 409 and nothing is reset"
          (mt/user-http-request u :post 409 (format "exploration/thread/%d/restart" tid))
          (is (pos? (t2/count :model/ExplorationQuery :exploration_thread_id tid))
              "its materialized queries are untouched"))
        (testing "a canceled thread with a query still mid-QP-execution returns 409"
          (t2/update! :model/ExplorationThread tid
                      {:canceled_at  (t/offset-date-time)
                       :completed_at (t/offset-date-time)})
          (t2/update! :model/ExplorationQuery eq-id {:status "running" :started_at (t/offset-date-time)})
          (mt/user-http-request u :post 409 (format "exploration/thread/%d/restart" tid))
          (is (some? (t2/select-one-fn :completed_at :model/ExplorationThread :id tid))
              "the terminal stamp survives — nothing was reset"))
        (testing "once no query is mid-execution, restart succeeds and leaves the thread claimable"
          (t2/update! :model/ExplorationQuery eq-id {:status "canceled"})
          (mt/user-http-request u :post 200 (format "exploration/thread/%d/restart" tid))
          (let [thread (t2/select-one :model/ExplorationThread :id tid)]
            ;; exactly the state the planning worker's claim-unplanned-thread! predicate claims:
            ;; started_at set, every other lifecycle timestamp NULL, zero exploration_query rows.
            (is (some? (:started_at thread)))
            (is (nil? (:query_plan_started_at thread)))
            (is (nil? (:analysis_started_at thread)))
            (is (nil? (:completed_at thread)))
            (is (nil? (:canceled_at thread)))
            (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id tid)))))))))
