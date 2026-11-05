(ns metabase.metabot.tools.write-dashboard
  "The `write_dashboard` tool: create, edit, trash and restore dashboards.

  One call is one save.
  It takes MCP's dashboard ops, without `add_iframe`, `add_action` and `patch_dashcard`.
  It saves them through the shared writer in [[metabase.metabot.toolkit.dashboard-write]], which MCP's
  `dashboard_write` uses too, so both tools get the same permission checks, transactions and events.

  The `add_card` and `replace_card` ops also take a `chart_id` from the conversation.
  The tool saves each such chart as a question of the target dashboard, in the same transaction as the ops, so a
  failed call saves nothing.
  A chart saved to that dashboard earlier in the conversation is reused, so a retry doesn't duplicate questions.

  A successful call returns the saved dashboard to the model and sends the frontend a `dashboard_saved` data part."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.toolkit.dashboard-op-schema :as dashboard-op-schema]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.metabot.toolkit.dashboard-write :as dashboard-write]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.quoting :as quoting]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Arguments ----------------------------------------------------

(def ^:private excluded-ops
  "MCP ops this tool leaves out. They edit things nothing asks Metabot for, such as raw visualization settings."
  #{"add_action"
    "add_iframe"
    "patch_dashcard"})

(def ^:private chart-ops
  "The ops that take a chart from the conversation in place of a `card_id`."
  #{"add_card" "replace_card"})

(def ^:private chart-id-schema
  "The `chart_id` argument: [[save-entity/chart-id-schema]], described for the model."
  (let [[tag props] save-entity/chart-id-schema]
    [tag (assoc props :description (str "Id of a chart you created in this conversation. Pass this or `card_id`. "
                                        "The chart is saved as a question on this dashboard."))]))

(def ^:private chart-source-entries
  "The entries that replace `card_id` in [[chart-ops]]."
  [[:card_id {:optional true}
    [:maybe [:int {:description "Numeric id of a saved question, model or metric. Pass this or `chart_id`."}]]]
   [:chart_id {:optional true}
    [:maybe chart-id-schema]]
   [:name {:optional true}
    [:maybe [:string {:min         1
                      :max         254
                      :description "Name of the question a `chart_id` becomes. Required with `chart_id`."}]]]])

(defn- with-chart-source
  "An op entry of [[dashboard-op-schema/op-schema]], with its `card_id` replaced by [[chart-source-entries]]."
  [[op-name [tag props & entries]]]
  [op-name (into [tag props]
                 (mapcat #(if (= :card_id (first %)) chart-source-entries [%]))
                 entries)])

(def ^:private op-schema
  "One op: [[dashboard-op-schema/op-schema]] without [[excluded-ops]], with [[chart-ops]] taking a `chart_id`."
  (let [[tag props & children] dashboard-op-schema/op-schema
        children               (into []
                                     (comp (remove (comp excluded-ops first))
                                           (map #(cond-> % (chart-ops (first %)) with-chart-source)))
                                     children)]
    (into [tag (assoc props :error/message (str "should be one of: " (str/join ", " (map first children))))]
          children)))

;; A null means "left out" for every argument, because strict providers fill every unset optional field with null.
(def ^:private args-schema
  [:map {:closed true}
   [:dashboard_id {:optional true}
    [:maybe [:int {:min         1
                   :description "Id of the dashboard to change. Omit it to create a dashboard."}]]]
   [:name {:optional true}
    [:maybe [:string {:min         1
                      :max         254
                      :description (str "Dashboard name. Required to create one: the user's name for it, or one you "
                                        "choose.")}]]]
   [:description {:optional true}
    [:maybe [:string {:description "Plain-text description of what the dashboard shows."}]]]
   [:collection_id {:optional true}
    [:maybe [:or {:description (str "Collection id to save the dashboard in or move it to, or \"root\" for the "
                                    "top-level collection. A new dashboard goes to the user's personal "
                                    "collection when this is omitted.")}
             [:int {:min 1}]
             [:= "root"]]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Existing dashboards only: true moves the dashboard to the trash, false "
                                         "restores it. Don't send ops with it.")}]]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description "Existing dashboards only: attributes to remove."} "description"]]]]
   [:ops {:optional true}
    [:maybe [:sequential {:description "Edits applied in order and saved together."} op-schema]]]])

