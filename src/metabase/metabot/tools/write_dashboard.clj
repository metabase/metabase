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
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.toolkit.dashboard-op-schema :as dashboard-op-schema]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]
   [metabase.metabot.toolkit.dashboard-write :as dashboard-write]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-details :as entity-details]
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
    [:maybe (save-entity/name-schema "Name of the question a `chart_id` becomes. Required with `chart_id`.")]]])

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
    [:maybe (save-entity/name-schema (str "Dashboard name. Required to create one: the user's name for it, or one you"
                                          " choose."))]]
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

(tools/defrecoverable collection-trashed!
  "The collection the dashboard would be created in or moved to is in the trash."
  {:payload     [:map {:closed true} [:collection-id :int]]
   :status-code 404}
  [{:keys [collection-id]}]
  {:message  (str "Collection " collection-id " is in the trash, so the dashboard can't be saved there. Nothing was"
                  " saved.")
   :recovery [{:uses #{"read_resource"}
               :text (str "To use another collection, read `metabase://collections?tree=true` with `read_resource`"
                          " and pass the id of one with `can_write=true` as `collection_id`.")}
              {:uses #{}
               :text (str "Or ask the user whether to restore the collection from the trash first, or which"
                          " collection to use.")}]})

(tools/defrecoverable collection-not-writable!
  "The user can see the collection the dashboard would be created in or moved to, but can't save to it.
  The `:collection-id` is absent for the root collection. `:creating?` is true on a create."
  {:payload     [:map {:closed true}
                 [:collection-id {:optional true} :int]
                 [:creating?     :boolean]]
   :status-code 403}
  [{:keys [collection-id creating?]}]
  {:message  (str "The user can't save dashboards to "
                  (if collection-id (str "collection " collection-id) "the root collection")
                  ". Nothing was saved.")
   :recovery (into [{:uses #{"read_resource"}
                     :text (str "To use another collection, read `metabase://collections?tree=true` with"
                                " `read_resource` and pass the id of one with `can_write=true` as `collection_id`.")}]
                   (if creating?
                     [{:uses #{}
                       :text (str "Or omit `collection_id` to create the dashboard in the user's personal"
                                  " collection, or ask the user which collection to use.")}]
                     [{:uses #{}
                       :text "Or ask the user which collection to move it to."}]))})

(tools/defrecoverable dashboard-not-restorable!
  "The dashboard can't be restored to the collection it was trashed from: it went to the trash with that collection,
  or that collection is gone, trashed, or not writable."
  {:payload [:map {:closed true} [:dashboard-id :int]]}
  [{:keys [dashboard-id]}]
  {:message  (str "Dashboard " dashboard-id " can't be restored to its old collection, because that collection is in"
                  " the trash or the user can't save to it. Nothing was saved.")
   :recovery [{:uses #{"write_dashboard"}
               :text (str "To restore it into another collection, call `write_dashboard` with `archived: false` and"
                          " that collection's `collection_id`.")}
              {:uses #{}
               :text (str "Or ask the user whether to restore its collection from the trash first, or which"
                          " collection to restore the dashboard to.")}]})

(defn- ids-text
  "The ids in `ids`, joined for a sentence."
  [ids]
  (str/join ", " ids))

(tools/defrecoverable cards-not-curated!
  "This Metabot only uses curated content, and the ops add or place questions that aren't curated.
  The `:card-ids` are those questions, each one the user can read."
  {:payload [:map {:closed true} [:card-ids [:sequential {:min 1} :int]]]}
  [{:keys [card-ids]}]
  {:message  (str (if (next card-ids) "Questions " "Question ") (ids-text card-ids)
                  " can't be added: this Metabot only uses curated content (verified, official, or Library"
                  " content). Nothing was saved.")
   :recovery [{:uses #{"search"}
               :text "Call `search` to find curated questions, models, or metrics and add one of those instead."}]})

