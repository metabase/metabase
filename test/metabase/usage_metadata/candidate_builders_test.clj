(ns metabase.usage-metadata.candidate-builders-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.query-utils :as query-utils]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users-personal-collections))

(defn- table-candidate-evidence [source-items]
  (candidate-mining/aggregate-candidate-evidence
   source-items
   @#'candidate-builders/table-source-item-evidence))

(defn- orders-base-query []
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- orders-measure-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-base-query) (lib/sum subtotal))))

(defn- orders-named-measure-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-base-query)
                   (lib/with-expression-name (lib/sum subtotal) "Custom subtotal total"))))

(defn- orders-count-query []
  (lib/aggregate (orders-base-query) (lib/count)))

(defn- orders-extended-measures-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (reduce lib/aggregate
            (orders-base-query)
            [(lib/count subtotal)
             (lib/median subtotal)
             (lib/stddev subtotal)
             (lib/var subtotal)
             (lib/percentile subtotal 0.9)])))

(defn- orders-conditional-measure-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        user-id    (lib.metadata/field mp (mt/id :orders :user_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (reduce lib/aggregate
            (lib/filter (orders-base-query) (lib/= product-id 987654))
            [(lib/count)
             (lib/distinct user-id)
             (lib/sum subtotal)])))

(defn- orders-segment-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/filter (orders-base-query)
                (lib/and (lib/= product-id 987654)
                         (lib/> subtotal 12345)))))

(defn- orders-filtered-metric-query
  ([] (orders-filtered-metric-query 987654))
  ([product-value]
   (let [mp         (lib-be/application-database-metadata-provider (mt/id))
         product-id (lib.metadata/field mp (mt/id :orders :product_id))
         subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
     (-> (orders-base-query)
         (lib/filter (lib/= product-id product-value))
         (lib/aggregate (lib/sum subtotal))))))

(defn- orders-filtered-count-metric-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))]
    (-> (orders-base-query)
        (lib/filter (lib/= product-id 987654))
        (lib/aggregate (lib/count)))))

(defn- orders-temporal-metric-query
  ([] (orders-temporal-metric-query :month))
  ([unit]
   (let [mp         (lib-be/application-database-metadata-provider (mt/id))
         created-at (lib.metadata/field mp (mt/id :orders :created_at))]
     (lib/breakout (orders-filtered-metric-query)
                   (lib/with-temporal-bucket created-at unit)))))

(defn- orders-breakout-only-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        created-at (lib.metadata/field mp (mt/id :orders :created_at))]
    (lib/breakout (orders-measure-query)
                  (lib/with-temporal-bucket created-at :month))))

(defn- orders-categorical-breakout-metric-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))]
    (lib/breakout (orders-filtered-metric-query) product-id)))

