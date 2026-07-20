(ns metabase.mcp.v2.tools.content-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.mcp.v2.tools.content/keep-me)

(defn- call-content
  "Invoke get_content through the registry — the same seam the JSON-RPC route uses, so scope
   gating and argument validation are exercised. `token-scopes` of nil means an internal
   caller, which satisfies every scope check."
  ([args] (call-content nil args))
  ([token-scopes args]
   (registry/call-tool token-scopes "test-session" "get_content" args)))

(defn- content-results
  "The `:results` vector from a successful get_content call. Throws when the call was rejected
   before per-item work, so a tool-level error can never masquerade as an empty batch."
  ([args] (content-results nil args))
  ([token-scopes args]
   (let [result (call-content token-scopes args)]
     (when (:isError result)
       (throw (ex-info (str "get_content returned a tool-level error: "
                            (-> result :content first :text))
                       {:result result})))
     (:results (json/decode+kw (-> result :content first :text))))))

(defn- content-one
  ([args] (content-one nil args))
  ([token-scopes args] (first (content-results token-scopes args))))

(defn- content-error
  "The tool-level error text for calls rejected before any per-item work."
  ([args] (content-error nil args))
  ([token-scopes args] (-> (call-content token-scopes args) :content first :text)))

(deftest get-content-question-concise-test
  (testing "GHY-4140: a question read returns its concise projection with the type tag"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Venue Count"
                                              :type          :question
                                              :display       :scalar
                                              :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "question" :id card-id}]})]
          (is (nil? (:error row)))
          (is (= "question" (:type row)))
          (is (= card-id (:id row)))
          (is (= "Venue Count" (:name row)))
          (testing "concise omits the detailed-only columns"
            (is (nil? (:entity_id row)))
            (is (nil? (:created_at row)))))))))

(defn- measure-definition
  "A measure definition needs a real lib query against a synced table."
  [aggregation-clause]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate aggregation-clause))))