(tools/defrecoverable cards-in-other-dashboards!
  "The ops place questions saved inside other dashboards, which only those dashboards can show.
  Each of `:cards` is a question the user can read, with the dashboard it is saved in."
  {:payload [:map {:closed true}
             [:cards [:sequential {:min 1} [:map {:closed true}
                                            [:card-id      :int]
                                            [:dashboard-id :int]]]]]}
  [{:keys [cards]}]
  {:message  (str "A question saved in a dashboard can be shown only on that dashboard, and these are saved in other"
                  " dashboards: "
                  (str/join ", " (for [{:keys [card-id dashboard-id]} cards]
                                   (str "question " card-id " (dashboard " dashboard-id ")")))
                  ". Nothing was saved.")
   :recovery [{:uses #{"construct_notebook_query" "create_chart"}
               :text (str "To show the same data, build a query on the question with `construct_notebook_query`,"
                          " chart it with `create_chart`, and add that chart with `chart_id` and a `name`. It is"
                          " saved as a new question on this dashboard.")}
              {:uses #{}
               :text "Or ask the user which question to add instead."}]})

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
     ;; New rows carry the caller's negative ids. A stored card with no tab predates the dashboard's tabs, and the
     ;; result lists it as `all_tabs`, so the model needs to hear that saving any ops makes it pick a tab for it.
     (let [{added true, stored false} (group-by neg? dashcard-ids)]
       (str/join " "
                 (cond-> ["The dashboard has tabs, so every card needs one."]
                   (seq added)
                   (conj (str "Cards " (ids-text added) " have none. Pass `tab` on the op that adds a card,"
                              " or `move` it to a tab."))
                   (seq stored)
                   (conj (str "Cards " (ids-text stored) " were already on the dashboard with no tab, so they show"
                              " on every tab. The save needs each of them on one tab: `move` them to a tab in this"
                              " call."))))))

   :overlapping-cards
   (fn [{:keys [dashcard-ids]}]
     (str "Cards " (ids-text dashcard-ids) " would overlap, and this call gives both a `position`."
          " Give them positions that don't cover each other. Other cards move down by themselves."))

   :past-grid-edge
   (fn [{:keys [dashcard-id col size-x]}]
     (str "Card " dashcard-id " would run past the grid's right edge: `col` " col " plus `size_x` " size-x
          " is more than 24. Move it left or make it narrower."))

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

(defn- check-not-trashed!
  "Throws when `dashboard` is in the trash and `changes`, the arguments or attributes saved to it, don't restore it.
  A restore that keeps the dashboard's collection must pass the trash's own check, `can_restore`, so the dashboard
  doesn't stay in a trashed collection. A restore that also moves it is checked as a move."
  [dashboard {:keys [archived] :as changes}]
  (when (:archived dashboard)
    (cond
      (not (false? archived))
      (save-entity/destination-archived! {:kind :dashboard, :id (:id dashboard)})

      (and (not (contains? changes :collection_id))
           (not (:can_restore (t2/hydrate dashboard :can_restore))))
      (dashboard-not-restorable! {:dashboard-id (:id dashboard)}))))

(defn- target-dashboard
  "The dashboard `args` edit, unhydrated, or nil on a create. [[save!]] rereads it to compile against.
  Throws unless the user can edit it, and when it is in the trash and `args` don't restore it."
  [{:keys [dashboard_id] :as args}]
  (when dashboard_id
    (let [dashboard (tools/with-entity {:kind :dashboard, :id dashboard_id}
                      (api/read-check :model/Dashboard dashboard_id))]
      (when-not (mi/can-write? dashboard)
        (dashboard-not-writable! {:dashboard-id dashboard_id}))
      (check-not-trashed! dashboard args)
      dashboard)))