(def ^:private plain-attribute-keys
  "The dashboard attributes the writer takes as the model sends them. The `collection_id` and `clear` are resolved."
  [:name :description :archived])

(defn- without-nils
  "The map `m` without the keys whose value is nil."
  [m]
  (into {} (remove (comp nil? val)) m))

;;; --------------------------------------------------- Errors -----------------------------------------------------

(tools/defrecoverable invalid-request!
  "The arguments are well formed but don't make sense together."
  {:payload [:map {:closed true}
             [:problem [:enum :name-required :archived-on-create :clear-on-create :archived-with-ops
                        :description-set-and-cleared :no-changes]]]}
  [{:keys [problem]}]
  {:message  (case problem
               :name-required               (str "A new dashboard needs a `name`. Use the user's name for it, or"
                                                 " choose a short one that says what it shows.")
               :archived-on-create          (str "`archived` applies only to an existing dashboard. Pass"
                                                 " `dashboard_id` to trash or restore one.")
               :clear-on-create             "`clear` applies only to an existing dashboard."
               :archived-with-ops           (str "`archived` can't be sent with `ops`. Trash or restore the dashboard"
                                                 " in one call, and edit it in another.")
               :description-set-and-cleared "`description` is both set and cleared. Pass one or the other."
               :no-changes                  "This call changes nothing. Pass the attributes or `ops` to change.")
   :recovery []})

(tools/defrecoverable dashboard-not-writable!
  "The user can read the dashboard but cannot edit it."
  {:payload     [:map {:closed true} [:dashboard-id :int]]
   :status-code 403}
  [{:keys [dashboard-id]}]
  {:message  (str "You can view dashboard " dashboard-id " but can't edit it, so nothing was saved.")
   :recovery [{:uses #{}
               :text "Tell the user why."}
              {:uses #{"write_dashboard"}
               :text (str "If they want, use `write_dashboard` to create a dashboard in their personal collection"
                          " instead.")}]})

(defn- ids-text
  "The ids in `ids`, joined for a sentence."
  [ids]
  (str/join ", " ids))

(defn- quoted-list
  "The strings in `values`, quoted and joined for a sentence."
  [values]
  (str/join ", " (map quoting/quoted values)))

