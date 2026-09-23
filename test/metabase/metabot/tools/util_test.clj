(ns metabase.metabot.tools.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.util :as metabot.tools.util]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel schedule->schedule-map-test
  (testing "hourly schedule"
    (is (= {:schedule_type  "hourly"
            :schedule_hour  nil
            :schedule_day   nil
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency :hourly}))))
  (testing "daily schedule"
    (is (= {:schedule_type  "daily"
            :schedule_hour  9
            :schedule_day   nil
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency :daily
             :hour      9}))))
  (testing "weekly schedule"
    (is (= {:schedule_type  "weekly"
            :schedule_hour  8
            :schedule_day   "mon"
            :schedule_frame nil}
           (metabot.tools.util/schedule->schedule-map
            {:frequency   :weekly
             :hour        8
             :day-of-week :monday}))))
  (testing "weekly schedule truncates day name to 3 chars"
    (is (= "wed"
           (:schedule_day
            (metabot.tools.util/schedule->schedule-map
             {:frequency   :weekly
              :hour        10
              :day-of-week :wednesday})))))
  (testing "monthly schedule with first-mon"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  6
            :schedule_day   "mon"
            :schedule_frame "first"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         6
             :day-of-month :first-mon}))))
  (testing "monthly schedule with last-fri"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  17
            :schedule_day   "fri"
            :schedule_frame "last"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         17
             :day-of-month :last-fri}))))
  (testing "monthly schedule with mid"
    (is (= {:schedule_type  "monthly"
            :schedule_hour  12
            :schedule_day   nil
            :schedule_frame "mid"}
           (metabot.tools.util/schedule->schedule-map
            {:frequency    :monthly
             :hour         12
             :day-of-month :mid})))))

(deftest metabot-scope-query-test
  (testing "metabot-scope-query with collection hierarchy"
    (mt/dataset test-data
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                            :group_id group-id}
                       :model/Collection container-coll {:name "container coll"}
                       :model/Collection metabot-coll   {:name "mb coll"
                                                         :location (collection/location-path container-coll)}
                       :model/Collection mb-child-coll1 {:name "mbc1"
                                                         :location (collection/location-path container-coll metabot-coll)}
                       :model/Collection mb-child-coll2 {:name "mbc2"
                                                         :location (collection/location-path container-coll metabot-coll)}
                       :model/Collection non-mb-coll    {:name "non-mbc"
                                                         :location (collection/location-path container-coll)}
                       :model/Card mb-model1  {:type :model,  :collection_id (:id metabot-coll)}
                       :model/Card mb-model2  {:type :model,  :collection_id (:id mb-child-coll1)}
                       :model/Card mb-metric1 {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Card mb-metric2 {:type :metric, :collection_id (:id mb-child-coll2)}
                       :model/Card outside-model {:type :model, :collection_id (:id non-mb-coll)}
                       :model/Card outside-metric {:type :metric, :collection_id (:id non-mb-coll)}
                       :model/Metabot metabot {:name "metabot"
                                               :collection_id (:id metabot-coll)
                                               :use_verified_content false}]
          (perms/grant-collection-read-permissions! group-id metabot-coll)
          (perms/grant-collection-read-permissions! group-id mb-child-coll1)
          (perms/grant-collection-read-permissions! group-id mb-child-coll2)
          (testing "admin can see all cards in metabot collection and subcollections"
            (let [admin-result (mt/with-test-user :crowberto
                                 (metabot.tools.util/get-metrics-and-models (:id metabot)))
                  card-ids (set (map :id admin-result))]
              (is (contains? card-ids (:id mb-model1)))
              (is (contains? card-ids (:id mb-model2)))
              (is (contains? card-ids (:id mb-metric1)))
              (is (contains? card-ids (:id mb-metric2)))
              (is (not (contains? card-ids (:id outside-model))))
              (is (not (contains? card-ids (:id outside-metric))))))
          (testing "normal user sees only permitted cards"
            (let [user-result (mt/with-test-user :rasta
                                (metabot.tools.util/get-metrics-and-models (:id metabot)))
                  card-ids (set (map :id user-result))]
              (is (contains? card-ids (:id mb-model1)))
              (is (contains? card-ids (:id mb-model2)))
              (is (contains? card-ids (:id mb-metric1)))
              (is (contains? card-ids (:id mb-metric2))))))))))

