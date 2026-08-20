(ns ^:synchronous metabase-enterprise.remote-sync.metric-dimension-api-test
  "The `/api/metric/:id/dimension/*` endpoints write a Card's `dimensions`/`dimension_mappings`
   directly, bypassing the regular card-update path. Since those columns are serialized, every one of
   those writes has to mark the Card dirty for remote sync on its own."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each (fn [thunk]
                      (mt/with-temporary-setting-values [remote-sync-type :read-write]
                        (thunk))))

(defn- metric-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- mark-synced!
  "Put the Card's RemoteSyncObject in the state a successful export leaves behind: `synced`, with the
   content hash of the row as it stands right now."
  [card-id]
  (t2/delete! :model/RemoteSyncObject :model_type "Card" :model_id card-id)
  (t2/insert! :model/RemoteSyncObject
              {:model_type        "Card"
               :model_id          card-id
               :model_name        (t2/select-one-fn :name :model/Card card-id)
               :status            "synced"
               :content_hash      (source/row->content-hash {:model_type "Card" :model_id card-id})
               :status_changed_at (t/offset-date-time)}))

(defn- sync-status [card-id]
  (t2/select-one-fn :status :model/RemoteSyncObject :model_type "Card" :model_id card-id))

(defmacro ^:private with-synced-metric
  "Binds a seeded metric Card living in a remote-synced collection, with its RemoteSyncObject already
   marked `synced`."
  [[metric-binding] & body]
  `(mt/with-temp [:model/Collection collection# {:name "Remote-Synced" :location "/" :is_remote_synced true}
                  :model/Card       metric#     {:name          "Synced Metric"
                                                 :type          :metric
                                                 :collection_id (:id collection#)
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query (metric-query)}]
     (metrics/sync-dimensions! :metadata/metric (:id metric#))
     (mark-synced! (:id metric#))
     (let [~metric-binding (t2/select-one :model/Card :id (:id metric#))]
       ~@body)))

(defn- dimension-id [metric column-name]
  (:id (u/seek #(= column-name (:name %)) (:dimensions metric))))

(deftest add-dimension-marks-card-dirty-test
  (testing "POST /api/metric/:id/dimension/add marks the metric dirty for remote sync"
    (with-synced-metric [metric]
      (let [addable (->> (mt/user-http-request :crowberto :get 200
                                               (str "metric/" (:id metric) "/dimension")
                                               :with-addable true)
                         :addable first :dimensions first)]
        (is (some? addable) "there should be a joinable column available to add")
        (mt/user-http-request :crowberto :post 200 (str "metric/" (:id metric) "/dimension/add")
                              {:dimensions [{:id             (str (random-uuid))
                                             :mapping_target (:mapping_target addable)}]})
        (is (= "update" (sync-status (:id metric))))))))

(deftest remove-dimension-marks-card-dirty-test
  (testing "POST /api/metric/:id/dimension/remove marks the metric dirty for remote sync"
    (with-synced-metric [metric]
      (mt/user-http-request :crowberto :post 200 (str "metric/" (:id metric) "/dimension/remove")
                            {:dimension_ids [(dimension-id metric "PRICE")]})
      (is (= "update" (sync-status (:id metric)))))))

(deftest set-default-dimension-marks-card-dirty-test
  (testing "POST /api/metric/:id/dimension/set-default marks the metric dirty for remote sync"
    (with-synced-metric [metric]
      (mt/user-http-request :crowberto :post 200 (str "metric/" (:id metric) "/dimension/set-default")
                            {:dimension_id (dimension-id metric "PRICE")})
      (is (= "update" (sync-status (:id metric)))))))

(deftest reorder-dimensions-marks-card-dirty-test
  (testing "POST /api/metric/:id/dimension/reorder marks the metric dirty for remote sync"
    (with-synced-metric [metric]
      (let [ids (mapv :id (:dimensions metric))]
        (mt/user-http-request :crowberto :post 200 (str "metric/" (:id metric) "/dimension/reorder")
                              {:dimension_ids (vec (reverse ids))})
        (is (= "update" (sync-status (:id metric))))))))

(deftest update-dimension-marks-card-dirty-test
  (testing "POST /api/metric/:id/dimension/:dimension-key marks the metric dirty for remote sync"
    (with-synced-metric [metric]
      (mt/user-http-request :crowberto :post 200
                            (str "metric/" (:id metric) "/dimension/" (dimension-id metric "PRICE"))
                            {:display_name "Cost"})
      (is (= "update" (sync-status (:id metric)))))))

(deftest no-op-dimension-write-leaves-card-synced-test
  (testing "a dimension write that does not change the metric's serialized content leaves it synced"
    (with-synced-metric [metric]
      (mt/user-http-request :crowberto :post 200 (str "metric/" (:id metric) "/dimension/reorder")
                            {:dimension_ids (mapv :id (:dimensions metric))})
      (is (= "synced" (sync-status (:id metric)))))))

(deftest pre-curation-metric-content-hash-is-stable-test
  (testing "A metric that predates curated dimensions has no stored dimensions — the `card_schema`
            23→24 upgrade synthesizes them on every read, and nothing persists that. Its exported
            content therefore has to be identical read to read, or every such metric would look
            permanently dirty after a customer upgrades."
    (mt/with-temp [:model/Collection collection {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Card       metric     {:name          "Pre-curation Metric"
                                                 :type          :metric
                                                 :collection_id (:id collection)
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query (metric-query)}]
      (t2/query-one {:update :report_card
                     :set    {:card_schema 23 :dimensions nil :dimension_mappings nil}
                     :where  [:= :id (:id metric)]})
      (let [content-hash #(source/row->content-hash {:model_type "Card" :model_id (:id metric)})]
        (is (= (content-hash) (content-hash) (content-hash))
            "the upgrade derives its dimension ids from each mapping target instead of generating
             them, so the content hash settles on the first read")))))

(deftest reading-dimensions-leaves-card-synced-test
  (testing "GET /api/metric/:id/dimension does not dirty the metric — a read-triggered dimension
            refresh is not a user edit"
    (with-synced-metric [metric]
      (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric) "/dimension"))
      (is (= "synced" (sync-status (:id metric)))))))