(defn- check-collection-writable!
  "Throws unless the user can save a dashboard to the collection with `collection-id`, nil for the root collection.
  A collection in the trash is refused. `creating?` says whether the dashboard is new, which changes the advice."
  [collection-id creating?]
  (when collection-id
    (let [collection (tools/with-entity {:kind :collection, :id collection-id}
                       (api/read-check :model/Collection collection-id))]
      (when (:archived collection)
        (collection-trashed! {:collection-id collection-id}))))
  (try
    (api/create-check :model/Dashboard {:collection_id collection-id})
    (catch clojure.lang.ExceptionInfo e
      (if (= 403 (:status-code (ex-data e)))
        (collection-not-writable! (cond-> {:creating? creating?} collection-id (assoc :collection-id collection-id)))
        (throw e)))))

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

(defn- placed-card-ids
  "The ids of the saved questions `ops` put on the dashboard, as cards or as series, each once."
  [ops]
  (into []
        (comp (mapcat (fn [{op-name :op :keys [card_id series card_ids]}]
                        (case op-name
                          ("add_card" "replace_card") (cons card_id series)
                          "set_series"                card_ids
                          nil)))
              (remove nil?)
              (distinct))
        ops))

(defn- check-cards-curated!
  "Under [[shared/curated-only?]], throws [[cards-not-curated!]] unless every saved question `ops` place is curated.
  The dashboard itself is a destination, so it needn't be curated. A question the user can't read is left to the ops
  compiler, which reports it as unknown, so the refusal doesn't reveal whether it is curated."
  [ops]
  (when (shared/curated-only?)
    (when-let [card-ids (seq (placed-card-ids ops))]
      (let [curated (curation/curated-ids (map #(vector "card" %) card-ids))
            refused (into []
                          (filter #(and (not (contains? curated ["card" %]))
                                        (some-> (metabot.db/card %) mi/can-read?)))
                          card-ids)]
        (when (seq refused)
          (cards-not-curated! {:card-ids refused}))))))

(defn- check-cards-not-in-other-dashboards!
  "Throws [[cards-in-other-dashboards!]] when `ops` place a question saved inside a dashboard other than `dashboard`,
  nil on a create. The writer refuses those with no reason the model could act on.
  As in the writer, a question `dashboard` already shows, as a card or a series, may stay. A question the user can't
  read is left to the ops compiler, which reports it as unknown."
  [dashboard ops]
  (when-let [card-ids (seq (placed-card-ids ops))]
    (when-let [foreign (seq (filter #(and (not= (:dashboard_id %) (:id dashboard))
                                          (mi/can-read? %))
                                    (metabot.db/dashboard-questions (vec card-ids))))]
      (let [shown   (into #{}
                          (mapcat (fn [{:keys [card_id series]}] (cons card_id (map :id series))))
                          (some-> dashboard (t2/hydrate [:dashcards :series]) :dashcards))
            refused (into []
                          (comp (remove (comp shown :id))
                                (map (fn [{:keys [id dashboard_id]}] {:card-id id, :dashboard-id dashboard_id})))
                          (sort-by :id foreign))]
        (when (seq refused)
          (cards-in-other-dashboards! {:cards refused}))))))

;;; --------------------------------------------------- Charts -----------------------------------------------------

(defn- requested-charts
  "The charts the ops name, in order, each `{:chart-id :name :dataset_query :display}`.
  Each must be one [[save-entity/savable-chart]] accepts. A chart that several ops name takes the name from the first."
  [ops]
  (->> ops
       (filter :chart_id)
       (m/distinct-by :chart_id)
       (mapv (fn [{:keys [chart_id] :as op}]
               (assoc (save-entity/savable-chart chart_id) :chart-id chart_id :name (:name op))))))

(defn- comparable-query
  "A value equal for two forms of the same query, such as a chart's legacy query and the question saved from it."
  [query]
  ;; The results cache's key: its canonical form drops uuids and names each aggregation ref by index, in every stage.
  (vec (lib-be/query-hash query)))

