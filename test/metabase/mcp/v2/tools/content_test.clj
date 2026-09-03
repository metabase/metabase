(ns metabase.mcp.v2.tools.content-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.metrics.core :as metrics]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.content/keep-me)

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

(defn- venues-query
  "A Lib query over VENUES — a runnable `:dataset_query` for fixtures that only need the card to
   have one."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- venues-count-query
  "[[venues-query]] aggregated to a single count, for fixtures that read as a scalar."
  []
  (lib/aggregate (venues-query) (lib/count)))

(deftest get-content-question-concise-test
  (testing "GHY-4140: a question read returns its concise projection with the type tag"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Venue Count"
                                              :type          :question
                                              :display       :scalar
                                              :dataset_query (venues-count-query)}]
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
        (mt/with-temp [:model/Card {id :id} {:type :model :dataset_query (venues-query)}]
          (let [row (content-one {:items [{:type "model" :id id}]})]
            (is (nil? (:error row)))
            (is (= {:type "model" :id id} (select-keys row [:type :id]))))))
      (testing "metric"
        (mt/with-temp [:model/Card {id :id} {:type          :metric
                                             :dataset_query (venues-count-query)}]
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
      (testing "document returns the serialized Markdown body"
        (mt/with-temp [:model/Document {id :id}
                       {:document     {:type    "doc"
                                       :content [{:type    "paragraph"
                                                  :content [{:type "text" :text "hello"}]}]}
                        :content_type "application/json+vnd.prose-mirror"}]
          (let [row (content-one {:items [{:type "document" :id id}]})]
            (is (nil? (:error row)))
            (is (re-find #"hello" (:content_markdown row)))))))))

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
            (let [expected [{:id "_CAT_" :name "Category" :type "category" :dashcard_ids [dc-id]}]]
              (is (= expected (:parameters row)))
              (is (= expected
                     (:parameters (content-one {:items   [{:type "dashboard" :id dash-id}]
                                                :include ["parameters"]}))))))
          (testing "one summary row per dashcard, with the card reference resolved"
            (is (= [{:id dc-id :kind "card" :card {:id card-id :name "Embedded"}
                     :dashboard_tab_id tab-id :row 0 :col 0}]
                   (mapv #(select-keys % [:id :kind :card :dashboard_tab_id :row :col])
                         (:dashcards row))))))))))

(defn- dashcard-refs
  "dashcard id -> its projected `:card` and `:series` references, for the redaction assertions."
  [row]
  (into {} (map (juxt :id #(select-keys % [:card :series]))) (:dashcards row)))

(deftest get-content-dashboard-redacts-unreadable-cards-test
  (testing "GHY-4219: a dashcard card and a series entry the caller cannot read collapse to an id
            with no name. The redaction runs in the tool before the pure projection sees the row,
            so this pins that get_content still applies it."
    (mt/with-temp [:model/Collection    {open-id :id}       {}
                   :model/Collection    {locked-id :id}     {}
                   :model/Dashboard     {dash-id :id}       {:collection_id open-id}
                   :model/Card          {open-card :id}     {:name "Open" :collection_id open-id}
                   :model/Card          {hidden-card :id}   {:name "Hidden" :collection_id locked-id}
                   :model/Card          {hidden-series :id} {:name "Hidden Series"
                                                             :collection_id locked-id}
                   :model/DashboardCard {open-dc :id}       {:dashboard_id dash-id
                                                             :card_id      open-card
                                                             :row          0 :col 0}
                   :model/DashboardCard {hidden-dc :id}     {:dashboard_id dash-id
                                                             :card_id      hidden-card
                                                             :row          1 :col 0}
                   :model/DashboardCardSeries _             {:dashboardcard_id open-dc
                                                             :card_id          hidden-series
                                                             :position         0}]
      (mt/with-non-admin-groups-no-collection-perms locked-id
        (testing "an admin, who can read everything, sees every name"
          (mt/with-test-user :crowberto
            (let [refs (dashcard-refs (content-one {:items [{:type "dashboard" :id dash-id}]}))]
              (is (= {:card   {:id open-card :name "Open"}
                      :series [{:id hidden-series :name "Hidden Series"}]}
                     (get refs open-dc)))
              (is (= {:card {:id hidden-card :name "Hidden"}}
                     (get refs hidden-dc))))))
        (mt/with-test-user :rasta
          (let [row  (content-one {:items [{:type "dashboard" :id dash-id}]})
                refs (dashcard-refs row)]
            (is (nil? (:error row))
                "the dashboard itself is readable — only the nested cards are not")
            (testing "the readable card keeps its name"
              (is (= {:id open-card :name "Open"} (:card (get refs open-dc)))))
            (testing "the unreadable card is an id and nothing else"
              (is (= {:id hidden-card} (:card (get refs hidden-dc)))))
            (testing "and so is an unreadable series entry"
              (is (= [{:id hidden-series}] (:series (get refs open-dc)))))))))))

(deftest get-content-alert-test
  (testing "GHY-4140: alert reads carry condition, schedule, and handlers"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (venues-query)}
                     :notification      {:creator_id (mt/user->id :crowberto)}
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

(deftest get-content-alert-strips-recipients-without-payload-read-test
  (testing "GHY-4219: a caller who can read an alert only as its creator — not its card — gets
            handlers with no recipients at all, the way /api/pulse redacts them. The strip runs in
            the tool now, so this pins that get_content still applies it."
    (mt/with-temp [:model/Collection {locked-id :id} {}]
      (notification.tu/with-card-notification
        [notification {:card         {:collection_id locked-id}
                       :notification {:creator_id (mt/user->id :rasta)}
                       :handlers     [{:channel_type :channel/email
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :crowberto)}]}]}]
        (mt/with-non-admin-groups-no-collection-perms locked-id
          (testing "an admin, who can read the card, sees the recipient list"
            (mt/with-test-user :crowberto
              (let [handler (-> (content-one {:items [{:type "alert" :id (:id notification)}]})
                                :handlers first)]
                (is (= [(mt/user->id :crowberto)] (mapv :user_id (:recipients handler)))))))
          (mt/with-test-user :rasta
            (let [row (content-one {:items [{:type "alert" :id (:id notification)}]})]
              (is (nil? (:error row))
                  "the creator can still read the alert itself")
              (is (seq (:handlers row))
                  "the handler is still projected — only its recipients are withheld")
              (is (not (contains? (-> row :handlers first) :recipients))
                  "the recipient list is gone entirely, not merely filtered to empty"))))))))

(deftest get-content-alert-read-denial-test
  (testing "GHY-4140: `mi/can-read?` in fetch-notification is the permission boundary for alerts — a caller
            who is neither superuser, creator, nor recipient must get the not-found collapse, not the alert's
            card_id, schedule and handlers. Every other alert test here reads as an admin or the creator, so
            deleting that conjunct would leave the suite green."
    (mt/with-temp [:model/Collection {locked-id :id} {}]
      (notification.tu/with-card-notification
        [notification {:card         {:collection_id locked-id}
                       :notification {:creator_id (mt/user->id :crowberto)}
                       :handlers     [{:channel_type :channel/email
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :crowberto)}]}]}]
        (mt/with-non-admin-groups-no-collection-perms locked-id
          (mt/with-test-user :lucky
            (let [row (content-one {:items [{:type "alert" :id (:id notification)}]})]
              (is (some? (:error row))
                  "a caller with no relationship to the alert is refused")
              (is (nil? (:handlers row))
                  "and gets none of its delivery configuration"))))))))

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

