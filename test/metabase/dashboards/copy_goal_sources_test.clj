(ns metabase.dashboards.copy-goal-sources-test
  "Copying a dashboard or a document copies the cards its dynamic goals read by the same rule as the cards it shows,
  and points the copy's goals at those copies."
  {:clj-kondo/config '{:linters {:deprecated-var
                                 {:exclude {metabase.test.data/mbql-query
                                            {:namespaces [metabase.dashboards.copy-goal-sources-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- goal [card-id]
  {:id card-id :type "card" :column "count"})

(defn- goal-viz
  "Line-chart viz settings whose goal line reads `card-id`."
  [card-id]
  {:graph.show_goal true :graph.goal_value (goal card-id)})

(defn- goal-id [viz-settings]
  (get-in viz-settings [:graph.goal_value :id]))

(defn- count-query []
  (mt/mbql-query venues {:aggregation [[:count]]}))

(defn- card-props [card-name collection-id & {:as more}]
  (merge {:name card-name :collection_id collection-id :display :line :dataset_query (count-query)} more))

(defn- deep-copy!
  ([dash-id dest]
   (deep-copy! :crowberto dash-id dest))
  ([user dash-id dest]
   (mt/user-http-request user :post 200 (format "dashboard/%d/copy" dash-id)
                         {:name "Copy" :collection_id dest :is_deep_copy true})))

(defn- cards-in [collection-id]
  (into {} (map (juxt :name identity)) (t2/select :model/Card :collection_id collection-id)))

(defn- dashcards-of [dash-id]
  (t2/select :model/DashboardCard :dashboard_id dash-id {:order-by [[:id :asc]]}))

(deftest deep-copy-copies-goal-only-collection-question-test
  (testing "deep copy duplicates a collection question read only by a goal into the destination and rewires the goal"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {source :id} (card-props "Source" src)
                     :model/Card {chart :id} (card-props "Chart" src :visualization_settings (goal-viz source))
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id chart}]
        (let [copy   (deep-copy! dash dest)
              copied (cards-in dest)]
          (is (= #{"Source" "Chart"} (set (keys copied))))
          (is (= (:id (copied "Source")) (goal-id (:visualization_settings (copied "Chart")))))
          (is (= [(:id (copied "Chart"))] (map :card_id (dashcards-of (:id copy)))))
          (testing "the copy is not reported as uncopied, and the original is untouched"
            (is (nil? (:uncopied copy)))
            (is (= source (goal-id (t2/select-one-fn :visualization_settings :model/Card :id chart))))))))))

(deftest shallow-copy-keeps-goal-sources-test
  (testing "shallow copy duplicates no collection question, so goals keep reading the original"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {source :id} (card-props "Source" src)
                     :model/Card {chart :id} (card-props "Chart" src)
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id chart
                                             :visualization_settings (goal-viz source)}]
        (let [copy (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/copy" dash)
                                         {:name "Copy" :collection_id dest :is_deep_copy false})]
          (is (empty? (cards-in dest)))
          (is (= [source] (map (comp goal-id :visualization_settings) (dashcards-of (:id copy))))))))))

(deftest placed-and-dashboard-question-goal-sources-test
  (testing "a goal source the copy duplicates anyway is copied once and every goal reading it is rewired"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/Card {placed :id} (card-props "Placed" src)
                     :model/Card {dq :id} (card-props "DQ" src :dashboard_id dash)
                     :model/Card {a :id} (card-props "A" src :visualization_settings (goal-viz placed))
                     :model/Card {b :id} (card-props "B" src :dashboard_id dash :visualization_settings (goal-viz dq))
                     :model/DashboardCard _ {:dashboard_id dash :card_id placed}
                     :model/DashboardCard _ {:dashboard_id dash :card_id dq}
                     :model/DashboardCard _ {:dashboard_id dash :card_id a}
                     :model/DashboardCard _ {:dashboard_id dash :card_id b :visualization_settings (goal-viz placed)}]
        (let [copy   (deep-copy! dash dest)
              copied (cards-in dest)]
          (is (= #{"Placed" "DQ" "A" "B"} (set (keys copied))))
          (is (= (:id (copied "Placed")) (goal-id (:visualization_settings (copied "A")))))
          (is (= (:id (copied "DQ")) (goal-id (:visualization_settings (copied "B")))))
          (is (= (:id (copied "Placed"))
                 (some (comp goal-id :visualization_settings) (dashcards-of (:id copy))))))))))