(deftest get-content-per-type-happy-path-test
  (testing "GHY-4140: each content type resolves by numeric id and returns a typed row"
    (mt/with-test-user :crowberto
      (testing "model"
        (mt/with-temp [:model/Card {id :id} {:type :model :dataset_query (mt/mbql-query venues)}]
          (let [row (content-one {:items [{:type "model" :id id}]})]
            (is (nil? (:error row)))
            (is (= {:type "model" :id id} (select-keys row [:type :id]))))))
      (testing "metric"
        (mt/with-temp [:model/Card {id :id} {:type          :metric
                                             :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [row (content-one {:items [{:type "metric" :id id}]})]
            (is (nil? (:error row)))
            (is (= "metric" (:type row))))))
      (testing "measure"
        (mt/with-temp [:model/Measure {id :id} {:name       "M1"
                                                :table_id   (mt/id :venues)
                                                :creator_id (mt/user->id :rasta)
                                                :definition (measure-definition (lib/count))}]
          (let [row (content-one {:items [{:type "measure" :id id}]})]
            (is (nil? (:error row)))
            (is (= "M1" (:name row))))))
      (testing "segment"
        (mt/with-temp [:model/Segment {id :id} {:name "S1" :table_id (mt/id :venues) :definition {}}]
          (let [row (content-one {:items [{:type "segment" :id id}]})]
            (is (nil? (:error row)))
            (is (= "S1" (:name row))))))
      (testing "collection"
        (mt/with-temp [:model/Collection {id :id} {:name "C1"}]
          (let [row (content-one {:items [{:type "collection" :id id}]})]
            (is (nil? (:error row)))
            (is (= "C1" (:name row))))))
      (testing "snippet"
        (mt/with-temp [:model/NativeQuerySnippet {id :id} {:name       "snip"
                                                           :content    "wow"
                                                           :creator_id (mt/user->id :lucky)}]
          (let [row (content-one {:items [{:type "snippet" :id id}]})]
            (is (nil? (:error row)))
            (is (= "wow" (:content row))))))
      (testing "document returns flattened body text"
        (mt/with-temp [:model/Document {id :id}
                       {:document     {:type    "doc"
                                       :content [{:type    "paragraph"
                                                  :content [{:type "text" :text "hello"}]}]}
                        :content_type "application/json+vnd.prose-mirror"}]
          (let [row (content-one {:items [{:type "document" :id id}]})]
            (is (nil? (:error row)))
            (is (re-find #"hello" (:markdown row)))))))))

(deftest get-content-dashboard-skeleton-test
  (testing "GHY-4140: a dashboard returns the editing skeleton, never the raw REST dashcards array"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:parameters [{:name "Category" :slug "category"
                                                                     :id   "_CAT_"   :type "category"}]}
                   :model/Card          {card-id :id} {:name "Embedded"}
                   :model/DashboardTab  {tab-id :id}  {:dashboard_id dash-id :name "Tab 1" :position 0}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id       dash-id
                                                       :card_id            card-id
                                                       :dashboard_tab_id   tab-id
                                                       :row                0
                                                       :col                0
                                                       :parameter_mappings [{:parameter_id "_CAT_"
                                                                             :card_id      card-id
                                                                             :target       [:dimension
                                                                                            [:field (mt/id :venues :name) nil]]}]}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "dashboard" :id dash-id}]})]
          (is (nil? (:error row)))
          (is (= [{:id tab-id :name "Tab 1"}] (:tabs row)))
          (testing "each parameter names the dashcards it is wired to"
            (is (= [{:id "_CAT_" :name "Category" :type "category" :dashcard_ids [dc-id]}]
                   (:parameters row))))
          (testing "one summary row per dashcard, with the card reference resolved"
            (is (= [{:id dc-id :kind "card" :card {:id card-id :name "Embedded"}
                     :dashboard_tab_id tab-id :row 0 :col 0}]
                   (mapv #(select-keys % [:id :kind :card :dashboard_tab_id :row :col])
                         (:dashcards row))))))))))

(deftest get-content-alert-test
  (testing "GHY-4140: alert reads carry condition, schedule, and handlers"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query venues)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :subscriptions     [{:type            :notification-subscription/cron
                                          :cron_schedule   "0 0 0 * * ?"
                                          :ui_display_type :cron/builder}]
                     :handlers          [{:channel_type :channel/email
                                          :recipients   [{:type    :notification-recipient/user
                                                          :user_id (mt/user->id :crowberto)}]}]}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "alert" :id (:id notification)}]})]
          (is (nil? (:error row)))
          (is (= "0 0 0 * * ?" (-> row :subscriptions first :cron_schedule)))
          (is (= "channel/email" (-> row :handlers first :channel_type))))))))

(deftest get-content-subscription-pulse-test
  (testing "GHY-4140: a live Pulse row reads as a subscription, with its channels and cards"
    (mt/with-temp [:model/Card         {card-id :id}  {:name "Sub Card"}
                   :model/Dashboard    {dash-id :id}  {}
                   :model/Pulse        {pulse-id :id} {:name "Weekly" :dashboard_id dash-id}
                   :model/PulseCard    _              {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id}    {:pulse_id pulse-id}
                   :model/PulseChannelRecipient _     {:pulse_channel_id pc-id
                                                       :user_id          (mt/user->id :rasta)}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "subscription" :id pulse-id}]})]
          (is (nil? (:error row)))
          (is (= "Weekly" (:name row)))
          (is (= dash-id (:dashboard_id row)))
          (is (= [(mt/user->id :rasta)]
                 (keep :id (-> row :channels first :recipients)))))))))