(def ^:private op-error-details
  "For each op error code, a function from the error data to the sentence explaining it.
  Values the model sent are quoted."
  {:invalid-op
   (fn [{:keys [explanation]}]
     (str "The op is malformed: " (quoting/quoted (pr-str explanation)) "."))

   :invalid-payload
   (fn [{:keys [explanation]}]
     (str "The change would make an invalid dashboard: " (quoting/quoted (pr-str explanation)) "."))

   :duplicate-new-id
   (fn [{:keys [id]}]
     (str "Id " id " is already used in this call. Give each new card or tab its own negative id."))

   :unknown-dashcard
   (fn [{:keys [dashcard-id]}]
     (str "The dashboard has no card with dashcard id " dashcard-id "."))

   :unknown-card
   (fn [{:keys [card-id]}]
     (str "There's no question with id " (quoting/quoted card-id) " that the user can read."))

   :unknown-tab
   (fn [{:keys [tab-id]}]
     (str "The dashboard has no tab with id " tab-id "."))

   :no-free-space
   (fn [_]
     "The tab has no free space for another card. Pass a `position`, or remove or resize a card first.")

   :link-needs-url-or-entity
   (fn [_] "Pass exactly one of `url` or `entity`.")

   :unpatchable-key
   (fn [{:keys [key use-op]}]
     (str (quoting/quoted key) " can't be patched. Use the " (quoting/quoted use-op) " op."))

   :unknown-patch-key
   (fn [{:keys [key]}]
     (str (quoting/quoted key) " is not a dashcard property that can be patched."))

   :tab-index-out-of-range
   (fn [{:keys [index tab-count]}]
     (str "Index " index " is out of range. The dashboard has " tab-count " tabs."))

   :cards-without-tab
   (fn [{:keys [dashcard-ids]}]
     (str "The dashboard has tabs, so every card needs one, and cards " (ids-text dashcard-ids) " have none."
          " Pass `tab` on the op that adds a card, or `move` a placed card to a tab."))

   :unknown-parameter
   (fn [{:keys [parameter-id]}]
     (str "The dashboard has no filter with id " (quoting/quoted parameter-id) "."))

   :parameter-exists
   (fn [{:keys [parameter-id]}]
     (str "Filter " (quoting/quoted parameter-id) " already exists. Use `update_parameter` to change it."))

   :set-and-cleared
   (fn [{:keys [field]}]
     (str (quoting/quoted field) " is both set and cleared. Pass one or the other."))

   :conflicting-parameter-destinations
   (fn [_] "Pass exactly one of `index` or `dashcard_id`.")

   :missing-parameter-destination
   (fn [_] "Pass `index` to reorder the filters, or `dashcard_id` to show the filter on a card.")

   :parameter-index-out-of-range
   (fn [{:keys [index parameter-count]}]
     (str "Index " index " is out of range. The dashboard has " parameter-count " filters."))

   :field-not-exposed
   (fn [{:keys [dashcard-id field-id parameter-id]}]
     (str "Dashcard " dashcard-id " has no column for field " field-id ", so filter " (quoting/quoted parameter-id)
          " can't be connected to it. Connect it only to cards whose question uses that field."))

   :no-card-behind-dashcard
   (fn [{:keys [dashcard-id]}]
     (str "Dashcard " dashcard-id " has no question. A text or heading card takes only a `target` of"
          " [\"text-tag\", \"<name>\"] for a {{name}} placeholder in its text."))

   :mapping-card-not-on-dashcard
   (fn [{:keys [dashcard-id card-id]}]
     (str "Question " card-id " is not on dashcard " dashcard-id "."))

   :unknown-template-tag
   (fn [{:keys [card-id tag tags]}]
     (str "Question " card-id " has no variable named " (quoting/quoted tag) ". "
          (if (seq tags)
            (str "Its variables are " (quoted-list tags) ".")
            "It has none, so connect the filter with `target_field`.")))

   :unwireable-tag
   (fn [{:keys [tag tag-type wireable-tags]}]
     (str "Variable " (quoting/quoted tag) " has type " (quoting/quoted tag-type) " and can't take a filter value. "
          (if (seq wireable-tags)
            (str "Variables that can: " (quoted-list wireable-tags) ".")
            "The question has no variables that can.")))

   :unknown-text-tag
   (fn [{:keys [dashcard-id placeholders]}]
     (str "The target matches no {{placeholder}} in the text of dashcard " dashcard-id ". "
          (if (seq placeholders)
            (str "Its placeholders are " (quoted-list placeholders) ".")
            "It has none.")))

   :unresolved-target
   (fn [{:keys [card-id parameter-id]}]
     (str "Filter " (quoting/quoted parameter-id) " can't be connected to question " card-id
          ", which has no matching column or variable."))

   :missing-wire-target
   (fn [_] "Pass one of `target_field`, `target_tag` or `target`.")

   ::card-and-chart
   (fn [_] "Pass one of `card_id` or `chart_id`, not both.")

   ::no-card-source
   (fn [_] "Pass `card_id` for a saved question, or `chart_id` for a chart from this conversation.")

   ::chart-without-name
   (fn [_] "Pass `name`, the name of the question the chart becomes.")})

(tools/defrecoverable dashboard-op-rejected!
  "An op is invalid, so nothing was saved.
  The `:dashboard-id` is the dashboard being edited, and is absent on a create."
  {:payload [:map {:closed true}
             [:code         (into [:enum] (keys op-error-details))]
             [:data         :map]
             [:dashboard-id {:optional true} :int]
             [:op-index     {:optional true} :int]
             [:op-name      {:optional true} [:maybe :string]]]}
  [{:keys [code data dashboard-id op-index op-name]}]
  (let [detail ((get op-error-details code) data)]
    {:message  (str (when op-index
                      (str "ops[" op-index "]" (when op-name (str " (" op-name ")")) ": "))
                    detail " Nothing was saved.")
     :recovery (if dashboard-id
                 [{:uses #{"read_resource"}
                   :text (str "To check the ids of its cards, read `metabase://dashboard/" dashboard-id "/items`"
                              " with `read_resource`.")}]
                 [])}))