(deftest shared-dashcard-and-visualizer-goal-source-test
  (testing "a goal-only source read by several dashcards, one through a visualizer, is copied once"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {source :id} (card-props "Source" src)
                     :model/Card {a :id} (card-props "A" src)
                     :model/Card {b :id} (card-props "B" src)
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id a :visualization_settings (goal-viz source)}
                     :model/DashboardCard _ {:dashboard_id dash :card_id b
                                             :visualization_settings {:visualization
                                                                      {:display  "line"
                                                                       :settings (goal-viz source)}}}]
        (let [copy      (deep-copy! dash dest)
              copied    (cards-in dest)
              source'   (:id (copied "Source"))
              [dc1 dc2] (dashcards-of (:id copy))]
          (is (= #{"Source" "A" "B"} (set (keys copied))))
          (is (= source' (goal-id (:visualization_settings dc1))))
          (is (= source' (goal-id (get-in dc2 [:visualization_settings :visualization :settings])))))))))

(deftest hidden-goal-and-metric-sources-test
  (testing "a goal hidden by its toggle and a metric goal source are copied too"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {hidden :id} (card-props "Hidden" src)
                     :model/Card {metric :id} (card-props "Metric" src :type :metric)
                     :model/Card {a :id} (card-props "A" src :visualization_settings (assoc (goal-viz hidden)
                                                                                            :graph.show_goal false))
                     :model/Card {b :id} (card-props "B" src :visualization_settings (goal-viz metric))
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id a}
                     :model/DashboardCard _ {:dashboard_id dash :card_id b}]
        (deep-copy! dash dest)
        (let [copied (cards-in dest)]
          (is (= #{"Hidden" "Metric" "A" "B"} (set (keys copied))))
          (is (= :metric (:type (copied "Metric"))))
          (is (= (:id (copied "Hidden")) (goal-id (:visualization_settings (copied "A")))))
          (is (= (:id (copied "Metric")) (goal-id (:visualization_settings (copied "B"))))))))))

(deftest goal-chains-test
  (testing "only direct goal sources are copied; a copied source's own goal is rewired only to a card copied anyway"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {far :id} (card-props "Far" src)
                     :model/Card {placed :id} (card-props "Placed" src)
                     :model/Card {near :id} (card-props "Near" src :visualization_settings (goal-viz far))
                     :model/Card {near2 :id} (card-props "Near2" src :visualization_settings (goal-viz placed))
                     :model/Card {a :id} (card-props "A" src :visualization_settings (goal-viz near))
                     :model/Card {b :id} (card-props "B" src :visualization_settings (goal-viz near2))
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id a}
                     :model/DashboardCard _ {:dashboard_id dash :card_id b}
                     :model/DashboardCard _ {:dashboard_id dash :card_id placed}]
        (deep-copy! dash dest)
        (let [copied (cards-in dest)]
          (is (= #{"Near" "Near2" "Placed" "A" "B"} (set (keys copied))))
          (is (= far (goal-id (:visualization_settings (copied "Near")))))
          (is (= (:id (copied "Placed")) (goal-id (:visualization_settings (copied "Near2"))))))))))

(deftest goal-sources-without-a-clean-copy-test
  (testing "archived sources, models, another dashboard's or a document's cards keep their refs and aren't copied"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Dashboard {other :id} {:collection_id src}
                     :model/Document {doc :id} {:name "Doc" :collection_id src
                                                :content_type prose-mirror/prose-mirror-content-type}
                     :model/Card {archived :id} (card-props "Archived" src :archived true)
                     :model/Card {model :id} (card-props "Model" src :type :model)
                     :model/Card {other-dq :id} (card-props "Other DQ" src :dashboard_id other)
                     :model/Card {doc-card :id} (card-props "Doc card" src :document_id doc)
                     :model/Dashboard {dash :id} {:collection_id src}]
        (let [sources [archived model other-dq doc-card]]
          (doseq [source sources]
            (let [chart (t2/insert-returning-pk! :model/Card (assoc (card-props (str "Chart " source) src)
                                                                    :visualization_settings (goal-viz source)
                                                                    :creator_id (mt/user->id :crowberto)))]
              (t2/insert! :model/DashboardCard {:dashboard_id dash :card_id chart
                                                :row 0 :col 0 :size_x 4 :size_y 4})))
          (deep-copy! dash dest)
          (let [copied (cards-in dest)]
            (is (= (set (map #(str "Chart " %) sources)) (set (keys copied))))
            (is (= (set sources) (set (map (comp goal-id :visualization_settings) (vals copied)))))))))))

(deftest unreadable-goal-source-non-admin-test
  (testing "a non-admin's deep copy keeps a ref to a source they can't read, and the rewired refs pass the save gate"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/Card :model/Dashboard]
        (mt/with-temp [:model/Collection {src :id} {}
                       :model/Collection {dest :id} {}
                       :model/Collection {secret :id} {}
                       :model/Card {hidden :id} (card-props "Secret" secret)
                       :model/Card {source :id} (card-props "Source" src)
                       :model/Card {a :id} (card-props "A" src :visualization_settings (goal-viz source))
                       :model/Card {b :id} (card-props "B" src :visualization_settings (goal-viz hidden))
                       :model/Dashboard {dash :id} {:collection_id src}
                       :model/DashboardCard _ {:dashboard_id dash :card_id a}
                       :model/DashboardCard _ {:dashboard_id dash :card_id b}]
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) src)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) dest)
          (let [copy   (deep-copy! :rasta dash dest)
                copied (cards-in dest)]
            (is (= #{"Source" "A" "B"} (set (keys copied))))
            (is (= (:id (copied "Source")) (goal-id (:visualization_settings (copied "A")))))
            (is (= hidden (goal-id (:visualization_settings (copied "B")))))
            (is (nil? (:uncopied copy)))))))))