(deftest get-content-subscription-strips-sensitive-metadata-test
  (testing "GHY-4219: a caller who can read a Pulse only as its creator, without collection read
            perms, loses its cards and its channel recipient lists. The strip runs in the tool now,
            so this pins that get_content still applies it."
    (mt/with-temp [:model/Collection   {locked-id :id} {}
                   :model/Card         {card-id :id}   {:name "Sub Card"}
                   :model/Dashboard    {dash-id :id}   {}
                   :model/Pulse        {pulse-id :id}  {:name          "Private Weekly"
                                                        :dashboard_id  dash-id
                                                        :collection_id locked-id
                                                        :creator_id    (mt/user->id :rasta)}
                   :model/PulseCard    _               {:pulse_id pulse-id :card_id card-id}
                   :model/PulseChannel {pc-id :id}     {:pulse_id pulse-id}
                   :model/PulseChannelRecipient _      {:pulse_channel_id pc-id
                                                        :user_id          (mt/user->id :crowberto)}]
      (mt/with-non-admin-groups-no-collection-perms locked-id
        (testing "an admin, who has collection read perms, sees the cards and the recipients"
          (mt/with-test-user :crowberto
            (let [row (content-one {:items [{:type "subscription" :id pulse-id}]})]
              (is (= [card-id] (mapv :id (:cards row))))
              (is (= [(mt/user->id :crowberto)]
                     (mapv :id (-> row :channels first :recipients)))))))
        (mt/with-test-user :rasta
          (let [row (content-one {:items [{:type "subscription" :id pulse-id}]})]
            (is (nil? (:error row))
                "the creator can still read the subscription itself")
            (is (= "Private Weekly" (:name row)))
            (is (nil? (:cards row))
                "its cards are stripped")
            (is (seq (:channels row))
                "the channel is still projected — only its recipients are withheld")
            (is (not (contains? (-> row :channels first) :recipients))
                "and the channel recipient list is gone")))))))

