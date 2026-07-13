(ns metabase.agent-api.get-content-test
  "The v2 `get_content` tool: the generic typed fetch. One tool, thirteen types, mixed batches, and a bad id
   that stays in its own element instead of sinking the call."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.get-content :as get-content]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- get-content!
  ([body] (get-content! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/content" body)))

(defn- refusal!
  ([body] (refusal! 400 body))
  ([status body]
   (let [response (get-content! :rasta status body)]
     (if (string? response) response (pr-str response)))))

(defn- element!
  "The one element a single-item call returns."
  [body]
  (first (:data (get-content! body))))

(defn- mbql-card
  "A question over the sample database's ORDERS table, so its query has something portable to export to."
  [attrs]
  (merge {:name          "AgentV2 Question"
          :database_id   (mt/id)
          :table_id      (mt/id :orders)
          :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}
         attrs))

;;; ──────────────────────────────────────────────────────────────────
;;; The batch
;;; ──────────────────────────────────────────────────────────────────

(deftest mixed-batch-test
  (testing "a dashboard and its two questions come back in one call, each with its own type's fields"
    (mt/with-temp [:model/Card      one  (mbql-card {:name "AgentV2 One"})
                   :model/Card      two  (mbql-card {:name "AgentV2 Two"})
                   :model/Dashboard dash {:name "AgentV2 Dash"}]
      (let [response (get-content! {:items [{:type "dashboard" :id (:id dash)}
                                            {:type "question" :id (:id one)}
                                            {:type "question" :id (:id two)}]})]
        (is (= 3 (:returned response) (:total response)))
        (is (= [["dashboard" "AgentV2 Dash"] ["question" "AgentV2 One"] ["question" "AgentV2 Two"]]
               (mapv (juxt :type :name) (:data response))))
        (testing "and each element echoes the type and id it was addressed by"
          (is (= [(:id dash) (:id one) (:id two)]
                 (mapv :id (:data response)))))))))

(deftest fault-isolation-test
  (testing "an id that names nothing errors in its own element; the rest of the batch succeeds"
    (mt/with-temp [:model/Card card (mbql-card {})]
      (let [response (get-content! {:items [{:type "question" :id Integer/MAX_VALUE}
                                            {:type "question" :id (:id card)}]})
            [missing found] (:data response)]
        (is (= 2 (:returned response)))
        (is (= {:type "question" :id Integer/MAX_VALUE} (dissoc missing :error)))
        (is (string? (:error missing)))
        (is (= (:id card) (:id found)))
        (is (nil? (:error found)))))))

(deftest forbidden-item-is-isolated-test
  (testing "an entity the caller may not read errors in its own element, not the whole call"
    (mt/with-temp [:model/Collection private-coll {:name "AgentV2 Locked"}
                   :model/Card       hidden (mbql-card {:name "AgentV2 Hidden"
                                                        :collection_id (:id private-coll)})
                   :model/Card       open   (mbql-card {:name "AgentV2 Open"})]
      (mt/with-non-admin-groups-no-collection-perms private-coll
        (let [response        (get-content! {:items [{:type "question" :id (:id hidden)}
                                                     {:type "question" :id (:id open)}]})
              [denied allowed] (:data response)]
          (is (some? (:error denied)))
          (is (= "AgentV2 Open" (:name allowed))))))))

(deftest batch-cap-test
  (mt/with-temp [:model/Card card (mbql-card {})]
    (testing "asking for more than the cap names the cap and the count asked for"
      (let [items (repeat (inc get-content/max-items) {:type "question" :id (:id card)})]
        (is (re-find #"at most 10 items per call"
                     (refusal! {:items (vec items)})))))
    (testing "an empty batch says where the ids come from"
      (is (re-find #"search" (refusal! {:items []}))))))

(deftest entity-id-ref-test
  (testing "an item takes an entity_id wherever it takes a numeric id"
    (mt/with-temp [:model/Card card (mbql-card {:name "AgentV2 Eid"})]
      (let [response (element! {:items [{:type "question" :id (:entity_id card)}]})]
        (testing "and the element echoes the numeric id it resolved to"
          (is (= (:id card) (:id response)))
          (is (= "AgentV2 Eid" (:name response))))))))

(deftest wrong-flavor-names-the-right-one-test
  (testing "asking for a metric's id as a question says which type it actually is"
    (mt/with-temp [:model/Card metric (mbql-card {:type :metric})]
      (is (re-find #"is a metric, not a question"
                   (:error (element! {:items [{:type "question" :id (:id metric)}]})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Projections
;;; ──────────────────────────────────────────────────────────────────

(deftest question-concise-says-what-it-is-built-on-test
  (mt/with-temp [:model/Card card (mbql-card {})]
    (let [concise (element! {:items [{:type "question" :id (:id card)}]})]
      (testing "the concise question is REST property names, and carries its three source FKs"
        (is (= #{:type :id :name :display :description :database_id :table_id :source_card_id
                 :collection_id :archived}
               (set (keys concise)))))
      (is (= (mt/id) (:database_id concise)))
      (is (= (mt/id :orders) (:table_id concise))))))

(deftest detailed-is-the-whole-record-test
  (mt/with-temp [:model/Card card (mbql-card {})]
    (let [concise  (element! {:items [{:type "question" :id (:id card)}]})
          detailed (element! {:items [{:type "question" :id (:id card)}] :response_format "detailed"})]
      (is (< (count (keys concise)) (count (keys detailed))))
      (testing "detail carries the fields concise does not — the stored query, the creator, the timestamps"
        (is (contains? detailed :dataset_query))
        (is (contains? detailed :creator_id))
        (is (contains? detailed :updated_at))))))

(deftest dashboard-concise-is-the-editing-skeleton-test
  (mt/with-temp [:model/Card          card {:name "AgentV2 Card"}
                 :model/Dashboard     dash {:name "AgentV2 Skeleton"
                                            :parameters [{:id "abc12345" :name "Category" :slug "category"
                                                          :type "string/="}]}
                 :model/DashboardTab  tab  {:dashboard_id (:id dash) :name "Tab One" :position 0}
                 :model/DashboardCard dc   {:dashboard_id      (:id dash)
                                            :card_id           (:id card)
                                            :dashboard_tab_id  (:id tab)
                                            :row 0 :col 0 :size_x 8 :size_y 6
                                            :parameter_mappings [{:parameter_id "abc12345"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension [:field 1 nil]]}]}]
    (let [concise (element! {:items [{:type "dashboard" :id (:id dash)}]})]
      (testing "the skeleton carries every input the op grammar takes"
        (is (= [{:id (:id tab) :name "Tab One"}] (:tabs concise)))
        (is (= [{:id "abc12345" :name "Category" :type "string/=" :dashcard_ids [(:id dc)]}]
               (:parameters concise)))
        (is (= [{:id               (:id dc)
                 :kind             "card"
                 :dashboard_tab_id (:id tab)
                 :row              0
                 :col              0
                 :size_x           8
                 :size_y           6
                 :card_id          (:id card)
                 :card_name        "AgentV2 Card"}]
               (:dashcards concise))))
      (testing "and never the raw dashcard — the nested card, its query, its visualization settings"
        (is (not-any? #(contains? % :visualization_settings) (:dashcards concise)))
        (is (not-any? #(contains? % :card) (:dashcards concise)))))))

(deftest dashboard-skeleton-carries-inline-parameters-test
  (testing "a parameter placed on a card is wiring the skeleton has to show, or an agent reads it as unattached"
    (mt/with-temp [:model/Card          card {:name "AgentV2 Card"}
                   :model/Dashboard     dash {:name "AgentV2 Inline"}
                   :model/DashboardCard _    {:dashboard_id      (:id dash)
                                              :card_id           (:id card)
                                              :row 0 :col 0 :size_x 8 :size_y 6
                                              :inline_parameters ["ip1"]}]
      (let [concise (element! {:items [{:type "dashboard" :id (:id dash)}]})]
        (is (= [["ip1"]] (mapv :inline_parameter_ids (:dashcards concise))))))))

(deftest dashboard-virtual-cards-are-named-by-kind-test
  (mt/with-temp [:model/Dashboard     dash {:name "AgentV2 Text"}
                 :model/DashboardCard _    {:dashboard_id (:id dash)
                                            :row 0 :col 0 :size_x 4 :size_y 1
                                            :visualization_settings {:virtual_card {:display "text"}
                                                                     :text         "Some prose"}}]
    (let [concise (element! {:items [{:type "dashboard" :id (:id dash)}]})]
      (is (= ["text"] (mapv :kind (:dashcards concise))))
      (is (nil? (:card_id (first (:dashcards concise))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; include
;;; ──────────────────────────────────────────────────────────────────

(deftest definition-round-trips-into-a-write-test
  (testing "a question's `definition` is the portable dialect, with name-array refs and a table-path source"
    (mt/with-temp [:model/Card card (mbql-card {})]
      (let [definition (:definition (element! {:items [{:type "question" :id (:id card)}]
                                               :include ["definition"]}))
            stage      (first (:stages definition))]
        (is (= "mbql/query" (:lib/type definition)))
        (testing "the source is a table-name path, not a numeric id"
          (is (= ["test-data (h2)" "PUBLIC" "ORDERS"] (:source-table stage))))
        (is (= ["count"] (mapv first (:aggregation stage)))))))
  (testing "and the query tools accept it unchanged — read, modify, write round-trips"
    (mt/with-temp [:model/Card card (mbql-card {})]
      (let [definition (:definition (element! {:items [{:type "question" :id (:id card)}]
                                               :include ["definition"]}))
            constructed (mt/user-http-request :rasta :post 200 "agent/v2/construct-query"
                                              {:query definition})]
        (is (string? (:query constructed)))))))

(deftest layout-include-carries-the-raw-dashcards-test
  (mt/with-temp [:model/Card          card {:name "AgentV2 Card"}
                 :model/Dashboard     dash {:name "AgentV2 Layout"}
                 :model/DashboardCard _    {:dashboard_id (:id dash)
                                            :card_id      (:id card)
                                            :row 0 :col 0 :size_x 8 :size_y 6
                                            :visualization_settings {:card.title "Renamed"}}]
    (let [layout (:layout (element! {:items [{:type "dashboard" :id (:id dash)}] :include ["layout"]}))]
      (testing "the layout is what patch_dashcard edits: the settings the skeleton drops"
        (is (= {:card.title "Renamed"}
               (:visualization_settings (first (:dashcards layout)))))))))

(deftest revisions-include-test
  (testing "`revisions` returns the change history of a card without pulling the whole bundle"
    (mt/with-temp [:model/Card card (mbql-card {:name "AgentV2 Revised"})]
      (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:name "AgentV2 Renamed"})
      (let [revisions (:revisions (element! {:items [{:type "question" :id (:id card)}]
                                             :include ["revisions"]}))]
        (is (seq revisions))
        (is (= #{:id :timestamp :user :description :is_creation :is_reversion}
               (set (keys (first revisions)))))
        (testing "and the id each row carries is the one revert_content takes"
          (is (every? (comp int? :id) revisions)))))))

(deftest fields-include-test
  (testing "`fields` returns the columns the question itself returns"
    (mt/with-temp [:model/Card card (mbql-card {:result_metadata [{:name         "count"
                                                                   :display_name "Count"
                                                                   :base_type    :type/Integer}]})]
      (let [fields (:fields (element! {:items [{:type "question" :id (:id card)}] :include ["fields"]}))]
        (is (= ["count"] (mapv :name fields)))
        (is (= ["Count"] (mapv :display_name fields)))))))

(deftest parameters-include-carries-a-native-question-s-template-tags-test
  (testing "the tags are the same filters seen from the SQL side, so they ride with the parameters"
    (mt/with-temp [:model/Card card {:name          "AgentV2 Native"
                                     :database_id   (mt/id)
                                     :dataset_query (mt/native-query
                                                     {:query "SELECT * FROM ORDERS WHERE ID = {{oid}}"
                                                      :template-tags
                                                      {"oid" {:id           "t1"
                                                              :name         "oid"
                                                              :display-name "Oid"
                                                              :type         :number}}})}]
      (let [item (element! {:items [{:type "question" :id (:id card)}] :include ["parameters"]})]
        (testing "and the section's keys sit on the element, not nested under a second `parameters`"
          (is (= [] (:parameters item)))
          (is (= ["oid"] (mapv name (keys (:template_tags item)))))
          (is (= "Oid" (get-in item [:template_tags :oid :display-name]))))))))

(deftest parameters-include-on-a-dashboard-test
  (testing "a dashboard has parameters and no template tags"
    (mt/with-temp [:model/Dashboard dash {:name       "AgentV2 Params"
                                          :parameters [{:id "abc12345" :name "Category"
                                                        :slug "category" :type "string/="}]}]
      (let [item (element! {:items [{:type "dashboard" :id (:id dash)}] :include ["parameters"]})]
        (is (= ["Category"] (mapv :name (:parameters item))))
        (is (not (contains? item :template_tags)))))))

(deftest dimensions-include-test
  (testing "`dimensions` returns the columns a query using the metric may break out on"
    (mt/with-temp [:model/Card metric (mbql-card {:name "AgentV2 Metric" :type :metric})]
      (let [dimensions (:dimensions (element! {:items   [{:type "metric" :id (:id metric)}]
                                               :include ["dimensions"]}))]
        (is (seq dimensions) "a metric over ORDERS has columns to group by")
        (testing "in REST property names, never lib's kebab-case dialect"
          (is (= #{:id :name :display_name :description :base_type :semantic_type :table_id
                   :fk_target_field_id}
                 (set (keys (first dimensions))))))
        (testing "and they reach through the foreign keys, as a breakout may"
          (is (contains? (set (map :table_id dimensions)) (mt/id :products))))))))

(defn- orders-subtotal-query
  "A lib query over ORDERS, and its SUBTOTAL column — the raw material for a measure's or segment's
   definition, which the models store as MBQL 5."
  []
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
    [query (lib.metadata/field mp (mt/id :orders :subtotal))]))

(defn- subtotal-ref
  "The portable field reference inside a clause: `[\"field\", {opts}, [db, schema, table, column]]`."
  [field-clause]
  (vec (last field-clause)))

(deftest measure-and-segment-definitions-are-portable-test
  (testing "a measure's `definition` is its aggregation clause, a segment's its filters — both portable"
    (let [[query subtotal] (orders-subtotal-query)]
      (mt/with-temp [:model/Segment segment {:name       "AgentV2 Segment"
                                             :table_id   (mt/id :orders)
                                             :definition (lib/filter query (lib/> subtotal 100))}
                     :model/Measure measure {:name       "AgentV2 Measure"
                                             :table_id   (mt/id :orders)
                                             :definition (lib/aggregate query (lib/sum subtotal))}]
        (let [seg-def  (:definition (element! {:items   [{:type "segment" :id (:id segment)}]
                                               :include ["definition"]}))
              meas-def (:definition (element! {:items   [{:type "measure" :id (:id measure)}]
                                               :include ["definition"]}))]
          (testing "the segment's filter, with a name-array field ref rather than a numeric id"
            (is (= [">"] (mapv first seg-def)))
            (is (= ["test-data (h2)" "PUBLIC" "ORDERS" "SUBTOTAL"]
                   (subtotal-ref (nth (first seg-def) 2)))))
          (testing "the measure's aggregation, likewise"
            (is (= ["sum"] (mapv first meas-def)))
            (is (= ["test-data (h2)" "PUBLIC" "ORDERS" "SUBTOTAL"]
                   (subtotal-ref (nth (first meas-def) 2))))))))))

(deftest include-that-does-not-fit-is-skipped-and-named-test
  (testing "`layout` on a collection is skipped for that item and named in its result, not an error"
    (mt/with-temp [:model/Collection coll {:name "AgentV2 Coll"}
                   :model/Dashboard  dash {:name "AgentV2 Dash"}]
      (let [response (get-content! {:items [{:type "collection" :id (:id coll)}
                                            {:type "dashboard" :id (:id dash)}]
                                    :include ["layout"]})
            [collection dashboard] (:data response)]
        (is (nil? (:error collection)))
        (is (= ["layout"] (mapv :include (:skipped_includes collection))))
        (is (re-find #"applies to dashboard" (:message (first (:skipped_includes collection)))))
        (testing "and the item it does fit gets it"
          (is (contains? dashboard :layout))
          (is (nil? (:skipped_includes dashboard))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; fields
;;; ──────────────────────────────────────────────────────────────────

(deftest fields-picks-paths-across-a-mixed-batch-test
  (mt/with-temp [:model/Card      card {:name "AgentV2 Q" :collection_id nil}
                 :model/Dashboard dash {:name "AgentV2 D" :collection_id nil}]
    (let [response (get-content! {:items  [{:type "question" :id (:id card)}
                                           {:type "dashboard" :id (:id dash)}]
                                  :fields ["id" "collection_id"]})]
      (testing "each item carries exactly the picked paths, plus the type and id it is addressed by"
        (is (= [#{:type :id :collection_id} #{:type :id :collection_id}]
               (mapv (comp set keys) (:data response))))))))

(deftest fields-overrides-response-format-test
  (mt/with-temp [:model/Card card (mbql-card {})]
    (let [item (element! {:items           [{:type "question" :id (:id card)}]
                          :fields          ["name"]
                          :response_format "detailed"})]
      (is (= #{:type :id :name} (set (keys item)))))))

(deftest unknown-field-path-teaches-the-valid-ones-test
  (mt/with-temp [:model/Card card (mbql-card {})]
    (let [message (:error (element! {:items [{:type "question" :id (:id card)}] :fields ["nope"]}))]
      (is (re-find #"Unknown field \"nope\"" message))
      (is (re-find #"collection_id" message)))))

(deftest document-body-is-markdown-test
  (mt/with-temp [:model/Document doc {:name     "AgentV2 Doc"
                                      :document {:type    "doc"
                                                 :content [{:type    "paragraph"
                                                            :content [{:type "text" :text "Revenue grew."}]}]}}]
    (let [concise (element! {:items [{:type "document" :id (:id doc)}]})]
      (is (= "Revenue grew." (:content_markdown concise)))
      (testing "and the stored ProseMirror tree is not in the response — nothing consumes it"
        (is (not (contains? concise :document))))
      (testing "detailed keeps the Markdown and still drops the tree"
        (let [detailed (element! {:items [{:type "document" :id (:id doc)}] :response_format "detailed"})]
          (is (= "Revenue grew." (:content_markdown detailed)))
          (is (not (contains? detailed :document))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events — the same trail the app's own read leaves
;;; ──────────────────────────────────────────────────────────────────

(defn- read-events!
  "The `:event/*-read` topics `get_content` publishes for `items`, as `[topic object-id]` pairs."
  [items]
  (let [published (atom [])]
    (mt/with-test-user :rasta
      (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]) event)]
        (get-content/get-content {:items items})))
    (for [[topic {:keys [object object-id]}] @published]
      [topic (or object-id (:id object))])))

(deftest read-events-match-the-rest-endpoints-test
  (testing "a tool read leaves the trail the app's read leaves — the same topics, and no others"
    (mt/with-temp [:model/Dashboard  dash {:name "AgentV2 Trail"}
                   :model/Document   doc  {:name "AgentV2 Doc"}
                   :model/Collection coll {:name "AgentV2 Coll"}
                   :model/Card       card (mbql-card {})]
      (testing "reading a dashboard marks it viewed, as GET /api/dashboard/:id does"
        (is (= [[:event/dashboard-read (:id dash)]]
               (read-events! [{:type "dashboard" :id (:id dash)}]))))
      (testing "and a document, as GET /api/document/:id does"
        (is (= [[:event/document-read (:id doc)]]
               (read-events! [{:type "document" :id (:id doc)}]))))
      (testing "a collection does not: GET /api/collection/:id publishes nothing, and a collection is
                marked viewed by opening it — which is browse_collection's listing, not this read"
        (is (= [] (read-events! [{:type "collection" :id (:id coll)}]))))
      (testing "nor a card: its REST read publishes nothing either — :event/card-read comes from the
                query processor when a card is run"
        (is (= [] (read-events! [{:type "question" :id (:id card)}])))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Every type round-trips
;;; ──────────────────────────────────────────────────────────────────

(deftest timeline-carries-its-events-test
  (testing "a timeline reads with the event ids timeline_event_write updates"
    (mt/with-temp [:model/Collection    coll  {:name "AgentV2 Timelines"}
                   :model/Timeline      tl    {:name "AgentV2 Releases" :collection_id (:id coll)}
                   :model/TimelineEvent event {:name "v50" :timeline_id (:id tl)
                                               :timestamp #t "2026-03-03T00:00:00Z"}]
      (let [item (element! {:items [{:type "timeline" :id (:id tl)}]})]
        (is (= "AgentV2 Releases" (:name item)))
        (is (= [(:id event)] (mapv :id (:events item))))))))

(deftest transform-is-read-only-test
  (testing "a transform reads, and its definition exports to the portable dialect"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/Transform transform {:name   "AgentV2 Transform"
                                                 :source {:type  "query"
                                                          :query (mt/mbql-query orders)}
                                                 :target {:type "table" :schema "PUBLIC" :name "agent_v2_out"}}]
        (let [item (first (:data (get-content! :crowberto 200
                                               {:items   [{:type "transform" :id (:id transform)}]
                                                :include ["definition"]})))]
          (is (= "AgentV2 Transform" (:name item)))
          (is (= ["test-data (h2)" "PUBLIC" "ORDERS"]
                 (:source-table (first (get-in item [:definition :stages]))))))))))

(deftest each-type-reads-test
  (testing "every type in the catalog has a read behind it"
    (mt/with-temp [:model/Collection          coll    {:name "AgentV2 Types"}
                   :model/Card                question (mbql-card {:name "AgentV2 Question"})
                   :model/Card                model   (mbql-card {:name "AgentV2 Model" :type :model})
                   :model/Card                metric  (mbql-card {:name "AgentV2 Metric" :type :metric})
                   :model/Dashboard           dash    {:name "AgentV2 Dashboard"}
                   :model/Document            doc     {:name "AgentV2 Document"}
                   :model/NativeQuerySnippet  snippet {:name "AgentV2 Snippet" :content "WHERE 1 = 1"}
                   :model/Segment             segment {:name "AgentV2 Segment" :table_id (mt/id :orders)}
                   :model/Measure             measure {:name "AgentV2 Measure" :table_id (mt/id :orders)}
                   :model/Timeline            timeline {:name "AgentV2 Timeline"}]
      (doseq [[type id expected] [["collection" (:id coll)     "AgentV2 Types"]
                                  ["question"   (:id question) "AgentV2 Question"]
                                  ["model"      (:id model)    "AgentV2 Model"]
                                  ["metric"     (:id metric)   "AgentV2 Metric"]
                                  ["dashboard"  (:id dash)     "AgentV2 Dashboard"]
                                  ["document"   (:id doc)      "AgentV2 Document"]
                                  ["snippet"    (:id snippet)  "AgentV2 Snippet"]
                                  ["segment"    (:id segment)  "AgentV2 Segment"]
                                  ["measure"    (:id measure)  "AgentV2 Measure"]
                                  ["timeline"   (:id timeline) "AgentV2 Timeline"]]]
        (testing type
          (let [item (element! {:items [{:type type :id id}]})]
            (is (nil? (:error item)))
            (is (= expected (:name item)))
            (is (= type (:type item)))))))))