(defn- orders-expression-metric-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (as-> (orders-base-query) query
      (lib/expression query "Adjusted subtotal" (lib/* subtotal 2))
      (lib/aggregate query (lib/sum (lib/expression-ref query "Adjusted subtotal"))))))

(defn- model-source-query
  [card-id]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- orders-three-atom-segment-query [quantity-value]
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))
        quantity   (lib.metadata/field mp (mt/id :orders :quantity))]
    (lib/filter (orders-base-query)
                (lib/and (lib/= product-id 987654)
                         (lib/> subtotal 12345)
                         (lib/= quantity quantity-value)))))

(defn- orders-multi-stage-query []
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (-> (orders-base-query)
        (lib/with-fields [product-id subtotal])
        lib/append-stage
        (lib/filter -1 (lib/= product-id 987654))
        (lib/aggregate -1 (lib/sum subtotal)))))

(defn- orders-joined-query []
  (let [mp               (lib-be/application-database-metadata-provider (mt/id))
        products         (lib.metadata/table mp (mt/id :products))
        orders-product   (lib.metadata/field mp (mt/id :orders :product_id))
        orders-subtotal  (lib.metadata/field mp (mt/id :orders :subtotal))
        products-id      (lib.metadata/field mp (mt/id :products :id))
        products-category (lib.metadata/field mp (mt/id :products :category))
        join-alias       "Products"]
    (-> (orders-base-query)
        (lib/join (-> (lib/join-clause
                       products
                       [(lib/= orders-product (lib/with-join-alias products-id join-alias))])
                      (lib/with-join-alias join-alias)))
        (lib/filter (lib/= orders-subtotal 12345))
        (lib/filter (lib/= (lib/with-join-alias products-category join-alias) "Gadget"))
        (lib/filter (lib/= orders-product (lib/with-join-alias products-id join-alias)))
        (lib/aggregate (lib/sum orders-subtotal)))))

(defn- orders-implicit-join-query []
  (let [mp              (lib-be/application-database-metadata-provider (mt/id))
        source-field-id (mt/id :orders :product_id)
        target-field    (lib.metadata/field mp (mt/id :products :category))
        target-ref      (assoc-in (lib/ref target-field) [1 :source-field] source-field-id)]
    (lib/filter (orders-base-query)
                (lib/= target-ref "Gadget"))))

(defn- orders-implicit-join-metric-query []
  (let [mp       (lib-be/application-database-metadata-provider (mt/id))
        subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
    (lib/aggregate (orders-implicit-join-query) (lib/sum subtotal))))

(defn- candidates-from-card
  [card-id candidates]
  (filterv (fn [candidate]
             (some #(= card-id (:id %)) (get-in candidate [:evidence :source-items])))
           candidates))

(deftest ^:parallel merge-candidates-applies-complete-ranking-before-limit-test
  (letfn [(source-items [n {:keys [verified? official? total-views]}]
            (mapv (fn [i]
                    {:id                   i
                     :name                 (str "Source " i)
                     :type                 :question
                     :verified?            (and verified? (zero? i))
                     :official-collection? (and official? (zero? i))
                     :popular?             false
                     :view-count           (if (zero? i) total-views 0)
                     :stage-number         0
                     :joined?              false})
                  (range n)))
          (raw-candidates [label signature atom-count evidence]
            (mapv (fn [source-item]
                    {:metabase.usage-metadata.candidate-mining/signature   signature
                     :metabase.usage-metadata.candidate-mining/table-id    1
                     :metabase.usage-metadata.candidate-mining/source-item source-item
                     :label                                        label
                     :atom-count                                   atom-count})
                  (source-items (:distinct-sources evidence) evidence)))]
    (let [merge-candidates @#'candidate-builders/merge-candidates
          candidates (mapcat (fn [[label signature atom-count evidence]]
                               (raw-candidates label signature atom-count evidence))
                             [[:signature-b ["b"] 2 {:distinct-sources 2 :total-views 50}]
                              [:views       ["views"] 2 {:distinct-sources 2 :total-views 100}]
                              [:atoms       ["atoms"] 1 {:distinct-sources 2 :total-views 0}]
                              [:distinct    ["distinct"] 5 {:distinct-sources 3 :total-views 0}]
                              [:official    ["official"] 5 {:distinct-sources 1 :official? true :total-views 0}]
                              [:verified    ["verified"] 5 {:distinct-sources 1 :verified? true :total-views 0}]
                              [:signature-a ["a"] 2 {:distinct-sources 2 :total-views 50}]])
          source-index {[:table 1] {:type :table :id 1 :name "Table"}}
          limited      (merge-candidates candidates source-index #{} 6)]
      (is (= [:verified :official :distinct :atoms :views :signature-a]
             (mapv :label limited))))))

(deftest candidate-tables-resolve-complete-mbql-dependencies-test
  (mt/with-temp [:model/Card {joined-id :id} {:name "candidate table joined question"
                                              :type :question
                                              :dataset_query (orders-joined-query)
                                              :view_count 0}
                 :model/Card {implicit-id :id} {:name "candidate table implicit join question"
                                                :type :question
                                                :dataset_query (orders-implicit-join-query)
                                                :view_count 0}
                 :model/Card {multi-stage-id :id} {:name "candidate table multi-stage question"
                                                   :type :question
                                                   :dataset_query (orders-multi-stage-query)
                                                   :view_count 0}]
    (let [opts       {:card-ids (hash-set joined-id implicit-id multi-stage-id)}
          report     (candidate-builders/candidate-table-observations (assoc opts :limit 1))
          candidates (into {} (map (juxt #(get-in % [:table :id]) identity)) (:candidates report))
          orders     (candidates (mt/id :orders))
          products   (candidates (mt/id :products))]
      (testing "direct, explicit-join, implicit-join, and multi-stage table references are discovered"
        (is (= #{(mt/id :orders) (mt/id :products)} (set (keys candidates))))
        (is (= #{joined-id implicit-id multi-stage-id}
               (into #{} (map :id) (get-in orders [:evidence :source-items]))))
        (is (= #{joined-id implicit-id}
               (into #{} (map :id) (get-in products [:evidence :source-items])))))
      (testing "each direct source-to-table endorsement has one direct dependency path"
        (is (every? #(= [{:direct? true, :models []}] (:dependency-paths %))
                    (concat (get-in orders [:evidence :source-items])
                            (get-in products [:evidence :source-items])))))
      (is (empty? (:unsupported-source-items report)))
      (is (= report (candidate-builders/candidate-table-observations opts))
          "repeating the same analysis returns byte-for-byte deterministic output")
      (is (= 1 (count (:candidates (candidate-builders/candidate-tables (assoc opts :limit 1)))))
          "the public presentation function applies its limit after observation production"))))

(deftest candidate-tables-preserve-curation-through-model-lineage-test
  (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                 :model/Card {base-model-id :id} {:name "candidate table base model"
                                                  :type :model
                                                  :dataset_query (orders-base-query)
                                                  :view_count 0}
                 :model/Card {outer-model-id :id} {:name "candidate table outer model"
                                                   :type :model
                                                   :dataset_query (model-source-query base-model-id)
                                                   :view_count 0}
                 :model/Card {verified-id :id} {:name "candidate table verified question"
                                                :type :question
                                                :dataset_query (model-source-query outer-model-id)
                                                :view_count 0}
                 :model/Card {official-id :id} {:name "candidate table official question"
                                                :type :question
                                                :dataset_query (model-source-query outer-model-id)
                                                :collection_id official-collection-id
                                                :view_count 0}]
    (moderation/create-review! {:moderated_item_id verified-id
                                :moderated_item_type "card"
                                :moderator_id (mt/user->id :crowberto)
                                :status "verified"})
    (let [report    (candidate-builders/candidate-tables
                     {:card-ids (hash-set verified-id official-id)
                      :limit 1000})
          candidate (first (filter #(= (mt/id :orders) (get-in % [:table :id]))
                                   (:candidates report)))
          items     (into {} (map (juxt :id identity)) (get-in candidate [:evidence :source-items]))
          path      [{:id outer-model-id :name "candidate table outer model"}
                     {:id base-model-id :name "candidate table base model"}]]
      (is (=? {:evidence {:distinct-source-count 2
                          :verified-source-count 1
                          :official-source-count 1}
               :verified-item {:verified? true
                               :dependency-paths [{:direct? false, :models path}]}
               :official-item {:official-collection? true
                               :dependency-paths [{:direct? false, :models path}]}}
              {:evidence (:evidence candidate)
               :verified-item (items verified-id)
               :official-item (items official-id)})))))

(deftest candidate-table-dependency-traversal-preserves-paths-and-guards-cycles-test
  (let [card-table-dependencies     @#'candidate-builders/card-table-dependencies
        raw-table-candidate-analysis @#'candidate-builders/raw-table-candidate-analysis
        root   {:id 1
                :name "Root"
                :type :question
                :verified? false
                :official-collection? false
                :popular? true
                :view-count 10
                :dataset_query {:models #{2 3}}}
        models {2 {:id 2, :name "Left", :dataset_query {:tables #{99}, :models #{2}}}
                3 {:id 3, :name "Right", :dataset_query {:tables #{99}}}}
        analyze (fn []
                  (card-table-dependencies root models [] #{1}))]
    (with-redefs-fn {#'query-utils/wrap-query (fn [_ query] query)
                     #'lib/any-native-stage? (constantly false)
                     #'lib/all-source-table-ids :tables
                     #'lib/all-implicitly-joined-table-ids (constantly nil)
                     #'lib/all-source-card-ids :models}
      (fn []
        (let [dependency-result (analyze)
              rows     (:table-source-items (raw-table-candidate-analysis [root] models))
              evidence (table-candidate-evidence (map :source-item rows))]
          (is (=? {:table-paths {99 #{{:direct? false, :models [{:id 2, :name "Left"}]}
                                      {:direct? false, :models [{:id 3, :name "Right"}]}}}
                   :unsupported []}
                  dependency-result))
          (is (=? {:source-row-count 1
                   :distinct-source-count 1
                   :dependency-path-count 2}
                  {:source-row-count (count rows)
                   :distinct-source-count (:distinct-source-count evidence)
                   :dependency-path-count (count (get-in evidence [:source-items 0 :dependency-paths]))})))))))

(deftest candidate-tables-report-native-and-unreadable-sources-test
  (mt/with-temp [:model/Card {native-id :id} {:name "candidate table native question"
                                              :type :question
                                              :dataset_query (lib/native-query
                                                              (lib-be/application-database-metadata-provider (mt/id))
                                                              "select 1")
                                              :view_count 0}
                 :model/Card {unreadable-id :id} {:name "candidate table unreadable question"
                                                  :type :question
                                                  :dataset_query {}
                                                  :view_count 0}]
    (let [report (candidate-builders/candidate-tables
                  {:card-ids (hash-set native-id unreadable-id)})]
      (is (empty? (:candidates report)))
      (is (= [{:id native-id
               :name "candidate table native question"
               :type :question
               :reason :native-query}
              {:id unreadable-id
               :name "candidate table unreadable question"
               :type :question
               :reason :unreadable-query}]
             (:unsupported-source-items report))))))

(deftest eligible-candidate-table-exclusions-test
  (let [usable-table-dependency?  @#'candidate-builders/usable-table-dependency?
        eligible-candidate-table? @#'candidate-builders/eligible-candidate-table?
        table    {:active true, :visibility_type nil, :data_layer :internal, :is_published false}
        database {:is_audit false, :is_sample false, :router_database_id nil}]
    (testing "usable dependencies may be published; publication candidates may not"
      (are [expected usable? eligible? table database]
           (= expected [(usable? table database) (eligible? table database)])
        [true true]   usable-table-dependency? eligible-candidate-table? table database
        [true false]  usable-table-dependency? eligible-candidate-table? (assoc table :is_published true) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :active false) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :visibility_type :technical) database
        [false false] usable-table-dependency? eligible-candidate-table? (assoc table :data_layer :hidden) database
        [false false] usable-table-dependency? eligible-candidate-table? table nil
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :is_audit true)
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :is_sample true)
        [false false] usable-table-dependency? eligible-candidate-table? table (assoc database :router_database_id 123)))
    (is (true? (eligible-candidate-table? (assoc table :data_layer :final) database))
        "final data-layer tables remain eligible")))

(deftest candidate-table-ranking-applies-every-tier-before-limit-test
  (let [rank-candidate-tables @#'candidate-builders/rank-candidate-tables
        base-table {:id 100, :database-name "db", :schema "schema", :name "z"
                    :data-authority :unconfigured, :data-layer :internal, :view-count 0}
        evidence   {:verified-source-count 0, :official-source-count 0, :distinct-source-count 1
                    :popular-source-count 0, :total-view-count 0}
        candidate  (fn [label table-overrides evidence-overrides]
                     {:label label
                      :table (merge base-table table-overrides)
                      :evidence (merge evidence evidence-overrides)})
        candidates [(candidate :tie-loser {:id 102, :name "zz"} {})
                    (candidate :table-views {:id 90, :view-count 1} {})
                    (candidate :total-views {:id 80} {:total-view-count 1})
                    (candidate :popular {:id 70} {:popular-source-count 1})
                    (candidate :distinct {:id 60} {:distinct-source-count 2})
                    (candidate :final {:id 50, :data-layer :final} {})
                    (candidate :authoritative {:id 40, :data-authority :authoritative} {})
                    (candidate :official {:id 30} {:official-source-count 1})
                    (candidate :verified {:id 20} {:verified-source-count 1})]
        limited    (rank-candidate-tables candidates 8)]
    (is (= [:verified :official :authoritative :final :distinct :popular :total-views :table-views]
           (mapv :label limited)))))

(deftest ^:parallel candidate-metric-ranking-applies-every-tier-before-limit-test
  (letfn [(source-items [n {:keys [verified? official? popular? total-views]}]
            (mapv (fn [i]
                    {:id                   i
                     :name                 (str "Source " i)
                     :description          "Source description"
                     :type                 :question
                     :verified?            (boolean (and verified? (zero? i)))
                     :official-collection? (boolean (and official? (zero? i)))
                     :popular?             (boolean (and popular? (zero? i)))
                     :view-count           (if (zero? i) (or total-views 0) 0)
                     :stage-number         0
                     :joined?              false})
                  (range n)))
          (raw-candidates [[label signature evidence]]
            (mapv (fn [source-item]
                    {:metabase.usage-metadata.candidate-mining/signature   signature
                     :metabase.usage-metadata.candidate-mining/source-item source-item
                     :metabase.usage-metadata.candidate-mining/table-ids   #{1}
                     :label                                        label
                     :definition                                   {}
                     :aggregation                                  [:count {}]})
                  (source-items (:distinct-sources evidence) evidence)))]
    (let [merge-metric-candidates @#'candidate-builders/merge-metric-candidates
          raw-candidates (mapcat raw-candidates
                                 [[:signature-b "b" {:distinct-sources 1}]
                                  [:signature-a "a" {:distinct-sources 1}]
                                  [:views "views" {:distinct-sources 1 :total-views 100}]
                                  [:popular "popular" {:distinct-sources 1 :popular? true}]
                                  [:distinct "distinct" {:distinct-sources 2}]
                                  [:official "official" {:distinct-sources 1 :official? true}]
                                  [:verified "verified" {:distinct-sources 1 :verified? true}]])
          table-index   {1 {:id 1, :database-name "db", :schema "schema", :name "table"}}
          limited       (->> (merge-metric-candidates raw-candidates #{} table-index)
                             (take 6)
                             vec)]
      (is (= [:verified :official :distinct :popular :views :signature-a]
             (mapv :label limited)))
      (is (empty? (merge-metric-candidates raw-candidates #{} {}))
          "a candidate is rejected if any required physical table is unavailable"))))

(deftest candidate-metric-limit-is-applied-only-at-presentation-boundary-test
  (mt/with-temp [:model/Card {first-id :id} {:name "First filtered metric"
                                             :type :question
                                             :dataset_query (orders-filtered-metric-query 900001)}
                 :model/Card {second-id :id} {:name "Second filtered metric"
                                              :type :question
                                              :dataset_query (orders-filtered-metric-query 900002)}]
    (let [opts         {:card-ids (hash-set first-id second-id), :limit 1}
          observations (candidate-builders/candidate-metric-observations opts)]
      (is (= 2 (count observations))
          "the persistence producer ignores presentation limits")
      (is (= 1 (count (candidate-builders/candidate-metrics opts)))
          "the public presentation function applies the requested limit"))))

(deftest candidate-metrics-return-creation-ready-filtered-and-temporal-definitions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Paid revenue"
                                            :description "Revenue for the selected product"
                                            :type :question
                                            :dataset_query (orders-temporal-metric-query)
                                            :view_count 0}]
    (let [candidates (candidate-builders/candidate-metrics
                      {:card-ids (hash-set card-id), :limit 1000})
          candidate  (first candidates)
          definition (:definition candidate)
          validated  (lib/query (lib-be/application-database-metadata-provider (mt/id)) definition)]
      (is (=? {:candidate-count 1
               :can-save? true
               :aggregation-type :sum
               :temporal-unit :month
               :suggested-name "Paid revenue"
               :suggested-description "Revenue for the selected product"
               :required-tables [{:id (mt/id :orders), :published? false}]
               :source-items [{:id card-id}]}
              {:candidate-count (count candidates)
               :can-save? (lib/can-save? validated :metric)
               :aggregation-type (first (:aggregation candidate))
               :temporal-unit (get-in candidate [:temporal-breakout 1 :temporal-unit])
               :suggested-name (:suggested-name candidate)
               :suggested-description (:suggested-description candidate)
               :required-tables (:required-tables candidate)
               :source-items (get-in candidate [:evidence :source-items])}))
      (is (= candidates
             (candidate-builders/candidate-metrics
              {:card-ids (hash-set card-id), :limit 1000}))
          "the canonical result is deterministic across repeated runs"))))

(deftest candidate-metrics-include-filtered-count-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Paid order count"
                                            :type :question
                                            :dataset_query (orders-filtered-count-metric-query)
                                            :view_count 0}]
    (let [candidate (first (candidate-builders/candidate-metrics
                            {:card-ids (hash-set card-id), :limit 1000}))]
      (is (= :count (first (:aggregation candidate))))
      (is (seq (get-in candidate [:definition :stages 0 :filters])))
      (is (nil? (:temporal-breakout candidate))))))

(deftest candidate-metrics-aggregate-curation-and-use-best-source-for-naming-test
  (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                 :model/Card {official-id :id} {:name "Official metric name"
                                                :description "Official metric description"
                                                :type :question
                                                :dataset_query (orders-filtered-metric-query)
                                                :collection_id official-collection-id
                                                :view_count 100}
                 :model/Card {verified-id :id} {:name "Verified metric name"
                                                :description "Verified metric description"
                                                :type :model
                                                :dataset_query (orders-filtered-metric-query)
                                                :view_count 0}]
    (moderation/create-review! {:moderated_item_id   verified-id
                                :moderated_item_type "card"
                                :moderator_id        (mt/user->id :crowberto)
                                :status              "verified"})
    (let [candidate (first (candidate-builders/candidate-metrics
                            {:card-ids (hash-set official-id verified-id)
                             :min-view-count 10
                             :limit 1000}))]
      (is (= "Verified metric name" (:suggested-name candidate)))
      (is (= "Verified metric description" (:suggested-description candidate)))
      (is (= {:distinct-source-count 2
              :verified-source-count 1
              :official-source-count 1
              :popular-source-count 1
              :total-view-count 100}
             (dissoc (:evidence candidate) :source-items))))))

(deftest candidate-metrics-keep-direct-joins-and-report-all-required-tables-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Joined revenue"
                                            :type :question
                                            :dataset_query (orders-joined-query)
                                            :view_count 0}]
    (let [candidate (first (candidate-builders/candidate-metrics
                            {:card-ids (hash-set card-id), :limit 1000}))]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (into #{} (map :id) (:required-tables candidate))))
      (is (seq (get-in candidate [:definition :stages 0 :joins])))
      (is (true? (get-in candidate [:evidence :source-items 0 :joined?]))))))

(deftest candidate-metrics-report-implicitly-joined-required-tables-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Implicitly joined revenue"
                                            :type :question
                                            :dataset_query (orders-implicit-join-metric-query)
                                            :view_count 0}]
    (let [candidate (first (candidate-builders/candidate-metrics
                            {:card-ids (hash-set card-id), :limit 1000}))]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (into #{} (map :id) (:required-tables candidate))))
      (is (true? (get-in candidate [:evidence :source-items 0 :joined?]))))))

(deftest candidate-metrics-keep-direct-expressions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Adjusted revenue"
                                            :type :question
                                            :dataset_query (orders-expression-metric-query)
                                            :view_count 0}]
    (let [candidate (first (candidate-builders/candidate-metrics
                            {:card-ids (hash-set card-id), :limit 1000}))]
      (is (some? candidate))
      (is (seq (get-in candidate [:definition :stages 0 :expressions])))
      (is (= [(mt/id :orders)] (mapv :id (:required-tables candidate)))))))

(deftest candidate-metrics-exclude-measure-shaped-queries-test
  (mt/with-temp [:model/Card {sum-id :id} {:name "Plain sum"
                                           :type :question
                                           :dataset_query (orders-measure-query)
                                           :view_count 0}
                 :model/Card {count-id :id} {:name "Plain count"
                                             :type :question
                                             :dataset_query (orders-count-query)
                                             :view_count 0}
                 :model/Card {breakout-id :id} {:name "Plain sum by month"
                                                :type :question
                                                :dataset_query (orders-breakout-only-query)
                                                :view_count 0}]
    (is (empty? (candidate-builders/candidate-metrics
                 {:card-ids (hash-set sum-id count-id breakout-id), :limit 1000})))))

(deftest candidate-metrics-rewrite-transparent-card-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {base-model-id :id} {:name "metric base model"
                                                    :type :model
                                                    :dataset_query (lib/with-fields
                                                                     (orders-base-query)
                                                                     [product-id subtotal])
                                                    :view_count 0}
                   :model/Card {outer-card-id :id} {:name "metric projection question"
                                                    :type :question
                                                    :dataset_query (model-source-query base-model-id)
                                                    :view_count 0}
                   :model/Card {card-id :id} {:name "metric from transparent cards"
                                              :type :question
                                              :dataset_query (-> (model-source-query outer-card-id)
                                                                 (lib/filter (lib/= product-id 987654))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 0}]
      (let [candidate (first (candidate-builders/candidate-metrics
                              {:card-ids (hash-set card-id), :limit 1000}))]
        (is (= (mt/id :orders) (get-in candidate [:definition :stages 0 :source-table])))
        (is (nil? (get-in candidate [:definition :stages 0 :source-card])))
        (is (= [{:id base-model-id, :name "metric base model"}
                {:id outer-card-id, :name "metric projection question"}]
               (get-in candidate [:evidence :source-items 0 :model-lineage])))))))

(deftest candidate-metrics-exclude-opaque-card-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {model-id :id} {:name "metric opaque model"
                                               :type :model
                                               :dataset_query (lib/filter (orders-base-query)
                                                                          (lib/= product-id 1))
                                               :view_count 0}
                   :model/Card {card-id :id} {:name "metric from opaque model"
                                              :type :question
                                              :dataset_query (-> (model-source-query model-id)
                                                                 (lib/filter (lib/= product-id 2))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 0}]
      (is (empty? (candidate-builders/candidate-metrics
                   {:card-ids (hash-set card-id), :limit 1000}))))))

(deftest candidate-metrics-protect-against-card-lineage-cycles-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {card-a-id :id} {:name "metric cycle A"
                                                :type :question
                                                :dataset_query (orders-filtered-metric-query)
                                                :view_count 0}
                   :model/Card {card-b-id :id} {:name "metric cycle B"
                                                :type :model
                                                :dataset_query (model-source-query card-a-id)
                                                :view_count 0}]
      (t2/update! :model/Card card-a-id
                  {:dataset_query (-> (model-source-query card-b-id)
                                      (lib/filter (lib/= product-id 1))
                                      (lib/aggregate (lib/sum subtotal)))})
      (is (empty? (candidate-builders/candidate-metrics
                   {:card-ids (hash-set card-a-id), :limit 1000}))))))

(deftest candidate-metrics-exclude-unsupported-query-shapes-test
  (let [native-query  (lib/native-query (lib-be/application-database-metadata-provider (mt/id)) "select 1")
        pivot-query   (orders-temporal-metric-query)
        breakout-uuid (get-in pivot-query [:stages 0 :breakout 0 1 :lib/uuid])]
    (mt/with-temp [:model/Card {native-id :id} {:name "native metric source"
                                                :type :question
                                                :dataset_query native-query
                                                :view_count 0}
                   :model/Card {multi-stage-id :id} {:name "multi-stage metric source"
                                                     :type :question
                                                     :dataset_query (orders-multi-stage-query)
                                                     :view_count 0}
                   :model/Card {multi-aggregation-id :id} {:name "multi-aggregation metric source"
                                                           :type :question
                                                           :dataset_query (orders-conditional-measure-query)
                                                           :view_count 0}
                   :model/Card {limited-id :id} {:name "limited metric source"
                                                 :type :question
                                                 :dataset_query (lib/limit (orders-filtered-metric-query) 10)
                                                 :view_count 0}
                   :model/Card {paginated-id :id} {:name "paginated metric source"
                                                   :type :question
                                                   :dataset_query (assoc-in (orders-filtered-metric-query)
                                                                            [:stages 0 :page]
                                                                            {:page 1, :items 10})
                                                   :view_count 0}
                   :model/Card {categorical-breakout-id :id} {:name "categorical breakout metric source"
                                                              :type :question
                                                              :dataset_query (orders-categorical-breakout-metric-query)
                                                              :view_count 0}
                   :model/Card {pivot-id :id} {:name "pivot metric source"
                                               :type :question
                                               :dataset_query (assoc-in pivot-query
                                                                        [:stages 0 :pivot]
                                                                        {:rows [breakout-uuid], :columns []})
                                               :view_count 0}
                   :model/Card {malformed-id :id} {:name "malformed metric source"
                                                   :type :question
                                                   :dataset_query {}
                                                   :view_count 0}]
      (is (empty? (candidate-builders/candidate-metrics
                   {:card-ids (hash-set native-id
                                        multi-stage-id
                                        multi-aggregation-id
                                        limited-id
                                        paginated-id
                                        categorical-breakout-id
                                        pivot-id
                                        malformed-id)
                    :limit 1000}))))))

(deftest candidate-metrics-deduplicate-existing-full-definitions-test
  (let [candidate-query (orders-filtered-metric-query 2)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate metric source"
                                              :type :question
                                              :dataset_query candidate-query
                                              :view_count 0}
                   :model/Card _existing {:name "existing different metric"
                                          :type :metric
                                          :dataset_query (orders-filtered-metric-query 1)}]
      (testing "a different filter remains a distinct Metric definition"
        (is (= 1 (count (candidate-builders/candidate-metrics
                         {:card-ids (hash-set card-id), :limit 1000})))))
      (mt/with-temp [:model/Card _same {:name "existing identical metric"
                                        :type :metric
                                        :dataset_query candidate-query}]
        (testing "the complete identical definition is excluded"
          (is (empty? (candidate-builders/candidate-metrics
                       {:card-ids (hash-set card-id), :limit 1000}))))))))

(deftest candidate-metrics-keep-different-temporal-grains-distinct-test
  (mt/with-temp [:model/Card {card-id :id} {:name "monthly candidate metric"
                                            :type :question
                                            :dataset_query (orders-temporal-metric-query :month)
                                            :view_count 0}
                 :model/Card _existing {:name "existing yearly metric"
                                        :type :metric
                                        :dataset_query (orders-temporal-metric-query :year)}]
    (is (= 1 (count (candidate-builders/candidate-metrics
                     {:card-ids (hash-set card-id), :limit 1000}))))))

(deftest candidate-measures-return-valid-definition-and-skip-existing-test
  (let [query (orders-measure-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining measure"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (testing "explicit nil options use defaults"
        (let [candidates (candidates-from-card
                          card-id
                          (candidate-builders/candidate-measures {:min-view-count nil :limit nil}))
              candidate  (first candidates)]
          (is (=? {:candidate-count 1
                   :aggregation {:type :sum
                                 :base-name "Sum of Subtotal"
                                 :field {:id           (mt/id :orders :subtotal)
                                         :name         "SUBTOTAL"
                                         :display-name "Subtotal"}}
                   :suggested-name "Sum of Subtotal"
                   :suggested-description "Sum of Subtotal on Orders"
                   :definition-keys #{:lib/type :database :stages}}
                  {:candidate-count (count candidates)
                   :aggregation (:aggregation candidate)
                   :suggested-name (:suggested-name candidate)
                   :suggested-description (:suggested-description candidate)
                   :definition-keys (set (keys (:definition candidate)))}))))
      (mt/with-temp [:model/Measure _measure {:name "Existing candidate mining measure"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition (orders-named-measure-query)}]
        (testing "an existing Measure with a different display name suppresses the equivalent candidate"
          (is (empty? (candidates-from-card
                       card-id
                       (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000})))))
        (testing "cleanup materialization retains exact matches so raw usage remains visible"
          (is (= 1
                 (count (candidates-from-card
                         card-id
                         (:measures (candidate-builders/cleanup-candidates)))))))))))

(deftest candidate-measures-omit-bare-count-test
  (mt/with-temp [:model/Card {card-id :id} {:name          "candidate mining bare count"
                                            :type          :question
                                            :dataset_query (orders-count-query)
                                            :view_count    1000000}]
    (is (empty? (candidates-from-card
                 card-id
                 (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))))))

(deftest candidate-measures-support-remaining-direct-aggregations-test
  (let [query (orders-extended-measures-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining extended measures"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (let [candidates (candidates-from-card
                        card-id
                        (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))
            by-type    (into {} (map (juxt #(get-in % [:aggregation :type]) identity)) candidates)]
        (is (= #{:count :median :stddev :var :percentile} (set (keys by-type))))
        (is (= (mt/id :orders :subtotal)
               (get-in by-type [:count :aggregation :field :id])))
        (is (= 0.9
               (get-in by-type [:percentile :aggregation :percentile])))
        (is (every? #(= (mt/id :orders) (get-in % [:source :id])) candidates))))))

(deftest candidate-measures-synthesize-curated-categorical-condition-test
  (let [query (orders-conditional-measure-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining conditional measure"
                                              :type :question
                                              :dataset_query query
                                              :view_count 0}]
      (moderation/create-review! {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (let [candidates  (candidates-from-card
                         card-id
                         (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))
            conditional (filterv #(contains? #{:count-where :distinct-where :sum-where}
                                             (get-in % [:aggregation :type]))
                                 candidates)
            by-type     (into {} (map (juxt #(get-in % [:aggregation :type]) identity)) conditional)]
        (is (=? {:types #{:count-where :distinct-where :sum-where}
                 :contains-bare-count? false
                 :conditions #{{:atom-count 1
                                :field-ids [(mt/id :orders :product_id)]
                                :operator :=
                                :verified-source-count 1}}
                 :names {:count-where "Count where Product ID is 987654"
                         :distinct-where "Distinct values of User ID where Product ID is 987654"
                         :sum-where "Sum of Subtotal where Product ID is 987654"}
                 :sum-description "Sum of Subtotal where Product ID is 987654 on Orders"}
                {:types (set (keys by-type))
                 :contains-bare-count? (boolean
                                        (some #(and (= :count (get-in % [:aggregation :type]))
                                                    (nil? (get-in % [:aggregation :field])))
                                              candidates))
                 :conditions (into #{}
                                   (map (fn [candidate]
                                          {:atom-count (get-in candidate [:aggregation :condition-atom-count])
                                           :field-ids (mapv :id (get-in candidate [:aggregation :condition-fields]))
                                           :operator (first (get-in candidate [:aggregation :condition]))
                                           :verified-source-count (get-in candidate [:evidence :verified-source-count])}))
                                   conditional)
                 :names (update-vals by-type :suggested-name)
                 :sum-description (get-in by-type [:sum-where :suggested-description])}))))))

(deftest candidate-measures-drop-one-off-popular-conditions-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining one-off condition"
                                            :type :question
                                            :dataset_query (orders-conditional-measure-query)
                                            :view_count 1000000}]
    (let [candidates (candidates-from-card
                      card-id
                      (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))]
      (is (not-any? #(contains? #{:count-where :distinct-where :sum-where}
                                (get-in % [:aggregation :type]))
                    candidates)))))

(deftest candidate-measures-and-segments-resolve-transparent-model-lineage-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {base-model-id :id} {:name "candidate mining base model"
                                                    :type :model
                                                    :dataset_query (lib/with-fields
                                                                     (orders-base-query)
                                                                     [product-id subtotal])
                                                    :view_count 0}
                   :model/Card {outer-model-id :id} {:name "candidate mining outer model"
                                                     :type :model
                                                     :dataset_query (model-source-query base-model-id)
                                                     :view_count 0}
                   :model/Card {card-id :id} {:name "candidate mining model-backed question"
                                              :type :question
                                              :dataset_query (-> (model-source-query outer-model-id)
                                                                 (lib/filter (lib/= product-id 987654))
                                                                 (lib/aggregate (lib/sum subtotal)))
                                              :view_count 1000000}]
      (let [measure    (->> (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000})
                            (candidates-from-card card-id)
                            (filter #(= :sum (get-in % [:aggregation :type])))
                            first)
            segment    (->> (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000})
                            (candidates-from-card card-id)
                            first)
            lineage    [{:id base-model-id :name "candidate mining base model"}
                        {:id outer-model-id :name "candidate mining outer model"}]]
        (is (= (mt/id :orders) (get-in measure [:source :id])))
        (is (= lineage (get-in measure [:evidence :source-items 0 :model-lineage])))
        (is (= (mt/id :orders) (get-in segment [:source :id])))
        (is (= lineage (get-in segment [:evidence :source-items 0 :model-lineage])))))))

(deftest candidate-mining-supports-multi-stage-physical-lineage-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining multi-stage question"
                                            :type :question
                                            :dataset_query (orders-multi-stage-query)
                                            :view_count 1000000}]
    (let [measures (->> (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id))
          segments (->> (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000})
                        (candidates-from-card card-id))
          measure  (first measures)
          segment  (first segments)
          field-id (fn [clause]
                     (->> clause
                          (tree-seq sequential? seq)
                          (filter #(and (vector? %) (= :field (first %))))
                          first
                          (#(nth % 2))))]
      (is (=? {:measure-count 1
               :segment-count 1
               :measure {:type :sum
                         :field-id (mt/id :orders :subtotal)
                         :stage-numbers [1]}
               :segment {:field-id (mt/id :orders :product_id)
                         :stage-numbers [1]
                         :joined? false}}
              {:measure-count (count measures)
               :segment-count (count segments)
               :measure {:type (get-in measure [:aggregation :type])
                         :field-id (field-id (get-in measure [:definition :stages 0 :aggregation 0]))
                         :stage-numbers (get-in measure [:evidence :source-items 0 :stage-numbers])}
               :segment {:field-id (field-id (:predicate segment))
                         :stage-numbers (get-in segment [:evidence :source-items 0 :stage-numbers])
                         :joined? (get-in segment [:evidence :source-items 0 :joined?])}})))))

(deftest candidate-mining-inspects-stage-zero-before-a-semantic-barrier-test
  (let [query (-> (orders-conditional-measure-query)
                  lib/append-stage)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining stage zero question"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (let [measures (candidates-from-card
                      card-id
                      (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))
            segments (candidates-from-card
                      card-id
                      (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000}))]
        (is (= #{:distinct :sum}
               (into #{} (map #(get-in % [:aggregation :type])) measures)))
        (is (= 1 (count segments)))
        (is (every? #(= [0] (:stage-numbers %))
                    (concat (mapcat #(get-in % [:evidence :source-items]) measures)
                            (get-in (first segments) [:evidence :source-items]))))))))

(deftest candidate-segments-support-single-owner-join-filters-test
  (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining joined question"
                                            :type :question
                                            :dataset_query (orders-joined-query)
                                            :view_count 1000000}]
    (let [segments (candidates-from-card
                    card-id
                    (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000}))
          measures (candidates-from-card
                    card-id
                    (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))
          by-table (group-by #(get-in % [:source :id]) segments)]
      (testing "single-owner filters become Segments on their actual physical owner"
        (is (=? {:segment-count 2
                 :table-ids #{(mt/id :orders) (mt/id :products)}
                 :field-ids-by-table {(mt/id :orders) #{(mt/id :orders :subtotal)}
                                      (mt/id :products) #{(mt/id :products :category)}}
                 :product-join-alias nil
                 :evidence #{{:joined? true, :stage-numbers [0]}}}
                {:segment-count (count segments)
                 :table-ids (set (keys by-table))
                 :field-ids-by-table (update-vals by-table
                                                  #(into #{} (map :id) (:fields (first %))))
                 :product-join-alias (get-in (first (by-table (mt/id :products)))
                                             [:predicate 2 1 :join-alias])
                 :evidence (into #{}
                                 (map (fn [candidate]
                                        {:joined? (get-in candidate [:evidence :source-items 0 :joined?])
                                         :stage-numbers (get-in candidate [:evidence :source-items 0 :stage-numbers])}))
                                 segments)})))
      (testing "aggregations from a joined stage remain excluded"
        (is (empty? measures))))))

(deftest candidate-mining-rejects-semantic-model-transformations-test
  (let [mp         (lib-be/application-database-metadata-provider (mt/id))
        product-id (lib.metadata/field mp (mt/id :orders :product_id))
        subtotal   (lib.metadata/field mp (mt/id :orders :subtotal))]
    (mt/with-temp [:model/Card {model-id :id} {:name "candidate mining filtered model"
                                               :type :model
                                               :dataset_query (lib/filter
                                                               (orders-base-query)
                                                               (lib/= product-id 987654))
                                               :view_count 0}
                   :model/Card {card-id :id} {:name "candidate mining unsafe model question"
                                              :type :question
                                              :dataset_query (lib/aggregate
                                                              (model-source-query model-id)
                                                              (lib/sum subtotal))
                                              :view_count 1000000}]
      (is (empty? (candidates-from-card
                   card-id
                   (candidate-builders/candidate-measures {:min-view-count 10 :limit 1000}))))
      (is (empty? (candidates-from-card
                   card-id
                   (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000})))))))

(deftest candidate-segments-keep-atoms-when-composite-exists-test
  (let [query (orders-segment-query)]
    (mt/with-temp [:model/Card {card-id :id} {:name "candidate mining segment"
                                              :type :question
                                              :dataset_query query
                                              :view_count 1000000}]
      (moderation/create-review! {:moderated_item_id   card-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (testing "a verified two-atom source produces two atomic candidates and its conjunction"
        (let [candidates (candidates-from-card
                          card-id
                          (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000}))
              atomic     (remove :composite? candidates)
              composite  (first (filter :composite? candidates))
              filters    (lib/filters (:definition composite) 0)]
          (is (=? {:candidate-count 3
                   :atomic-count 2
                   :atomic-atom-counts #{1}
                   :composite-atom-count 2
                   :definition-filter-count 2
                   :definition-has-and? false
                   :atomic-names #{"Product ID is 987654"
                                   "Subtotal is greater than 12345"}
                   :composite-name "Product ID is 987654 and Subtotal is greater than 12345"
                   :composite-description "Filtered by Product ID is 987654 and Subtotal is greater than 12345 on Orders"}
                  {:candidate-count (count candidates)
                   :atomic-count (count atomic)
                   :atomic-atom-counts (into #{} (map :atom-count) atomic)
                   :composite-atom-count (:atom-count composite)
                   :definition-filter-count (count filters)
                   :definition-has-and? (boolean (some #(lib/clause-of-type? % :and) filters))
                   :atomic-names (into #{} (map :suggested-name) atomic)
                   :composite-name (:suggested-name composite)
                   :composite-description (:suggested-description composite)}))))
      (mt/with-temp [:model/Segment _segment {:name "Existing candidate mining segment"
                                              :creator_id (mt/user->id :crowberto)
                                              :definition query}]
        (testing "the saved conjunction is excluded without suppressing either atom"
          (let [existing-segment-signatures @#'candidate-builders/existing-segment-signatures
                expected-signature (candidate-mining/segment-signature
                                    (mt/id :orders)
                                    (lib/atomic-filters query 0))
                existing           (existing-segment-signatures #{(mt/id :orders)})
                candidates         (candidates-from-card
                                    card-id
                                    (candidate-builders/candidate-segments {:min-view-count 10 :limit 1000}))]
            (is (contains? existing expected-signature)
                (str "Expected " expected-signature " among existing signatures " existing))
            (is (=? {:candidate-count 2, :composite-count 0}
                    {:candidate-count (count candidates)
                     :composite-count (count (filter :composite? candidates))}))))))))

(deftest candidate-segments-mine-recurring-filter-subsets-test
  (let [query-a (orders-three-atom-segment-query 111)
        query-b (orders-three-atom-segment-query 222)]
    (mt/with-temp [:model/Card {card-a-id :id} {:name "candidate mining recurring segment A"
                                                :type :question
                                                :dataset_query query-a
                                                :view_count 1000000}
                   :model/Card {card-b-id :id} {:name "candidate mining recurring segment B"
                                                :type :model
                                                :dataset_query query-b
                                                :view_count 1000000}]
      (let [candidates (candidates-from-card
                        card-a-id
                        (candidate-builders/candidate-segments {:min-view-count 1000000 :limit 1000}))
            composites (filterv :composite? candidates)]
        (testing "only the shared two-atom subset survives; one-off subsets from the popular source do not"
          (is (= 1 (count composites)))
          (is (= 2 (:atom-count (first composites))))
          (is (= 2 (get-in (first composites) [:evidence :distinct-source-count])))
          (is (= #{card-a-id card-b-id}
                 (into #{} (map :id) (get-in (first composites) [:evidence :source-items])))))))))

(deftest malformed-existing-candidate-definitions-are-ignored-test
  (testing "a malformed Measure does not abort candidate mining"
    (let [existing-measure-signatures @#'candidate-builders/existing-measure-signatures]
      (with-redefs [t2/select (fn [& _]
                                [{:table_id (mt/id :orders)
                                  :definition {:not :a-query}}])]
        (is (= #{} (existing-measure-signatures #{(mt/id :orders)}))))))
  (testing "a malformed Segment does not abort candidate mining"
    (let [existing-segment-signatures @#'candidate-builders/existing-segment-signatures]
      (with-redefs [t2/select (fn [& _]
                                [{:table_id (mt/id :orders)
                                  :definition {:not :a-query}}])]
        (is (= #{} (existing-segment-signatures #{(mt/id :orders)})))))))