(deftest metabot-scope-query-root-collection-test
  (testing "metabot-scope-query with root collection (null collection_id)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card root-model  {:type :model, :collection_id nil}
                     :model/Card root-metric {:type :metric, :collection_id nil}
                     :model/Collection some-coll {:name "some collection"}
                     :model/Card coll-model {:type :model, :collection_id (:id some-coll)}
                     :model/Metabot metabot {:name "root metabot"
                                             :collection_id nil
                                             :use_verified_content false}]
        (testing "metabot with root collection sees all content"
          (let [result (mt/with-test-user :crowberto
                         (metabot.tools.util/get-metrics-and-models (:id metabot)))
                card-ids (set (map :id result))]
            (is (contains? card-ids (:id root-model)))
            (is (contains? card-ids (:id root-metric)))
            (is (contains? card-ids (:id coll-model)))))))))

(deftest metabot-scope-query-excludes-destination-database-cards-test
  (testing "get-metrics-and-models excludes cards backed by a destination (routed) database -- destinations
            are routing internals reachable only through their router database"
    (mt/dataset test-data
      (mt/with-temp [:model/Database router-db      {}
                     :model/Database destination-db {:router_database_id (:id router-db)}
                     :model/Card     destination-model {:type :model, :collection_id nil
                                                        :database_id (:id destination-db)}
                     :model/Card     open-model        {:type :model, :collection_id nil
                                                        :database_id (mt/id)}
                     :model/Metabot  metabot {:name "root metabot"
                                              :collection_id nil
                                              :use_verified_content false}]
        (let [result (mt/with-test-user :crowberto
                       (metabot.tools.util/get-metrics-and-models (:id metabot)))
              card-ids (set (map :id result))]
          (is (contains? card-ids (:id open-model)))
          (is (not (contains? card-ids (:id destination-model)))))))))

(deftest add-table-reference-test
  (testing "add-table-reference function adds table-reference for FK fields"
    (mt/dataset test-data
      (mt/with-current-user (mt/user->id :crowberto)
        (let [test-db-id (mt/id)
              mp (lib-be/application-database-metadata-provider test-db-id)
              orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
              columns (lib/visible-columns orders-query)]
          (testing "adds table-reference for implicitly joined columns"
            (let [processed-columns (map #(metabot.tools.util/add-table-reference orders-query %) columns)
                  user-name-column (first (filter #(and (= "NAME" (:name %))
                                                        (:fk-field-id %)) processed-columns))]
              (is (some? user-name-column) "Expected to find implicitly joined User NAME column")
              (is (contains? user-name-column :table-reference))
              (is (string? (:table-reference user-name-column)))
              (is (seq (:table-reference user-name-column)))
              (is (= "User" (:table-reference user-name-column)))))
          (testing "does not add table-reference for direct table columns"
            (let [processed-columns (map #(metabot.tools.util/add-table-reference orders-query %) columns)
                  id-column (first (filter #(and (= "ID" (:name %))
                                                 (not (:fk-field-id %))) processed-columns))]
              (is (some? id-column) "Expected to find direct ORDERS ID column")
              (is (not (contains? id-column :table-reference)))))
          (testing "handles columns without fk-field-id or table-id gracefully"
            (let [mock-column {:name "test-column" :type :string}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))
          (testing "handles columns with fk-field-id but no table-id"
            (let [mock-column {:name "test-fk" :fk-field-id 123}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference)))))
          (testing "handles columns with table-id but no fk-field-id"
            (let [mock-column {:name "test-field" :table-id (mt/id :orders)}
                  result (metabot.tools.util/add-table-reference orders-query mock-column)]
              (is (= mock-column result))
              (is (not (contains? result :table-reference))))))))))