(defn- reusable-card-id
  "The id of a question of the dashboard with `dashboard-id` that was saved from `chart-id` in the conversation with
  `conversation-id`, and holds `dataset-query` shown as `display`, or nil."
  [conversation-id chart-id dashboard-id dataset-query display]
  ;; The viewing context names a chart after the saved question the user is viewing, so the same chart id can hold
  ;; an edited query or display on a later turn. Matching both keeps that edit from being dropped for the old question.
  (let [wanted (comparable-query dataset-query)]
    (some (fn [{:keys [id dataset_query] :as card}]
            (when (and (= (keyword display) (keyword (:display card)))
                       (= wanted (comparable-query dataset_query)))
              id))
          (metabot.db/conversation-dashboard-questions conversation-id chart-id dashboard-id))))

(defn- save-chart!
  "Saves `chart` as a question of the dashboard with `dashboard-id`, and returns `{:chart-id :card-id :card}`.
  A question already saved from the chart, with the same query and display, to this dashboard in this conversation is
  reused, without a `:card`."
  [dashboard-id {:keys [chart-id name dataset_query display]}]
  (let [conversation-id (shared/current-conversation-id)]
    (if-let [card-id (some-> conversation-id
                             (reusable-card-id chart-id dashboard-id dataset_query display))]
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
          ;; A parallel call may have trashed it since the first read.
          _            (some-> current (check-not-trashed! attrs))
          ;; A dashboard question needs its dashboard, so a create with charts saves the dashboard first.
          created      (when (and (nil? current) (seq charts))
                         (dashboard-write/write! {:attrs attrs}))
          target       (or current created)
          saved-charts (mapv (partial save-chart! (:id target)) charts)
          ops          (with-card-ids ops (into {} (map (juxt :chart-id :card-id)) saved-charts))]
      {:before       current
       :dashboard    (dashboard-write/write! (cond-> {:ops ops}
                                               target        (assoc :dashboard target)
                                               (not created) (assoc :attrs attrs)))
       :saved-charts saved-charts})))