(deftest get-content-transform-test
  (testing "GHY-4140: a transform read carries source type and target"
    ;; The transform read-check gates on the transforms feature before the superuser bypass, so the
    ;; feature and its setting must be on for the read to succeed — otherwise `can-read?` is false and
    ;; the transform collapses to not-found. Enable them explicitly rather than inheriting ambient state.
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp-env-var-value! [mb-transforms-enabled true]
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
              (is (= "t1_out" (-> row :target :name))))))))))

(deftest get-content-not-found-is-not-an-existence-oracle-test
  (testing "GHY-4140: a nonexistent id and an existing-but-unreadable id are indistinguishable,
            so responses never form an existence oracle across the permission boundary"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id
                                                    :dataset_query (venues-query)}]
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
    (mt/with-temp [:model/Card {card-id :id} {:name "Good" :dataset_query (venues-query)}]
      (mt/with-test-user :crowberto
        (let [rows (content-results {:items [{:type "question" :id card-id}
                                             {:type "question" :id 999999999}]})]
          (is (= 2 (count rows)))
          (is (= "Good" (:name (first rows))))
          (is (nil? (:error (first rows))))
          (testing "the failing item names its type and id alongside the error"
            (is (= {:type "question" :id 999999999} (select-keys (second rows) [:type :id])))
            (is (some? (:error (second rows))))))))))

(deftest get-content-item-error-is-judged-safe-test
  (testing "GHY-4322: a per-item failure is judged by the same rule as a tool-level error — an
            incidental exception (JDBC, library ex-info, NPE) becomes a generic internal error
            instead of leaking driver or app-DB detail, while deliberately caller-facing errors
            keep their full teaching message"
    (mt/with-temp [:model/Card {card-id :id} {:name "Good" :dataset_query (venues-query)}]
      (mt/with-test-user :crowberto
        (mt/with-dynamic-fn-redefs [tools.content/fetch-measure-or-segment
                                    (fn [& _]
                                      (throw (ex-info "ERROR: relation \"report_card\" does not exist"
                                                      {:sql "SELECT * FROM report_card"})))]
          (let [[leaky teaching good]
                (content-results {:items [{:type "measure" :id 1}
                                          {:type "question" :id 999999999}
                                          {:type "question" :id card-id}]})]
            (testing "the incidental exception's message never reaches the caller"
              (is (= {:type "measure" :id 1} (select-keys leaky [:type :id])))
              (is (= "Internal error" (:error leaky)))
              (is (not (str/includes? (:error leaky) "report_card"))))
            (testing "a teaching error still surfaces its full message"
              (is (str/includes? (:error teaching) "not found")))
            (testing "fault isolation survives: the good item is unaffected"
              (is (= "Good" (:name good)))
              (is (nil? (:error good))))))))))

(deftest get-content-card-type-mismatch-test
  (testing "GHY-4140: asking for a model with type question teaches the actual type"
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (venues-query)}]
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