(deftest get-content-transform-test
  (testing "GHY-4140: a transform read carries source type and target"
    (mt/with-temp [:model/Transform {id :id} {:name   "t1"
                                              :source {:type  :query
                                                       :query {:database (mt/id)
                                                               :type     "query"
                                                               :query    {:source-table (mt/id :venues)}}}
                                              :target {:type   :table
                                                       :schema (t2/select-one-fn :schema :model/Table :id (mt/id :venues))
                                                       :name   "t1_out"}}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "transform" :id id}]})]
          (is (nil? (:error row)))
          (is (= "t1" (:name row)))
          (is (= "t1_out" (-> row :target :name))))))))

(deftest get-content-not-found-is-not-an-existence-oracle-test
  (testing "GHY-4140: a nonexistent id and an existing-but-unreadable id are indistinguishable,
            so responses never form an existence oracle across the permission boundary"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id
                                                    :dataset_query (mt/mbql-query venues)}]
      (mt/with-non-admin-groups-no-collection-perms coll-id
        (mt/with-test-user :rasta
          (let [unreadable (:error (content-one {:items [{:type "question" :id card-id}]}))
                missing    (:error (content-one {:items [{:type "question" :id 999999999}]}))]
            (is (some? unreadable))
            (is (some? missing))
            (testing "the two messages are identical apart from the id"
              (is (= (str/replace unreadable (str card-id) "ID")
                     (str/replace missing "999999999" "ID"))))))))))

(deftest get-content-fault-isolation-test
  (testing "GHY-4140: one bad item becomes its own error object and the rest of the batch survives"
    (mt/with-temp [:model/Card {card-id :id} {:name "Good" :dataset_query (mt/mbql-query venues)}]
      (mt/with-test-user :crowberto
        (let [rows (content-results {:items [{:type "question" :id card-id}
                                             {:type "question" :id 999999999}]})]
          (is (= 2 (count rows)))
          (is (= "Good" (:name (first rows))))
          (is (nil? (:error (first rows))))
          (testing "the failing item names its type and id alongside the error"
            (is (= {:type "question" :id 999999999} (select-keys (second rows) [:type :id])))
            (is (some? (:error (second rows))))))))))