(deftest metabot-verified-content-test
  (testing "metabot-scope-query with verified content filtering"
    (mt/dataset test-data
      (mt/with-premium-features #{:content-verification}
        (mt/with-temp [:model/Collection metabot-coll {:name "mb coll"}
                       :model/Card verified-model {:type :model, :collection_id (:id metabot-coll)}
                       :model/Card unverified-model {:type :model, :collection_id (:id metabot-coll)}
                       :model/Card verified-metric {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Card unverified-metric {:type :metric, :collection_id (:id metabot-coll)}
                       :model/Metabot verified-metabot {:name "verified metabot"
                                                        :collection_id (:id metabot-coll)
                                                        :use_verified_content true}
                       :model/Metabot unverified-metabot {:name "unverified metabot"
                                                          :collection_id (:id metabot-coll)
                                                          :use_verified_content false}]
          ;; Mark some content as verified
          (moderation/create-review! {:moderated_item_id (:id verified-model)
                                      :moderated_item_type "card"
                                      :moderator_id (mt/user->id :crowberto)
                                      :status "verified"
                                      :text "This is verified"})
          (moderation/create-review! {:moderated_item_id (:id verified-metric)
                                      :moderated_item_type "card"
                                      :moderator_id (mt/user->id :crowberto)
                                      :status "verified"
                                      :text "This is verified"})
          (testing "metabot with use_verified_content=true sees only verified content"
            (let [result (mt/with-test-user :crowberto
                           (metabot.tools.util/get-metrics-and-models (:id verified-metabot)))
                  card-ids (set (map :id result))]
              (is (contains? card-ids (:id verified-model)))
              (is (contains? card-ids (:id verified-metric)))
              (is (not (contains? card-ids (:id unverified-model))))
              (is (not (contains? card-ids (:id unverified-metric))))))
          (testing "metabot with use_verified_content=false sees all content"
            (let [result (mt/with-test-user :crowberto
                           (metabot.tools.util/get-metrics-and-models (:id unverified-metabot)))
                  card-ids (set (map :id result))]
              (is (contains? card-ids (:id verified-model)))
              (is (contains? card-ids (:id verified-metric)))
              (is (contains? card-ids (:id unverified-model)))
              (is (contains? card-ids (:id unverified-metric)))
              (testing "Verified content comes first"
                (let [ordered-ids (map :id result)
                      verified-ids #{(:id verified-model) (:id verified-metric)}
                      unverified-ids #{(:id unverified-model) (:id unverified-metric)}]
                  (is (every? verified-ids (take 2 ordered-ids)))
                  (is (every? unverified-ids (drop 2 ordered-ids))))))))))))

(deftest metabot-verified-content-library-test
  (testing "with the :library feature, use_verified_content=true includes library-published metrics/models
            (BOT-1570), matching collections.curation/curated?"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection lib  {:type "library-metrics" :name "libcoll"}
                     :model/Collection norm {:name "normcoll"}
                     :model/Card lib-metric   {:type :metric :collection_id (:id lib)}
                     :model/Card plain-metric {:type :metric :collection_id (:id norm)}
                     :model/Metabot metabot {:name "mb" :use_verified_content true}]
        (let [ids (set (map :id (mt/with-test-user :crowberto
                                  (metabot.tools.util/get-metrics-and-models (:id metabot)))))]
          (is (contains? ids (:id lib-metric))       "library-published metric is curated")
          (is (not (contains? ids (:id plain-metric))) "plain metric is not curated"))))))

(deftest metabot-verified-content-no-feature-test
  (testing "use_verified_content=true with no curation features active returns nothing, rather than falling
            through unfiltered to uncurated content"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection metabot-coll {:name "mb coll"}
                     :model/Card _model  {:type :model  :collection_id (:id metabot-coll)}
                     :model/Card _metric {:type :metric :collection_id (:id metabot-coll)}
                     :model/Metabot metabot {:name "verified metabot"
                                             :collection_id (:id metabot-coll)
                                             :use_verified_content true}]
        (is (empty? (mt/with-test-user :crowberto
                      (metabot.tools.util/get-metrics-and-models (:id metabot)))))))))