(defn- op-rejected!
  "Throws [[dashboard-op-rejected!]] for the compiler error `data`, as [[dashboard-ops/error-data]] reads it.
  The `dashboard-id` is the dashboard being edited, or nil on a create."
  [dashboard-id {code ::dashboard-ops/error :keys [op-index op-name] :as data}]
  (dashboard-op-rejected!
   (cond-> {:code code
            :data (dissoc data ::dashboard-ops/error :op-index :op-name)}
     dashboard-id (assoc :dashboard-id dashboard-id)
     op-index     (assoc :op-index op-index)
     op-name      (assoc :op-name op-name))))

(defn- do-with-op-errors
  "Calls `thunk`, converting a compiler error from [[dashboard-ops/errors]] into [[dashboard-op-rejected!]].
  The `dashboard-id` is the dashboard being edited, or nil on a create."
  [dashboard-id thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if-let [data (dashboard-ops/error-data e)]
        (op-rejected! dashboard-id data)
        (throw e)))))

;;; -------------------------------------------------- Checks ------------------------------------------------------

(defn- target-dashboard
  "The dashboard `args` edit, hydrated for the compiler, or nil on a create.
  Throws unless the user can edit it, and when it is in the trash and `args` don't restore it."
  [{:keys [dashboard_id archived]}]
  (when dashboard_id
    (let [dashboard (-> (tools/with-entity {:kind :dashboard, :id dashboard_id}
                          (api/read-check :model/Dashboard dashboard_id))
                        (t2/hydrate [:dashcards :series :card] :tabs))]
      (when-not (mi/can-write? dashboard)
        (dashboard-not-writable! {:dashboard-id dashboard_id}))
      (when (and (:archived dashboard) (not (false? archived)))
        (save-entity/destination-archived! {:kind :dashboard, :id dashboard_id}))
      dashboard)))