(deftest get-content-card-type-mismatch-test
  (testing "GHY-4140: asking for a model with type question teaches the actual type"
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (mt/mbql-query venues)}]
      (mt/with-test-user :crowberto
        (let [error (:error (content-one {:items [{:type "question" :id card-id}]}))]
          (is (some? error))
          (is (re-find #"is a model" error))
          (is (re-find #"type: \"model\"" error)))))))

(deftest get-content-batch-cap-test
  (testing "GHY-4140: the batch cap is a tool-level teaching error, not a silent truncation"
    (mt/with-test-user :crowberto
      (let [error (content-error {:items (vec (repeat 11 {:type "question" :id 1}))})]
        (is (re-find #"at most 10" error))
        (is (re-find #"you passed 11" error))))))

(deftest get-content-extra-scope-gates-test
  (testing "GHY-4140: alert reads require agent:notification:read on top of the base scope"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query venues)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :handlers          []}]
      (mt/with-test-user :crowberto
        (let [row (content-one #{"agent:resource:read"}
                               {:items [{:type "alert" :id (:id notification)}]})]
          (is (re-find #"agent:notification:read" (:error row))))
        (testing "granting the scope lets the same read through"
          (let [row (content-one #{"agent:resource:read" "agent:notification:read"}
                                 {:items [{:type "alert" :id (:id notification)}]})]
            (is (nil? (:error row))))))))
  (testing "GHY-4140: transform reads require agent:transforms:read"
    (mt/with-temp [:model/Transform {id :id} {:name   "t1"
                                              :source {:type  :query
                                                       :query {:database (mt/id)
                                                               :type     "query"
                                                               :query    {:source-table (mt/id :venues)}}}
                                              :target {:type   :table
                                                       :schema (t2/select-one-fn :schema :model/Table :id (mt/id :venues))
                                                       :name   "t1_out"}}]
      (mt/with-test-user :crowberto
        (let [row (content-one #{"agent:resource:read"} {:items [{:type "transform" :id id}]})]
          (is (re-find #"agent:transforms:read" (:error row))))))))

(defn- migrate-notification-to-dashboard!
  "Repoint a payload-less notification row to :notification/dashboard via raw SQL, bypassing the
   model lifecycle — which validates a schema (and a create fn) that has no branch for dashboard
   payloads. Those rows only ever arrive by migration, so this stands in for that history. The
   row must carry no payload_id, so the before-delete dispatch is never exercised at teardown."
  [notif-id]
  (t2/query-one {:update :notification
                 :set    {:payload_type "notification/dashboard"}
                 :where  [:= :id notif-id]}))

(deftest get-content-subscription-migrated-notification-test
  (testing "GHY-4140: a subscription migrated to the notification API reads by numeric id"
    (mt/with-temp [:model/Notification {notif-id :id} {:payload_type :notification/card
                                                       :creator_id   (mt/user->id :crowberto)
                                                       :active       true}]
      (migrate-notification-to-dashboard! notif-id)
      (mt/with-test-user :crowberto
        (let [row (content-one {:items           [{:type "subscription" :id notif-id}]
                                :response_format "detailed"})]
          (is (nil? (:error row)))
          (is (= "notification/dashboard" (:payload_type row))))))))

(deftest get-content-subscription-denied-pulse-does-not-fall-through-test
  (testing "GHY-4140: an unreadable Pulse must not fall through to a Notification that happens to
            share its numeric id — that would hand back a different entity than was requested,
            across the permission boundary"
    ;; The Pulse takes the notification's id explicitly, so both temps keep their real ids for
    ;; teardown while sharing one integer across the two id spaces.
    (mt/with-temp [:model/Collection   {coll-id :id}  {}
                   :model/Dashboard    {dash-id :id}  {}
                   :model/Notification {notif-id :id} {:payload_type :notification/card
                                                       :creator_id   (mt/user->id :rasta)
                                                       :active       true}
                   :model/Pulse        {pulse-id :id} {:id            notif-id
                                                       :name          "Private"
                                                       :dashboard_id  dash-id
                                                       :collection_id coll-id
                                                       :creator_id    (mt/user->id :crowberto)}]
      (migrate-notification-to-dashboard! notif-id)
      (mt/with-non-admin-groups-no-collection-perms coll-id
        (mt/with-test-user :rasta
          (let [row (content-one {:items           [{:type "subscription" :id pulse-id}]
                                  :response_format "detailed"})]
            (is (some? (:error row))
                "an unreadable pulse must produce not-found, never another entity's content")
            (is (not= "notification/dashboard" (:payload_type row)))))))))

(deftest get-content-include-mixed-batch-test
  (testing "GHY-4140: include sections apply to the items whose type supports them and are
            silently skipped for the rest, so the advertised mixed-type batch works"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card      {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (mt/with-test-user :crowberto
        (let [[dash question] (content-results {:items   [{:type "dashboard" :id dash-id}
                                                          {:type "question"  :id card-id}]
                                                :include ["definition" "layout"]})]
          (testing "the dashboard gets layout and is not failed by the question-only section"
            (is (nil? (:error dash)))
            (is (some? (:layout dash)))
            (is (nil? (:definition dash))))
          (testing "the question gets definition and is not failed by the dashboard-only section"
            (is (nil? (:error question)))
            (is (some? (:definition question)))
            (is (nil? (:layout question)))))))))

(deftest get-content-include-unknown-for-every-item-test
  (testing "GHY-4140: a section no item in the batch supports is a tool-level teaching error,
            so a typo never silently returns nothing"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (mt/with-test-user :crowberto
        (let [error (content-error {:items [{:type "question" :id card-id}] :include ["layout"]})]
          (is (re-find #"does not apply to type question" error))
          (is (re-find #"available for: dashboard, document" error)))))))