(defn- save!
  "Saves the change to `dashboard`, nil on a create, and returns `{:before :dashboard :saved-charts}`.
  The dashboard is reread before it is changed, and `:before` is that reread, nil on a create.
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

(defn- card-shown-fn
  "A predicate on the cards of `dashcards`: whether the result may show a card's id, name and display.
  The user must be able to read it. Under [[shared/curated-only?]] it must also be curated, or saved from a chart of
  this conversation: one in `saved-charts`, or one an earlier call saved. Such a card isn't curated: its id and name
  are shown because this conversation saved them, and a tool that later uses the card judges it again."
  [dashcards saved-charts]
  (if-not (shared/curated-only?)
    mi/can-read?
    (let [card-ids        (into #{} (keep (comp :id :card)) dashcards)
          curated         (if (seq card-ids)
                            (curation/curated-ids (map #(vector "card" %) card-ids))
                            #{})
          charts          (into #{} (map :card-id) saved-charts)
          conversation-id (shared/current-conversation-id)]
      (fn [{card-id :id :as card}]
        (and (mi/can-read? card)
             (or (contains? charts card-id)
                 (and conversation-id (= conversation-id (:metabot_conversation_id card)))
                 (contains? curated ["card" card-id])))))))

(defn- dashcard-xml
  "One dashcard of a saved dashboard. A card that `card-shown?` refuses shows its slot only."
  [card-shown? {:keys [id card row col size_x size_y visualization_settings all_tabs]}]
  (let [readable (when (and card (card-shown? card)) card)]
    (str "<dashcard"
         (xml-attrs :dashcard_id id
                    :all_tabs all_tabs
                    :card_id (:id readable)
                    :name (:name readable)
                    :display (some-> (or (:display readable)
                                         (get-in visualization_settings [:virtual_card :display]))
                                     name)
                    :row row :col col :size_x size_x :size_y size_y)
         "/>")))

(defn- dashboard-lines
  "The lines of the saved dashboard `dash`: its tabs, dashcards with their layout, and filters with the dashcards
  they connect to. The `saved-charts` are the charts this call saved, which [[card-shown-fn]] shows.
  When the dashboard has tabs, a dashcard with no tab is listed before them, marked `all_tabs`, as in the frontend
  and `read_resource`'s items read."
  ;; The `dashcard_id`, `tab_id` and `all_tabs` attributes match `read_resource`'s items read, and the `<filter>`
  ;; element matches its dashboard details read. The layout differs: dashcards nest under their `<tab>`, and a
  ;; question's id is `card_id`, the name the ops take.
  [{:keys [id name description tabs dashcards parameters]} saved-charts]
  (let [by-tab      (group-by :dashboard_tab_id (sort-by (juxt :row :col) dashcards))
        card-shown? (card-shown-fn dashcards saved-charts)
        card-lines  (fn [indent dcs] (for [dc dcs] (str indent (dashcard-xml card-shown? dc))))]
    [(str "  <dashboard" (xml-attrs :id id :name name) ">")
     (when description
       (str "    <description>" (llm-shape/escape-xml-content description) "</description>"))
     (if (seq tabs)
       ;; A dashcard from before the dashboard had tabs has no tab, and the frontend shows it on every tab
       ;; (`getVisibleCards`), so it comes before the tabs, marked `all_tabs`, as in the items read.
       [(card-lines "    " (map #(assoc % :all_tabs true) (get by-tab nil)))
        (for [{tab-id :id tab-name :name} (sort-by :position tabs)]
          [(str "    <tab" (xml-attrs :tab_id tab-id :name tab-name) ">")
           (card-lines "      " (get by-tab tab-id))
           "    </tab>"])]
       (card-lines "    " (get by-tab nil)))
     (for [parameter (entity-details/with-filter-connections parameters dashcards)]
       (str "    " (llm-shape/dashboard-filter->xml parameter)))
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
  "The profiles whose frontend opens the dashboard after a create, edit or restore.
  NLQ Metabot only links it."
  #{:internal :internal-sql})

(defn- result
  "The tool result for the saved `dashboard`."
  [{:keys [id name collection_id] :as dashboard} action saved-charts profile-id]
  ;; Trashing doesn't navigate, so a trashed dashboard the user is viewing stays in view.
  (let [open?       (and (not= "trashed" action) (contains? opening-profiles profile-id))
        link        (str "metabase://dashboard/" id)
        layout?     (contains? #{"created" "updated"} action)
        pushed      (dashboard-ops/pushed-dashcard-ids dashboard)
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
                       (dashboard-lines dashboard saved-charts))
                     "</dashboard_saved>"
                     (case action
                       "trashed"  "Tell the user you moved it to the trash, and that they can restore it from there."
                       "restored" "Tell the user you restored it."
                       "Tell the user what you changed and where the dashboard is saved.")
                     (when (seq pushed)
                       (str (if (next pushed) "Cards " "Card ") (ids-text pushed)
                            " moved down to make room for the cards you placed. Mention it to the user."))
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
                           :open          open?
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
    (let [{:keys [dashboard_id ops] :as args} (cond-> (u/remove-nils args)
                                                (:ops args) (update :ops (partial mapv u/remove-nils)))
          ;; Who may write is checked before anything about the payload.
          dashboard (target-dashboard args)
          attrs     (dashboard-attrs args (nil? dashboard))]
      (when (contains? attrs :collection_id)
        (check-collection-writable! (:collection_id attrs) (nil? dashboard)))
      (check-request! args)
      (check-op-sources! dashboard_id ops)
      (check-cards-curated! ops)
      (check-cards-not-in-other-dashboards! dashboard ops)
      (let [charts (requested-charts ops)
            {saved :dashboard :keys [before saved-charts]}
            (save-entity/do-with-save-rejections
             #(do-with-op-errors dashboard_id (fn [] (save! dashboard attrs ops charts))))]
        (doseq [{:keys [card]} saved-charts
                :when card]
          (save-entity/publish-card-create! card))
        (result saved (action before attrs) saved-charts profile-id)))))

(def write-dashboard-tool
  "Create, edit, trash or restore a dashboard, saving charts from this conversation onto it."
  (->WriteDashboardTool))