(deftest get-table-filters-inactive-test
  (testing "get-table only returns active tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {active-table-id :id} {:db_id db-id, :name "active_table", :active true, :visibility_type nil}
                   :model/Table {inactive-table-id :id} {:db_id db-id, :name "inactive_table", :active false, :visibility_type nil}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= active-table-id (:id (metabot.tools.util/get-table active-table-id :db_id))))
        (is (thrown? clojure.lang.ExceptionInfo
                     (metabot.tools.util/get-table inactive-table-id :db_id)))))))

(deftest find-column-by-field-id-test
  (testing "finds column by integer field ID"
    (let [columns [{:id 301 :name "ID"}
                   {:id 302 :name "NAME"}
                   {:id 303 :name "EMAIL"}]]
      (is (= {:id 301 :name "ID"} (metabot.tools.util/find-column-by-field-id 301 columns)))
      (is (= {:id 303 :name "EMAIL"} (metabot.tools.util/find-column-by-field-id 303 columns)))))
  (testing "finds column by string-encoded field ID"
    (let [columns [{:id 301 :name "ID"}
                   {:id 302 :name "NAME"}]]
      (is (= {:id 302 :name "NAME"} (metabot.tools.util/find-column-by-field-id "302" columns)))))
  (testing "throws agent error when field ID not found"
    (let [columns [{:id 301 :name "ID"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Field 999 not found"
           (metabot.tools.util/find-column-by-field-id 999 columns)))))
  (testing "throws for nil field ID"
    (let [columns [{:id 301 :name "ID"}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not found"
           (metabot.tools.util/find-column-by-field-id nil columns)))))
  (testing "error data contains agent-error? flag"
    (let [columns [{:id 301 :name "ID"}]]
      (try
        (metabot.tools.util/find-column-by-field-id 999 columns)
        (is false "Expected exception")
        (catch clojure.lang.ExceptionInfo e
          (is (:agent-error? (ex-data e)))
          (is (= 404 (:status-code (ex-data e)))))))))

;;; ---------------------------------------- metric sources ----------------------------------------

(deftest ^:parallel metric-required-source-classifies-the-four-definition-shapes-test
  (testing (str "The whole QP rule reduces to this classification, because only the initial stage of a query may\n"
                "carry a source at all. So the metric's last stage carries a `:source-card` exactly when the\n"
                "definition is single-stage and card-based -- and a multi-stage card-based metric, whose stage 0\n"
                "names a card, must still be consumed from its BASE TABLE. That last row is the one\n"
                "`report_card.source_card_id` cannot express, and getting it wrong is a 500.")
    (are [expected stages] (= expected
                              (metabot.tools.util/metric-required-source
                               {:dataset_query {:stages stages} :table_id 5}))
      {:kind :table, :table-id 5, :bare-table-only? false} [{:source-table 5}]
      {:kind :card,  :card-id 42}                          [{:source-card 42}]
      {:kind :table, :table-id 5, :bare-table-only? true}  [{:source-table 5} {}]
      {:kind :table, :table-id 5, :bare-table-only? true}  [{:source-card 42} {}])))

(deftest ^:parallel metric-required-source-falls-back-to-the-table-column-test
  (testing (str "When the definition cannot be read -- a blank `dataset_query`, which MBQL 4->5 conversion\n"
                "failures really do produce (`monitor-blank-dataset-query` exists to count them), or a legacy\n"
                "one that fails to convert -- fall back to `report_card.table_id`, which is what every surface used\n"
                "before this rule existed. Returning nil is read as 'no source available' and the surfaces say so\n"
                "positively, so the agent would be told to skip a metric that still works on its base table.")
    (are [expected card] (= expected (metabot.tools.util/metric-required-source card))
      {:kind :table, :table-id 5, :bare-table-only? false} {:dataset_query {} :table_id 5}
      {:kind :table, :table-id 5, :bare-table-only? false} {:dataset_query nil :table_id 5}
      ;; legacy, but unconvertible
      {:kind :table, :table-id 5, :bare-table-only? false} {:dataset_query {:type :bogus} :table_id 5}))
  (testing "with neither a readable definition nor a table there is genuinely nothing to offer"
    (is (nil? (metabot.tools.util/metric-required-source {:dataset_query {} :table_id nil})))))

(deftest ^:parallel metric-required-source-legacy-definition-test
  (testing (str "A legacy definition is converted and classified like any other, NOT read as stageless: falling\n"
                "back to the table for a `card__N` source would offer the base table of a card-based metric --\n"
                "the pairing the QP rejects with `Incompatible metric`.")
    (are [expected query] (= expected (metabot.tools.util/metric-required-source
                                       {:dataset_query (assoc query :database 1 :type :query) :table_id 5}))
      {:kind :table, :table-id 5, :bare-table-only? false} {:query {:source-table 5}}
      {:kind :card, :card-id 12}                           {:query {:source-table "card__12"
                                                                    :aggregation  [[:count]]}}
      ;; a nested `:source-query` is two stages, so the base table is the one to use
      {:kind :table, :table-id 5, :bare-table-only? true}  {:query {:source-query {:source-table "card__12"}
                                                                    :aggregation  [[:count]]}})))

(deftest ^:parallel metric-compatible-with-stage?-test
  (testing "a table-based metric rides any stage resolving to its table, including a card over that table"
    (let [required {:kind :table, :table-id 5, :bare-table-only? false}]
      (is (true?  (metabot.tools.util/metric-compatible-with-stage? required {:stage-table-id 5})))
      (is (true?  (metabot.tools.util/metric-compatible-with-stage?
                   required {:stage-table-id 5 :stage-card-id 7})))
      (is (false? (metabot.tools.util/metric-compatible-with-stage? required {:stage-table-id 9})))))
  (testing "a multi-stage definition additionally pins it to a bare source-table: stage"
    (let [required {:kind :table, :table-id 5, :bare-table-only? true}]
      (is (true?  (metabot.tools.util/metric-compatible-with-stage? required {:stage-table-id 5})))
      (is (false? (metabot.tools.util/metric-compatible-with-stage?
                   required {:stage-table-id 5 :stage-card-id 7})))))
  (testing "a nil table-id never matches -- a metric over a native question has no usable table source"
    (is (false? (metabot.tools.util/metric-compatible-with-stage?
                 {:kind :table, :table-id nil, :bare-table-only? false} {:stage-table-id nil}))))
  (testing "an unrecognized kind fails loudly rather than answering -- the guard cannot be deleted silently"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized metric source kind"
                          (metabot.tools.util/metric-compatible-with-stage? {:kind :bogus} {}))))
  (testing "a card-pinned metric takes that exact card, not a sibling over the same table"
    (let [required {:kind :card, :card-id 42}]
      (is (true?  (metabot.tools.util/metric-compatible-with-stage? required {:stage-card-id 42})))
      (is (false? (metabot.tools.util/metric-compatible-with-stage?
                   required {:stage-card-id 43 :stage-table-id 5})))
      (is (false? (metabot.tools.util/metric-compatible-with-stage? required {:stage-table-id 5}))))))

(deftest metric-required-source-reads-both-card-shapes-test
  (testing (str "The surfaces pass two shapes: a t2 row (snake_case) and a `lib.metadata/card` map, which is a\n"
                "SnakeHatingMap that THROWS on a snake_case read. Both must classify identically.")
    (mt/with-temp [:model/Card {question-id :id}
                   {:name "Products question" :type :question
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :products)}}}
                   :model/Card {metric-id :id}
                   {:name "Card metric" :type :metric
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (str "card__" question-id)
                                               :aggregation  [[:count]]}}}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [mp        (lib-be/application-database-metadata-provider (mt/id))
              t2-row    (t2/select-one :model/Card :id metric-id)
              lib-card  (lib.metadata/card mp metric-id)]
          (is (= {:kind :card, :card-id question-id}
                 (metabot.tools.util/metric-required-source t2-row)))
          (is (= {:kind :card, :card-id question-id}
                 (metabot.tools.util/metric-required-source lib-card))
              "and reading the lib shape does not throw a snake_case deprecation error"))))))