(deftest copied-card-revision-test
  (testing "the first revision of a copied card holds its rewired goal"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Revision]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {source :id} (card-props "Source" src)
                     :model/Card {chart :id} (card-props "Chart" src :visualization_settings (goal-viz source))
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id chart}]
        (deep-copy! dash dest)
        (let [{chart' "Chart" source' "Source"} (cards-in dest)
              revision (t2/select-one :model/Revision :model "Card" :model_id (:id chart'))]
          (is (= (:id source') (goal-id (get-in revision [:object :visualization_settings])))))))))

(deftest write-path-copy-test
  (testing "a copy made outside the REST endpoint (as MCP makes it) copies goal sources the same way"
    (mt/with-model-cleanup [:model/Card :model/Dashboard]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {source :id} (card-props "Source" src)
                     :model/Card {chart :id} (card-props "Chart" src)
                     :model/Dashboard {dash :id} {:collection_id src}
                     :model/DashboardCard _ {:dashboard_id dash :card_id chart
                                             :visualization_settings (goal-viz source)}]
        (let [copy (mt/with-current-user (mt/user->id :crowberto)
                     (dashboards.write/copy-dashboard! dash {:name "Copy" :collection_id dest :is_deep_copy true}))
              copied (cards-in dest)]
          (is (= #{"Source" "Chart"} (set (keys copied))))
          (is (= [(:id (copied "Source"))] (map (comp goal-id :visualization_settings) (dashcards-of (:id copy))))))))))

(deftest document-copy-goal-sources-test
  (testing "document copy rewires goals between its own cards and keeps goals reading collection questions"
    (mt/with-model-cleanup [:model/Card :model/Document]
      (mt/with-temp [:model/Collection {src :id} {}
                     :model/Collection {dest :id} {}
                     :model/Card {coll-source :id} (card-props "Collection source" src)
                     :model/Document {doc :id} {:name "Doc" :collection_id src
                                                :content_type prose-mirror/prose-mirror-content-type}
                     :model/Card {doc-source :id} (card-props "Doc source" src :document_id doc)
                     :model/Card {a :id} (card-props "A" src :document_id doc
                                                     :visualization_settings (goal-viz doc-source))
                     :model/Card {b :id} (card-props "B" src :document_id doc
                                                     :visualization_settings (goal-viz coll-source))]
        (t2/update! :model/Document :id doc {:document {:type "doc"
                                                        :content [{:type "cardEmbed" :attrs {:id a :name nil}}
                                                                  {:type "cardEmbed" :attrs {:id b :name nil}}]}})
        (let [copy   (mt/user-http-request :crowberto :post 200 (format "document/%d/copy" doc)
                                           {:name "Copy" :collection_id dest})
              copied (into {} (map (juxt :name identity)) (t2/select :model/Card :document_id (:id copy)))]
          (is (= #{"Doc source" "A" "B"} (set (keys copied))))
          (is (= (:id (copied "Doc source")) (goal-id (:visualization_settings (copied "A")))))
          (is (= coll-source (goal-id (:visualization_settings (copied "B")))))
          (is (= #{"Doc source" "A" "B"} (set (keys (cards-in dest)))))
          (testing "the first revision of a copied card holds its rewired goal"
            (is (= (:id (copied "Doc source"))
                   (goal-id (:visualization_settings
                             (t2/select-one-fn :object :model/Revision
                                               :model "Card" :model_id (:id (copied "A")))))))))))))
