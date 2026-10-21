(ns metabase.metabot.tools.save-entity-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api-scope.core :as api-scope]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- venues-query []
  (lib/query (mt/metadata-provider)
             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- chart-memory
  "A memory atom holding one generated chart `c-1` over a real query."
  []
  (let [query (venues-query)]
    (atom {:state   {:queries {"q-1" query}
                     :charts  {"c-1" {:chart_id "c-1"
                                      :query_id "q-1"
                                      :queries  [query]
                                      :visualization_settings {:chart_type :bar}}}}
           :context {}})))

(defn- rehydrated-chart-memory
  "A chart memory whose query has crossed the JSON persistence boundary between turns."
  []
  (let [query (-> (venues-query)
                  (dissoc :lib/metadata)
                  json/encode
                  json/decode+kw)]
    (atom {:state   {:queries {"q-1" query}
                     :charts  {"c-1" {:chart_id "c-1"
                                      :query_id "q-1"
                                      :queries  [query]
                                      :visualization_settings {:chart_type "bar"}}}}
           :context {}})))

(def ^:private chart-args
  {:chart_id    "c-1"
   :name        "Venues by price"
   :description "Count of venues grouped by price."})

(def ^:private tool-names
  "List the tools needed to show every recovery step in these tests."
  #{"search" "read_resource" "construct_notebook_query" "create_chart"})

(defn- call-save-entity [args]
  (test-util/call-tool save-entity/save-entity-tool args))

(defn- save! [destination]
  (binding [shared/*memory-atom* (chart-memory)]
    (call-save-entity (assoc chart-args :destination destination))))

(defn- failure
  "Return the error class and code, plus any recoverable error text shown to the model."
  ([destination]
   (failure (chart-memory) (assoc chart-args :destination destination)))
  ([memory args]
   (binding [shared/*memory-atom* memory]
     (test-util/tool-failure save-entity/save-entity-tool args tool-names))))

(deftest save-to-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {:name "Sales analytics"}]
        (let [result (save! {:target_type "collection" :collection_id (:id coll)})
              part   (first (:data-parts result))
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a saved question in the target collection"
            (is (some? card))
            (is (= "Venues by price" (:name card)))
            (is (= :bar (:display card)))
            (is (= (:id coll) (:collection_id card))))
          (testing "emits an entity_saved data part pointing at the chart and destination"
            (is (= "entity_saved" (:data-type part)))
            (is (= "c-1" (get-in part [:data :chart_id])))
            (is (= (:id card) (get-in part [:data :card_id])))
            (is (= {:type "collection" :id (:id coll)}
                   (get-in part [:data :destination]))))
          (testing "carries a markdown entity link the chain of thought shows as the Saved label"
            (is (= (str "[Venues by price](metabase://question/" (:id card) ")")
                   (get-in part [:data :title])))))))))

(deftest save-rehydrated-chart-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {:name "Persisted charts"}]
        (let [result (binding [shared/*memory-atom* (rehydrated-chart-memory)]
                       (call-save-entity
                        {:chart_id    "c-1"
                         :name        "Venues by price"
                         :description "Count of venues grouped by price."
                         :destination {:target_type "collection" :collection_id (:id coll)}}))]
          (testing "saves a generated query after its enum values were stringified between turns"
            (is (integer? (get-in result [:structured-output :card-id])))))))))

(deftest save-stamps-card-origin-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
        (let [memory (doto (chart-memory) (swap! assoc :conversation-id convo-id))
              result (binding [shared/*memory-atom* memory]
                       (call-save-entity
                        {:chart_id    "c-1"
                         :name        "Venues by price"
                         :description "Count of venues grouped by price."
                         :destination {:target_type "collection" :collection_id (:id coll)}}))
              card-id (get-in result [:structured-output :card-id])]
          (testing "the card records which conversation + chart it was saved from"
            (is (= {:metabot_conversation_id convo-id
                    :metabot_chart_id        "c-1"}
                   (t2/select-one [:model/Card :metabot_conversation_id :metabot_chart_id]
                                  :id card-id)))))))))

(deftest save-without-conversation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (testing "saving outside a conversation-backed run leaves the origin columns nil"
        (let [result  (save! {:target_type "collection" :collection_id nil})
              card-id (get-in result [:structured-output :card-id])]
          (is (= {:metabot_conversation_id nil :metabot_chart_id nil}
                 (t2/select-one [:model/Card :metabot_conversation_id :metabot_chart_id]
                                :id card-id))))))))

(deftest save-to-root-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [result (save! {:target_type "collection" :collection_id nil})
            card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
        (testing "an explicit null collection_id saves to the root collection"
          (is (nil? (:collection_id card)))
          (is (nil? (get-in result [:data-parts 0 :data :destination :id]))))))))

(deftest save-to-personal-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [result (save! {:target_type "collection"})
            card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
        (testing "omitting collection_id defaults to the user's personal collection"
          (is (= (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :crowberto))
                 (:collection_id card))))))))

(deftest save-to-dashboard-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/Dashboard  dash {:name "Ops" :collection_id (:id coll)}]
        (let [result (save! {:target_type "dashboard" :dashboard_id (:id dash)})
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a dashboard question and places it on the dashboard"
            (is (= (:id dash) (:dashboard_id card)))
            (is (t2/exists? :model/DashboardCard :dashboard_id (:id dash) :card_id (:id card))))
          (testing "the destination points at the dashboard"
            (is (= {:type "dashboard" :id (:id dash)}
                   (get-in result [:data-parts 0 :data :destination])))))))))

(deftest save-seeded-chart-display-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (testing "charts seeded from the viewing context carry no :visualization_settings, so the display falls back to :chart_config :display_type"
        (let [query  (venues-query)
              memory (atom {:state   {:queries {}
                                      :charts  {"c-2" {:chart_id "c-2"
                                                       :queries  [query]
                                                       :visualization_settings nil
                                                       :chart_config {:display_type "line"}}}}
                            :context {}})
              result (binding [shared/*memory-atom* memory]
                       (call-save-entity
                        {:chart_id    "c-2"
                         :name        "Seeded chart"
                         :description "Seeded from the viewing context."
                         :destination {:target_type "collection" :collection_id nil}}))
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (is (= :line (:display card))))))))

(def ^:private document-ast
  {:type "doc"
   :content [{:type "paragraph" :content [{:type "text" :text "Intro"}]}
             {:type "paragraph" :content [{:type "text" :text "Outro"}]}]})

(defn- card-embed [card-id]
  {:type "resizeNode"
   :content [{:type "cardEmbed" :attrs {"id" card-id "_id" string?}}]})

(deftest save-to-document-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/Document  doc  {:name          "Q3 report"
                                            :collection_id (:id coll)
                                            :document      document-ast}]
        (let [result (save! {:target_type "document" :document_id (:id doc)})
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a document question inheriting the document's collection"
            (is (= (:id doc) (:document_id card)))
            (is (= (:id coll) (:collection_id card)))
            (is (= "Venues by price" (:name card))))
          (testing "omitting position appends a card embed at the end of the document"
            (is (=? (conj (:content document-ast) (card-embed (:id card)))
                    (get-in (t2/select-one :model/Document :id (:id doc)) [:document :content]))))
          (testing "the destination points at the document"
            (is (= {:type "document" :id (:id doc)}
                   (get-in result [:data-parts 0 :data :destination])))))))))

(deftest save-to-document-position-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Document doc {:name "Q3 report" :document document-ast}]
        (let [result (save! {:target_type "document" :document_id (:id doc) :position 1})
              card-id (get-in result [:structured-output :card-id])]
          (testing "an explicit position inserts before the block at that index"
            (is (=? [(first (:content document-ast))
                     (card-embed card-id)
                     (second (:content document-ast))]
                    (get-in (t2/select-one :model/Document :id (:id doc)) [:document :content])))))))))

(deftest ^:parallel arguments-the-schema-refuses-test
  (testing "a document destination needs a document_id"
    (is (=? #"Invalid tool arguments: `destination` .*"
            (test-util/tool-boundary-error "save_entity" #'save-entity/save-entity-tool
                                           (assoc chart-args :destination {:target_type "document"})))))
  (testing "a name cannot exceed 254 Unicode code points"
    (is (=? #"Invalid tool arguments: `name` must contain 1 to 254 Unicode code points.*"
            (test-util/tool-boundary-error "save_entity" #'save-entity/save-entity-tool
                                           (assoc chart-args
                                                  :name        (apply str (repeat 255 "x"))
                                                  :destination {:target_type "collection"}))))))

(deftest ^:parallel name-length-counts-code-points-test
  (let [args-schema   (:args (tools.core/declaration save-entity/save-entity-tool))
        ^String ducks (apply str (repeat 128 "\uD83E\uDD86"))]
    (testing "the name limit counts Unicode code points, matching PostgreSQL and MySQL"
      (is (= [256 128] [(.length ducks) (.codePointCount ducks 0 (.length ducks))]))
      (is (mr/validate args-schema (assoc chart-args :name ducks :destination {:target_type "collection"}))))
    (testing "the tool schema gives the LLM the same name length limit"
      (is (= {:type "string" :minLength 1 :maxLength 254}
             (get-in (mjs/transform args-schema) [:properties :name]))))))

(deftest ^:parallel unknown-chart-test
  (let [args (assoc chart-args :chart_id "c-9" :destination {:target_type "collection" :collection_id nil})]
    (testing "an unknown chart ID produces a recoverable error that lists the available IDs"
      (is (=? {:class :recoverable
               :code  ::recoverable.common/unknown-chart-id
               :text  (str "No chart with ID \"c-9\" exists in this conversation. The available chart IDs are c-1.\n"
                           "To make a new chart, call `construct_notebook_query` and use the chart ID that it returns.\n"
                           "To chart a query from this conversation, call `create_chart` with its"
                           " query ID.")}
              (failure (chart-memory) args))))
    (testing "charts without a query or with an ID longer than 36 characters are not offered"
      (let [long-id (apply str (repeat 37 "a"))
            memory  (doto (chart-memory)
                      (swap! update-in [:state :charts] assoc
                             "c-2"   {:chart_id "c-2" :queries [nil]}
                             long-id {:chart_id long-id :queries [(venues-query)]}))]
        (is (str/includes? (:text (failure memory args)) "The available chart IDs are c-1.\n"))))
    (testing "the error says when the conversation has no charts"
      (is (str/includes? (:text (failure (atom {}) args)) "No charts have been created in this conversation yet.")))))

(deftest no-personal-collection-test
  (mt/with-temp [:model/User {user-id :id} {:type :api-key}]
    (mt/with-current-user user-id
      (testing "a user without a personal collection gets instructions for choosing a collection"
        (is (= {:class :recoverable
                :code  ::save-entity/no-personal-collection
                :text  (str "The user has no personal collection, so `collection_id` can't be omitted.\n"
                            "Read `metabase://collections?tree=true` with `read_resource` and pass the ID of a"
                            " collection with `can_write=true`.\n"
                            "Or ask the user which collection to save it to.")}
               (failure {:target_type "collection"})))))))

(deftest unreadable-destination-test
  (testing "a destination that is hidden from the user or in the trash is reported as not found"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Collection hidden       {}
                       :model/Dashboard  trashed-dash {:archived true}
                       :model/Document   trashed-doc  {:archived true :document document-ast}]
          (doseq [[user target-type id] [[:rasta     "collection" (:id hidden)]
                                         [:crowberto "dashboard"  Integer/MAX_VALUE]
                                         [:crowberto "dashboard"  (:id trashed-dash)]
                                         [:crowberto "document"   Integer/MAX_VALUE]
                                         [:crowberto "document"   (:id trashed-doc)]]
                  :let [entity (str (str/capitalize target-type) " " id)]]
            (testing (str (name user) " saving to " entity)
              (mt/with-current-user (mt/user->id user)
                (is (=? {:class :recoverable
                         :code  ::recoverable.common/not-found
                         :text  #(str/starts-with? % (str entity " was not found."))}
                        (failure {:target_type target-type, (keyword (str target-type "_id")) id}))))))
          (testing "the trashed dashboard has no saved card"
            (is (not (t2/exists? :model/Card :dashboard_id (:id trashed-dash))))))))))

(deftest read-only-destination-test
  (testing "a read-only destination produces a recoverable error that offers another collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Collection coll {}
                       :model/Dashboard  dash {:collection_id (:id coll)}
                       :model/Document   doc  {:collection_id (:id coll) :document document-ast}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
          (mt/with-current-user (mt/user->id :rasta)
            (doseq [[destination noun] [[{:target_type "collection" :collection_id (:id coll)}
                                         (str "collection " (:id coll))]
                                        [{:target_type "collection" :collection_id nil} "the root collection"]
                                        [{:target_type "dashboard" :dashboard_id (:id dash)}
                                         (str "dashboard " (:id dash))]
                                        [{:target_type "document" :document_id (:id doc)}
                                         (str "document " (:id doc))]]]
              (testing noun
                (is (= {:class :recoverable
                        :code  ::save-entity/destination-not-writable
                        :text  (str "The user doesn't have permission to save to " noun ".\n"
                                    "Tell the user and offer to save the chart to their personal collection."
                                    " Omit `collection_id` from a collection destination to use it.\n"
                                    "To offer another collection, read `metabase://collections?tree=true` with"
                                    " `read_resource` and pick one with `can_write=true`.")}
                       (failure destination)))))
            (testing "no card is saved in the read-only collection"
              (is (not (t2/exists? :model/Card :collection_id (:id coll)))))))))))

(deftest unrunnable-query-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-current-user (mt/user->id :rasta)
      (testing "a chart cannot be saved when the user lacks permission to run its query"
        (is (= {:class        :unrecoverable
                :code         ::save-entity/no-query-permission
                :user-message "You can't save this chart because you don't have permission to run its query."}
               (tools.error/classify
                (is (thrown? clojure.lang.ExceptionInfo (save! {:target_type "collection"}))))))))))

(defn- invoke-save-entity
  "Call `save_entity` with `args` through the tool runtime and return the outcome."
  [args]
  (let [entries (binding [scope/*current-user-scope* api-scope/unrestricted]
                  (metabot.tools/->entries [#'save-entity/save-entity-tool] (chart-memory) nil :internal))]
    ((:fn (get entries "save_entity")) args)))

(deftest card-create-event-failure-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic _event]
                                                            (when (= :event/card-create topic)
                                                              (throw (ex-info "A subscriber failed." {}))))]
          (testing "the save succeeds and creates one card even when a card-create subscriber fails"
            (let [outcome (invoke-save-entity
                           (assoc chart-args :destination {:target_type "collection" :collection_id (:id coll)}))]
              (is (nil? (:error outcome)))
              (is (= [(get-in outcome [:structured-output :card-id])]
                     (t2/select-pks-vec :model/Card :collection_id (:id coll)))))))))))

(deftest undeclared-failure-test
  (testing "an unexpected failure ends the turn without reaching the model"
    (mt/with-dynamic-fn-redefs [queries/create-card! (fn [& _] (throw (ex-info "boom" {})))]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= {:class :unrecoverable :code :internal}
               (failure {:target_type "collection" :collection_id nil})))))))