(defn- check-collection-writable!
  "Throws unless the user can save a dashboard to the collection with `collection-id`, nil for the root collection."
  [collection-id]
  (when collection-id
    (tools/with-entity {:kind :collection, :id collection-id}
      (api/read-check :model/Collection collection-id)))
  (save-entity/check-writable! (cond-> {:kind :collection} collection-id (assoc :id collection-id))
                               #(api/create-check :model/Dashboard {:collection_id collection-id})))

(defn- check-request!
  "Throws [[invalid-request!]] when the arguments don't make sense together."
  [{:keys [dashboard_id ops clear] :as args}]
  (let [creating? (nil? dashboard_id)
        problem   (cond
                    (and creating? (not (contains? args :name))) :name-required
                    (and creating? (contains? args :archived))   :archived-on-create
                    (and creating? (seq clear))                  :clear-on-create
                    (and (contains? args :archived) (seq ops))   :archived-with-ops
                    (and (contains? args :description)
                         (some #{"description"} clear))          :description-set-and-cleared
                    (and (not creating?)
                         (empty? ops)
                         (empty? clear)
                         (not-any? #(contains? args %) (conj plain-attribute-keys :collection_id)))
                    :no-changes)]
    (when problem
      (invalid-request! {:problem problem}))))

(defn- check-op-sources!
  "Throws [[dashboard-op-rejected!]] unless each of the [[chart-ops]] in `ops` has one source, and a chart one a name.
  The `dashboard-id` is the dashboard being edited, or nil on a create."
  [dashboard-id ops]
  (doseq [[idx {op-name :op :keys [card_id chart_id] :as op}] (map-indexed vector ops)
          :when (chart-ops op-name)
          :let  [code (cond
                        (and card_id chart_id)                    ::card-and-chart
                        (not (or card_id chart_id))               ::no-card-source
                        (and chart_id (not (contains? op :name))) ::chart-without-name)]
          :when code]
    (dashboard-op-rejected! (cond-> {:code     code
                                     :data     {}
                                     :op-index idx
                                     :op-name  op-name}
                              dashboard-id (assoc :dashboard-id dashboard-id)))))

;;; --------------------------------------------------- Charts -----------------------------------------------------

(defn- requested-charts
  "The charts the ops name, in order, each `{:chart-id :name :dataset_query :display}`.
  Each must be in the conversation, and the user must be able to run its query.
  A chart that several ops name takes the name from the first."
  [ops]
  (->> ops
       (filter :chart_id)
       (m/distinct-by :chart_id)
       (mapv (fn [{:keys [chart_id] :as op}]
               (let [{:keys [dataset_query] :as chart} (save-entity/resolve-chart chart_id)]
                 (save-entity/check-query-permissions! dataset_query)
                 (assoc chart :chart-id chart_id :name (:name op)))))))

(defn- save-chart!
  "Saves `chart` as a question of the dashboard with `dashboard-id`, and returns `{:chart-id :card-id :card}`.
  A question already saved from the chart to this dashboard in this conversation is reused, without a `:card`."
  [dashboard-id {:keys [chart-id name dataset_query display]}]
  (let [conversation-id (shared/current-conversation-id)]
    (if-let [card-id (some-> conversation-id
                             (metabot.db/conversation-dashboard-question-id chart-id dashboard-id))]
      {:chart-id chart-id, :card-id card-id}
      (let [card (queries/create-card! {:name                   name
                                        :dataset_query          dataset_query
                                        :display                display
                                        :visualization_settings {}
                                        :dashboard_id           dashboard-id}
                                       {:id api/*current-user-id*}
                                       :delay-event
                                       ;; The ops place the card, so the save must not place it too.
                                       false)]
        (when conversation-id
          (metabot.db/link-card-to-conversation! (:id card) conversation-id chart-id))
        {:chart-id chart-id, :card-id (:id card), :card card}))))

(defn- with-card-ids
  "The ops in `ops`, with each `chart_id` replaced by the id of the question saved from it.
  That is the shape the shared op schema takes."
  [ops chart-id->card-id]
  (mapv (fn [op]
          (if (chart-ops (:op op))
            (cond-> (dissoc op :chart_id :name)
              (:chart_id op) (assoc :card_id (chart-id->card-id (:chart_id op))))
            op))
        ops))

;;; --------------------------------------------------- Saving -----------------------------------------------------

(defn- dashboard-attrs
  "The dashboard attributes `args` set. A create without a `collection_id` goes to the personal collection."
  [{:keys [clear] :as args} creating?]
  (cond-> (select-keys args plain-attribute-keys)
    (contains? args :collection_id)
    (assoc :collection_id (let [id (:collection_id args)] (when-not (= "root" id) id)))

    (and creating? (not (contains? args :collection_id)))
    (assoc :collection_id (save-entity/personal-collection-id))

    (some #{"description"} clear)
    (assoc :description nil)))

(def ^:private dashboard-locks
  "The locks [[save!]] takes, striped by dashboard id."
  (vec (repeatedly 64 #(Object.))))

(defn- dashboard-lock
  "The lock for the dashboard with `dashboard-id`, or one shared by creates when it is nil."
  ^Object [dashboard-id]
  (nth dashboard-locks (mod (or dashboard-id 0) (count dashboard-locks))))

(defn- save-in-transaction!
  "Saves the change as [[save!]] does, once it holds the dashboard's lock."
  [dashboard attrs ops charts]
  (t2/with-transaction [_conn]
    (let [current      (when dashboard
                         (-> (or (metabot.db/dashboard (:id dashboard))
                                 (recoverable.common/not-found! {:kind :dashboard, :id (:id dashboard)}))
                             (t2/hydrate [:dashcards :series :card] :tabs)))
          ;; A dashboard question needs its dashboard, so a create with charts saves the dashboard first.
          created      (when (and (nil? current) (seq charts))
                         (dashboard-write/write! {:attrs attrs}))
          target       (or current created)
          saved-charts (mapv (partial save-chart! (:id target)) charts)
          ops          (with-card-ids ops (into {} (map (juxt :chart-id :card-id)) saved-charts))]
      {:dashboard    (dashboard-write/write! (cond-> {:ops ops}
                                               target        (assoc :dashboard target)
                                               (not created) (assoc :attrs attrs)))
       :saved-charts saved-charts})))

(defn- save!
  "Saves the change to `dashboard`, nil on a create, and returns `{:dashboard :saved-charts}`.
  The dashboard is reread before it is changed.
  The saved dashboard is hydrated as [[dashboard-write/write!]] returns it.
  Everything is saved in one transaction, the charts' questions included."
  [dashboard attrs ops charts]
  ;; The tool calls of one model step run in parallel, and ops save a full-replacement layout. So an edit holds the
  ;; dashboard's lock until it commits, and compiles against the dashboard as it is then. Otherwise a parallel edit's
  ;; cards would be deleted, or one chart saved twice. The lock is per JVM, which covers one conversation's calls.
  (let [lock (dashboard-lock (:id dashboard))]
    (locking lock
      (save-in-transaction! dashboard attrs ops charts))))

;;; -------------------------------------------------- Results -----------------------------------------------------

(defn- xml-attrs
  "The keys and values in `kvs` rendered as XML attributes, leaving out nil values."
  [& kvs]
  (str/join (for [[k v] (partition 2 kvs)
                  :when (some? v)]
              (str " " (name k) "=\"" (llm-shape/escape-xml (str v)) "\""))))

(defn- dashcard-xml
  "One dashcard of a saved dashboard. A card the user can't read shows its slot only."
  [{:keys [id card row col size_x size_y visualization_settings]}]
  (let [readable (when (and card (mi/can-read? card)) card)]
    (str "<dashcard"
         (xml-attrs :id id
                    :card_id (:id readable)
                    :name (:name readable)
                    :display (some-> (or (:display readable)
                                         (get-in visualization_settings [:virtual_card :display]))
                                     name)
                    :row row :col col :size_x size_x :size_y size_y)
         "/>")))

(defn- dashboard-lines
  "The lines of the saved dashboard `dash`: its tabs, dashcards with their layout, and filters with the dashcards
  they connect to."
  [{:keys [id name description tabs dashcards parameters]}]
  (let [by-tab      (group-by :dashboard_tab_id (sort-by (juxt :row :col) dashcards))
        connections (fn [parameter-id]
                      (not-empty (for [dc dashcards
                                       :when (some #(= parameter-id (:parameter_id %)) (:parameter_mappings dc))]
                                   (:id dc))))
        card-lines  (fn [indent dcs] (for [dc dcs] (str indent (dashcard-xml dc))))]
    [(str "  <dashboard" (xml-attrs :id id :name name) ">")
     (when description
       (str "    <description>" (llm-shape/escape-xml-content description) "</description>"))
     (if (seq tabs)
       (for [{tab-id :id tab-name :name} (sort-by :position tabs)]
         [(str "    <tab" (xml-attrs :id tab-id :name tab-name) ">")
          (card-lines "      " (get by-tab tab-id))
          "    </tab>"])
       (card-lines "    " (get by-tab nil)))
     (for [{parameter-id :id :as parameter} parameters]
       (str "    <filter"
            (xml-attrs :id parameter-id
                       :name (:name parameter)
                       :type (some-> (:type parameter) u/qualified-name)
                       :connected_dashcards (some->> (connections parameter-id) ids-text))
            "/>"))
     "  </dashboard>"]))

(defn- action
  "What saving `attrs` did to `dashboard`, which is nil on a create.
  One of `\"created\"`, `\"updated\"`, `\"trashed\"` or `\"restored\"`.
  Trashing and restoring are judged by whether the dashboard was in the trash."
  [dashboard {:keys [archived]}]
  (cond
    (nil? dashboard)                              "created"
    (and archived (not (:archived dashboard)))    "trashed"
    (and (false? archived) (:archived dashboard)) "restored"
    :else                                         "updated"))

(def ^:private opening-profiles
  "The profiles whose frontend opens a dashboard they created once the reply finishes.
  NLQ Metabot only links it."
  #{:internal :internal-sql})

(defn- result
  "The tool result for the saved `dashboard`."
  [{:keys [id name collection_id] :as dashboard} action saved-charts profile-id]
  (let [link        (str "metabase://dashboard/" id)
        layout?     (contains? #{"created" "updated"} action)
        chart-pairs (for [{:keys [chart-id card-id]} saved-charts]
                      {:chart_id chart-id, :card_id card-id})
        output      (te/lines
                     (str "<dashboard_saved" (xml-attrs :action action :url link) ">")
                     (str "  <collection"
                          (xml-attrs :id collection_id :name (save-entity/collection-name collection_id))
                          "/>")
                     (when (seq chart-pairs)
                       ["  <saved_charts>"
                        (for [{:keys [chart_id card_id]} chart-pairs]
                          (str "    <chart" (xml-attrs :chart_id chart_id :card_id card_id) "/>"))
                        "  </saved_charts>"])
                     (when layout?
                       (dashboard-lines dashboard))
                     "</dashboard_saved>"
                     (case action
                       "trashed"  "Tell the user you moved it to the trash, and that they can restore it from there."
                       "restored" "Tell the user you restored it."
                       "Tell the user what you changed and where the dashboard is saved.")
                     (str "Link it as " (te/link name link) "."))]
    {:output            output
     :structured-output {:result-type  :dashboard-saved
                         :dashboard-id id
                         :action       action}
     :data-parts        [(streaming/dashboard-saved-part
                          {:dashboard_id  id
                           :action        action
                           :name          name
                           :url           (str "/dashboard/" id)
                           :collection_id collection_id
                           :open          (and (= "created" action) (contains? opening-profiles profile-id))
                           :saved_charts  (vec chart-pairs)})]}))

;;; ---------------------------------------------------- Tool ------------------------------------------------------

(def ^:private tool-description
  "Describe how to call `write_dashboard`."
  (te/lines
   "Create, edit, trash or restore a dashboard. Each call saves at once; don't ask the user to confirm first."
   ""
   "- Create: omit `dashboard_id` and pass `name`. A new dashboard goes to the user's personal collection unless"
   "  you pass `collection_id`. To build a dashboard about a topic, create the charts first, then add them all in"
   "  one call with `ops`."
   "- Edit: pass `dashboard_id` with `name`, `description`, `collection_id`, `clear` or `ops`."
   "- Trash or restore: pass `dashboard_id` and `archived`, with no `ops`."
   ""
   "Ops apply in order and save together; if any fails, nothing is saved. `add_card` and `replace_card` take a"
   "`card_id` for a saved question, or a `chart_id` and `name` for a chart from this conversation."
   "Give each new card or tab its own negative id (-1, -2, …) and use it in later ops of the same call."
   "Before your first call, load the `write-dashboard` skill for the grid, layout and filter rules."
   ""
   "The result is the saved dashboard with real ids. Tell the user what changed and link the dashboard."))

(defrecord WriteDashboardTool []
  tools/Tool
  (declaration [_]
    {:name            "write_dashboard"
     :description     tool-description
     :scope           scope/agent-content-write
     :args            args-schema
     :metabot/writes? true})

  (handle [_ args {:keys [profile-id]}]
    (let [{:keys [dashboard_id ops] :as args} (cond-> (without-nils args)
                                                (:ops args) (update :ops (partial mapv without-nils)))
          ;; Who may write is checked before anything about the payload.
          dashboard (target-dashboard args)
          attrs     (dashboard-attrs args (nil? dashboard))]
      (when (contains? attrs :collection_id)
        (check-collection-writable! (:collection_id attrs)))
      (check-request! args)
      (check-op-sources! dashboard_id ops)
      (let [charts (requested-charts ops)
            {saved :dashboard :keys [saved-charts]}
            (save-entity/do-with-save-rejections
             #(do-with-op-errors dashboard_id (fn [] (save! dashboard attrs ops charts))))]
        (doseq [{:keys [card]} saved-charts
                :when card]
          (save-entity/publish-card-create! card))
        (result saved (action dashboard attrs) saved-charts profile-id)))))

(def write-dashboard-tool
  "Create, edit, trash or restore a dashboard, saving charts from this conversation onto it."
  (->WriteDashboardTool))