(deftest get-content-reads-formerly-gated-types-test
  (testing "GHY-4225: alerts, transforms, snippets and documents each used to need their own read
            scope on top of the base one. Those folded into `agent:content:read`, so the single
            scope now carries them — the per-type gate is gone, not merely renamed."
    (testing "alert"
      (notification.tu/with-card-notification
        [notification {:card         {:dataset_query (venues-query)}
                       :notification {:creator_id (mt/user->id :crowberto)}
                       :handlers     []}]
        (mt/with-test-user :crowberto
          (is (nil? (:error (content-one #{"agent:content:read"}
                                         {:items [{:type "alert" :id (:id notification)}]})))))))
    (testing "snippet, including its body"
      (mt/with-temp [:model/NativeQuerySnippet {id :id} {:name "snip" :content "wow"
                                                         :creator_id (mt/user->id :lucky)}]
        (mt/with-test-user :crowberto
          (let [row (content-one #{"agent:content:read"} {:items [{:type "snippet" :id id}]})]
            (is (nil? (:error row)))
            (is (= "wow" (:content row)))))))
    (testing "document, including its body"
      (mt/with-temp [:model/Document {id :id}
                     {:document     {:type "doc" :content [{:type "paragraph"
                                                            :content [{:type "text" :text "hello"}]}]}
                      :content_type "application/json+vnd.prose-mirror"}]
        (mt/with-test-user :crowberto
          (let [row (content-one #{"agent:content:read"} {:items [{:type "document" :id id}]})]
            (is (nil? (:error row)))
            (is (re-find #"hello" (:content_markdown row)))))))))

(defn- comment-content
  [text]
  {:type    "doc"
   :content [{:type "paragraph" :content [{:type "text" :text text}]}]})

(def ^:private commented-doc
  "Four top-level blocks with fixed node ids: a plain paragraph, a blockquote whose inner
   paragraph has its own id (nested blocks carry no span of their own), an empty paragraph
   (zero-width span), and a closing paragraph."
  {:type    "doc"
   :content [{:type    "paragraph" :attrs {:_id "para-1"}
              :content [{:type "text" :text "First paragraph."}]}
             {:type    "blockquote" :attrs {:_id "quote-1"}
              :content [{:type    "paragraph" :attrs {:_id "quote-para"}
                         :content [{:type "text" :text "Quoted text."}]}]}
             {:type "paragraph" :attrs {:_id "empty-1"}}
             {:type    "paragraph" :attrs {:_id "para-2"}
              :content [{:type "text" :text "Last paragraph."}]}]})

(deftest get-content-document-comments-include-test
  (testing "GHY-4159: the comments include anchors each thread to the exact markdown slice of its block"
    (mt/with-temp [:model/Document {doc-id :id} {:document     commented-doc
                                                 :content_type "application/json+vnd.prose-mirror"}
                   :model/Comment  {root-id :id} {:target_id       doc-id
                                                  :child_target_id "para-1"
                                                  :content         (comment-content "make this punchier")}
                   :model/Comment  {reply-id :id} {:target_id         doc-id
                                                   :child_target_id   "para-1"
                                                   :parent_comment_id root-id
                                                   :content           (comment-content "agreed")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "quote-para"
                                      :content         (comment-content "on a nested block")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "empty-1"
                                      :content         (comment-content "on an empty paragraph")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "para-2"
                                      :is_resolved     true
                                      :content         (comment-content "resolved note")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "para-2"
                                      :deleted_at      :%now
                                      :content         (comment-content "deleted note")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "gone-0000"
                                      :content         (comment-content "my block was rewritten")}]
      (mt/with-test-user :crowberto
        (let [row      (content-one {:items [{:type "document" :id doc-id}] :include ["comments"]})
              markdown (:content_markdown row)
              threads  (:comments row)
              by-id    (into {} (map (juxt :child_target_id identity)) threads)]
          (is (nil? (:error row)))
          (testing "every live anchored thread is present, in document order"
            (is (= ["para-1" "quote-para" "empty-1" "para-2"] (mapv :child_target_id threads))))
          (testing "the anchor is the exact [start, end) slice of the commented block"
            (let [{:keys [start end text]} (:anchor (by-id "para-1"))]
              (is (= "First paragraph." text))
              (is (= text (subs markdown start end)))))
          (testing "threads are flat and ordered, replies carrying parent_comment_id"
            (is (= [{:id root-id :text "make this punchier"}
                    {:id reply-id :parent_comment_id root-id :text "agreed"}]
                   (mapv #(select-keys % [:id :parent_comment_id :text])
                         (:thread (by-id "para-1"))))))
          (testing "a comment on a block nested in a blockquote anchors to the outermost block's span"
            (is (= "> Quoted text." (get-in (by-id "quote-para") [:anchor :text]))))
          (testing "an empty paragraph is a legal zero-width anchor"
            (let [{:keys [start end text]} (:anchor (by-id "empty-1"))]
              (is (= start end))
              (is (= "" text))))
          (testing "is_resolved is surfaced and deleted comments are excluded"
            (is (= [{:is_resolved true :text "resolved note"}]
                   (mapv #(select-keys % [:is_resolved :text]) (:thread (by-id "para-2"))))))
          (testing "the creator is the user's display name"
            (is (= "Rasta Toucan" (-> (by-id "para-1") :thread first :creator))))
          (testing "a thread whose block no longer exists lands in orphaned_comments, text readable"
            (is (= [{:child_target_id "gone-0000" :text "my block was rewritten"}]
                   (mapv #(assoc (select-keys % [:child_target_id])
                                 :text (-> % :thread first :text))
                         (:orphaned_comments row))))))))))

(def ^:private layout-commented-doc
  "A layout container holding a list. `resizeNode`/`flexContainer` carry no `_id` at all, so a
   block nested inside one has to resolve its anchor past them; the paragraph inside the list item
   is the block with no span of its own — the list re-renders it with a `- ` prefix."
  {:type    "doc"
   :content [{:type    "resizeNode" :attrs {:height 442 :minHeight 280}
              :content [{:type    "flexContainer" :attrs {:columnWidths [60 40]}
                         :content [{:type    "supportingText" :attrs {:_id "support-1"}
                                    :content [{:type    "bulletList" :attrs {:_id "list-1"}
                                               :content [{:type    "listItem"
                                                          :content [{:type    "paragraph" :attrs {:_id "list-para"}
                                                                     :content [{:type "text"
                                                                                :text "Nested in a list."}]}]}]}]}
                                   {:type    "supportingText" :attrs {:_id "support-2"}
                                    :content [{:type    "paragraph" :attrs {:_id "support-para"}
                                               :content [{:type "text" :text "Beside it."}]}]}]}]}
             {:type "paragraph" :attrs {:_id "tail"} :content [{:type "text" :text "Tail."}]}]})

(deftest get-content-document-comments-inside-a-layout-container-test
  (testing "a live comment inside a layout container is anchored, not reported orphaned — a block
            with no span of its own rolls up to the nearest ancestor that has one, and the
            id-less resizeNode/flexContainer wrappers in between must not break the chain"
    (mt/with-temp [:model/Document {doc-id :id} {:document     layout-commented-doc
                                                 :content_type "application/json+vnd.prose-mirror"}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "list-para"
                                      :content         (comment-content "on a list paragraph")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "support-para"
                                      :content         (comment-content "on a supporting paragraph")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "support-1"
                                      :content         (comment-content "on the supporting block")}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "gone-0000"
                                      :content         (comment-content "my block was rewritten")}]
      (mt/with-test-user :crowberto
        (let [row      (content-one {:items [{:type "document" :id doc-id}] :include ["comments"]})
              markdown (:content_markdown row)
              by-id    (into {} (map (juxt :child_target_id identity)) (:comments row))]
          (is (nil? (:error row)))
          (testing "every block that still exists is anchored, whatever it is nested in"
            (is (= #{"support-1" "list-para" "support-para"} (set (keys by-id)))))
          (testing "a paragraph the list re-renders anchors to its list's span"
            (is (= "- Nested in a list." (get-in (by-id "list-para") [:anchor :text]))))
          (testing "a block that has its own span still uses it rather than an ancestor's"
            (is (= "Beside it." (get-in (by-id "support-para") [:anchor :text])))
            (is (str/starts-with? (get-in (by-id "support-1") [:anchor :text]) "::: supporting")))
          (testing "every anchor is a true slice of the returned markdown"
            (doseq [[id thread] by-id
                    :let [{:keys [start end text]} (:anchor thread)]]
              (is (= text (subs markdown start end)) id)))
          (testing "a thread whose block is genuinely gone is still orphaned"
            (is (= ["gone-0000"] (mapv :child_target_id (:orphaned_comments row))))))))))

(deftest get-content-document-comments-scope-and-batch-test
  (mt/with-temp [:model/Document {doc-id :id} {:document     commented-doc
                                               :content_type "application/json+vnd.prose-mirror"}
                 :model/Comment  _ {:target_id       doc-id
                                    :child_target_id "para-1"
                                    :content         (comment-content "hi")}
                 :model/Card     {card-id :id} {:dataset_query (venues-query)}]
    (mt/with-test-user :crowberto
      (testing "GHY-4159/GHY-4225: comment threads are document content, so the tool's own
                agent:content:read carries them — they used to need agent:document:read on top,
                and that per-type gate is gone rather than renamed"
        (let [row (content-one #{"agent:content:read"}
                               {:items [{:type "document" :id doc-id}] :include ["comments"]})]
          (is (nil? (:error row)))
          (is (= 1 (count (:comments row))))))
      (testing "GHY-4159: in a mixed batch the section applies to the document and is skipped for the question"
        (let [[doc question] (content-results {:items   [{:type "document" :id doc-id}
                                                         {:type "question" :id card-id}]
                                               :include ["comments"]})]
          (is (nil? (:error doc)))
          (is (seq (:comments doc)))
          (is (nil? (:error question)))
          (is (nil? (:comments question))))))))

(deftest get-content-document-comments-serializer-fallback-test
  (testing "GHY-4159: on the flattened-text fallback read, threads come back unanchored under
            comments — absence of anchors means unknown, never orphaned"
    (mt/with-temp [:model/Document {doc-id :id} {:document     {:type    "doc"
                                                                :content [{:type    "mysteryBlock"
                                                                           :attrs   {:_id "m-1"}
                                                                           :content [{:type "text" :text "odd"}]}]}
                                                 :content_type "application/json+vnd.prose-mirror"}
                   :model/Comment  _ {:target_id       doc-id
                                      :child_target_id "m-1"
                                      :content         (comment-content "still here")}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "document" :id doc-id}] :include ["comments"]})]
          (is (nil? (:error row)))
          (is (= "odd" (:content_markdown row)))
          (is (= [{:child_target_id "m-1" :thread-texts ["still here"]}]
                 (mapv #(-> (select-keys % [:child_target_id :anchor])
                            (assoc :thread-texts (mapv :text (:thread %))))
                       (:comments row))))
          (is (nil? (:orphaned_comments row))))))))

(defn- deeply-nested-ast
  "A prose-mirror body nested `n` levels deep."
  [n]
  {:type    "doc"
   :content [(reduce (fn [inner i]
                       {:type    "blockquote"
                        :attrs   {:_id (str "bq-" i)}
                        :content [inner]})
                     {:type    "paragraph"
                      :attrs   {:_id "leaf"}
                      :content [{:type "text" :text "buried"}]}
                     (range n))]})

(deftest get-content-deepest-storable-document-still-serializes-test
  (testing "the app DB's JSON nesting ceiling sits below the serializer's, so any document that can
            be read back is shallow enough to render as Markdown. This is why a deeply nested body
            is a write-path concern only: the storage layer refuses a document around 600 levels
            deep, while serializing does not run out of stack until roughly 2000. The margin is
            load-bearing — if the JSON limit were ever raised, reads could start hitting a
            StackOverflowError, which is an Error and so escapes the per-item `catch Exception`
            that keeps one bad document from sinking a whole batch."
    (mt/with-temp [:model/Document {doc-id :id} {:document     (deeply-nested-ast 400)
                                                 :content_type "application/json+vnd.prose-mirror"}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "document" :id doc-id}]})]
          (is (nil? (:error row)))
          (testing "rendered as real Markdown, not the flattened-text fallback"
            (is (str/includes? (str (:content_markdown row)) "> buried"))))))
    (testing "past that ceiling the write does not succeed, so no such document exists to read"
      ;; Throwable, not Exception: which mechanism stops the write depends on how much stack the
      ;; running thread has. The JSON nesting limit raises an ordinary exception, but on a smaller
      ;; stack — CI's parallel test threads, say — a recursive walk over the body can overflow
      ;; first, and a StackOverflowError is an Error. Either outcome satisfies what this pins,
      ;; which is that the write does not land; asserting one of them made the test
      ;; environment-dependent.
      (is (thrown? Throwable
                   (mt/with-temp [:model/Document _ {:document     (deeply-nested-ast 600)
                                                     :content_type "application/json+vnd.prose-mirror"}]
                     nil))))))

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
                   :model/Card      {card-id :id} {:dataset_query (venues-query)}]
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
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query)}]
      (mt/with-test-user :crowberto
        (let [error (content-error {:items [{:type "question" :id card-id}] :include ["layout"]})]
          (is (re-find #"does not apply to type question" error))
          (is (re-find #"available for: dashboard, document" error)))))))

(deftest get-content-dimensions-include-does-not-write-test
  (testing "GHY-4140: the dimensions include computes on read but never persists, so the tool's
            readOnlyHint holds — unlike GET /api/metric/:id, which syncs to the DB"
    (mt/with-temp [:model/Card {metric-id :id} {:type          :metric
                                                :dataset_query (venues-count-query)}]
      (mt/with-test-user :crowberto
        (let [dims-before (t2/select-one-fn :dimensions :model/Card :id metric-id)
              row         (content-one {:items [{:type "metric" :id metric-id}] :include ["dimensions"]})]
          (is (nil? (:error row)))
          (is (contains? row :dimensions)
              "the dimensions section is present")
          (is (seq (:dimensions row))
              "a count metric over venues yields at least one groupable dimension")
          (is (= dims-before (t2/select-one-fn :dimensions :model/Card :id metric-id))
              "the read persisted nothing to the metric's dimensions column"))))))

(deftest get-content-document-read-does-not-log-a-view-test
  (testing "GHY-4140: `get_content` declares readOnlyHint, so a document read must not record a
            view. `documents/get-document` publishes `:event/document-read` by default, which bumps
            `view_count`, stamps `last_viewed_at`, writes a view_log row, and pushes the document
            onto the caller's recently-viewed list — filling a user's recents with an agent's reads."
    (mt/with-temp [:model/Document {doc-id :id}
                   {:document     {:type    "doc"
                                   :content [{:type    "paragraph"
                                              :content [{:type "text" :text "hello"}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :view_count   0}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "document" :id doc-id}]})]
          (is (nil? (:error row)))
          (is (re-find #"hello" (:content_markdown row))
              "the read still returns the body")))
      (is (= 0 (t2/select-one-fn :view_count :model/Document doc-id))
          "and left view_count alone"))))

(deftest get-content-dimensions-respects-a-curated-metric-test
  (testing "GHY-4140: a metric whose dimensions were curated keeps them authoritative on read, the way
            GET /api/metric/:id does. Reconciling a metric the MEASURE way — which is what
            compute-dimensions did for every entity type — re-adds a dimension its owner deliberately
            removed, and mints a fresh random id for every computed pair with no persisted mapping, so
            two reads of an unchanged metric disagree."
    (mt/with-temp [:model/Card {metric-id :id} {:type          :metric
                                                :database_id   (mt/id)
                                                :table_id      (mt/id :venues)
                                                :dataset_query (venues-count-query)}]
      ;; Curate through the persisted set, not through `get_content`'s output: the tool returns the
      ;; encoded wire shape the endpoints return, which the model's `:dimensions` transform will not
      ;; take back. Reading the fixture out of the tool under test would also make this test agree
      ;; with whatever shape the tool happens to emit.
      (metrics/sync-dimensions! :metadata/metric metric-id)
      (let [seeded (t2/select-one-fn :dimensions :model/Card :id metric-id)]
        (is (seq seeded) "the metric must seed at least one dimension for this to prove anything")
        (t2/update! :model/Card metric-id {:dimensions (vec (take 1 seeded))})
        (mt/with-test-user :crowberto
          (let [row   (content-one {:items [{:type "metric" :id metric-id}] :include ["dimensions"]})
                again (content-one {:items [{:type "metric" :id metric-id}] :include ["dimensions"]})]
            (is (= 1 (count (:dimensions row)))
                "the curated set is not auto-extended back to every computed pair")
            (is (= (:dimensions row) (:dimensions again))
                "and two reads of an unchanged metric agree — no freshly minted ids")))))))

(defn- rest-dimensions
  "The `dimensions`/`dimension_mappings` pair `GET /api/<route>/:id` returns."
  [route id]
  (select-keys (mt/user-http-request :crowberto :get 200 (str route "/" id))
               [:dimensions :dimension_mappings]))

(defn- mcp-dimensions
  "The same pair from `get_content`'s `dimensions` include."
  [type id]
  (select-keys (mt/with-test-user :crowberto
                 (content-one {:items [{:type type :id id}] :include ["dimensions"]}))
               [:dimensions :dimension_mappings]))

(defn- without-generated-ids
  "`dimensions` with the generated dimension ids stripped. An entity whose dimensions have never
   been persisted mints a fresh random id per computed pair, so two independent reads of one
   legitimately disagree on ids (and on the `lib/uuid`s in the mapping targets keyed to them) while
   every other part of the shape must still match."
  [pair]
  (mapv #(dissoc % :id) (:dimensions pair)))

(defn- without-clause-uuids
  "`pair` with the MBQL `:lib/uuid` clause identifiers stripped. A mapping target rebuilt by
   `reconcile-dimensions-and-mappings` — the path measures take on every load — carries the same
   field ref under a freshly minted clause uuid each time, so the uuids differ between two reads
   that agree on everything that identifies the column."
  [pair]
  (walk/postwalk #(cond-> % (map? %) (dissoc :lib/uuid)) pair))

(deftest get-content-dimensions-match-the-rest-endpoint-test
  (testing "GHY-4140: the `dimensions` include documents itself as returning the same
            `dimensions`/`dimension_mappings` pair `GET /api/metric/:id` and `GET /api/measure/:id`
            return, but nothing ever compared the two. Each block reads through MCP BEFORE REST:
            a REST read seeds and persists dimensions as a side effect, so reading it first would
            paper over any divergence on the not-yet-seeded path."
    (testing "a metric nobody has opened yet"
      (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                  :type          :metric
                                                  :database_id   (mt/id)
                                                  :table_id      (mt/id :venues)
                                                  :dataset_query (venues-count-query)}]
        (let [mcp  (mcp-dimensions "metric" metric-id)
              rest (rest-dimensions "metric" metric-id)]
          (testing "names its keys the way the endpoint does, not in the internal kebab shape"
            (is (= (into (sorted-set) (mapcat keys) (:dimensions rest))
                   (into (sorted-set) (mapcat keys) (:dimensions mcp)))))
          (testing "reports the seeded set — own-table and explicitly-joined columns — rather than
                    every FK-reachable column"
            (is (= (sort (map :name (:dimensions rest)))
                   (sort (map :name (:dimensions mcp))))))
          (testing "and every dimension matches but for the ids neither side has persisted yet"
            (is (= (without-generated-ids rest)
                   (without-generated-ids mcp)))))))
    (testing "a metric with a dimension whose column disappeared"
      (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                  :type          :metric
                                                  :database_id   (mt/id)
                                                  :table_id      (mt/id :venues)
                                                  :dataset_query (venues-count-query)}]
        ;; Seed, then retarget one mapping at a column of an unrelated table so the next sync marks
        ;; its dimension `:status/orphaned` — the setup `metabase.metrics.api-dimension-test` uses.
        (metrics/sync-dimensions! :metadata/metric metric-id)
        (let [{:keys [dimensions dimension_mappings]} (t2/select-one :model/Card :id metric-id)
              orphan-id (:id (first dimensions))]
          (t2/update! :model/Card metric-id
                      {:dimension_mappings (mapv #(cond-> %
                                                    (= orphan-id (:dimension-id %))
                                                    (assoc-in [:target 2] (mt/id :users :name)))
                                                 dimension_mappings)})
          (metrics/sync-dimensions! :metadata/metric metric-id)
          (let [mcp  (mcp-dimensions "metric" metric-id)
                rest (rest-dimensions "metric" metric-id)]
            (testing "drops it, because the endpoint drops it unless asked for it"
              (is (not (contains? (into #{} (map :id) (:dimensions mcp)) orphan-id))))
            (testing "and the pair matches outright"
              (is (= rest mcp)))))))
    (testing "a measure"
      (mt/with-temp [:model/Measure {measure-id :id} {:name       "M1"
                                                      :table_id   (mt/id :venues)
                                                      :creator_id (mt/user->id :crowberto)
                                                      :definition (measure-definition (lib/count))}]
        ;; Seed first so the generated dimension ids are persisted and both reads reconcile against
        ;; the same set — this block is here for the encoded wire shape, not the unseeded path.
        (metrics/sync-dimensions! :metadata/measure measure-id)
        (let [mcp  (mcp-dimensions "measure" measure-id)
              rest (rest-dimensions "measure" measure-id)]
          (testing "the pair matches outright"
            (is (= (without-clause-uuids rest)
                   (without-clause-uuids mcp)))))))))

(deftest question-projection-is-canonical-test
  (testing "GHY-4140: there is one :question projection, carrying get_content's enrichments, so
            loading this tool cannot silently reshape what browse_collection projects. A future
            competing lean registration would drop these keys and fail here."
    (let [catalog (set (projections/catalog :question))]
      (is (contains? catalog "query_summary"))
      (is (contains? catalog "template_tags"))
      (is (contains? catalog "source_card_id")))
    (testing "the concise projection compacts nils rather than emitting them"
      (is (= {:id 1 :name "Q"}
             (projections/project :question :concise {:id 1 :name "Q" :description nil})))))
  (testing "the same holds for the projections metric_write and document_write share with this tool —
            each had a competing registration whose winner was decided by load order"
    (is (contains? (set (projections/catalog :metric)) "query_summary"))
    (is (contains? (set (projections/catalog :document)) "content_markdown"))))

(deftest get-content-subscription-fields-covers-notification-shape-test
  (testing "GHY-4140: the subscription fields catalog covers the notification-backed shape, not
            just the pulse shape — both are reachable under type subscription, so handlers.* must
            validate as a fields path"
    (mt/with-temp [:model/Notification {notif-id :id} {:payload_type :notification/card
                                                       :creator_id   (mt/user->id :crowberto)
                                                       :active       true}]
      (migrate-notification-to-dashboard! notif-id)
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type   "subscription"
                                         :id     notif-id
                                         :fields ["handlers.channel_type"]}]})]
          (is (nil? (:error row))
              "handlers.* is a valid fields path for a notification-backed subscription"))))))

(deftest question-template-tags-read-from-either-stored-shape-test
  (testing "template_tags surface for both stored query shapes, keyed by name, so the read round-trips
            through question_write regardless of which surface created the card"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [tag {:id           "0f8266e0-5df9-4b95-a6d9-fea1e4a4c3ff"
                 :name         "min"
                 :display-name "Min"
                 :type         :number}]
        (testing "legacy shape: a name-keyed map under [:native :template-tags]"
          (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                           :type     :native
                                                           :native   {:query         "SELECT 1 WHERE x > {{min}}"
                                                                      :template-tags {"min" tag}}}
                                           :query_type :native}]
            (is (=? {:min {:name "min" :type "number"}}
                    (:template_tags (content-one {:items [{:type "question" :id (:id card)}]}))))))
        (testing "pMBQL shape: a tag vector on the native stage (what question_write stores)"
          (mt/with-temp [:model/Card card {:dataset_query {:lib/type :mbql/query
                                                           :database (mt/id)
                                                           :stages   [{:lib/type      :mbql.stage/native
                                                                       :native        "SELECT 1 WHERE x > {{min}}"
                                                                       :template-tags [tag]}]}
                                           :query_type :native}]
            (is (=? {:min {:name "min" :type "number"}}
                    (:template_tags (content-one {:items [{:type "question" :id (:id card)}]}))))))))))
