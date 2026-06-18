(ns metabase.dashboards-rest.copy
  "Dashboard copy logic, factored as a biff.fx-inspired effects orchestrator.

  The pure decision functions (`cards-to-copy`, `update-cards-for-copy`, ...) take data and return data with
  no IO. The orchestrator [[copy-dashboard!]] is *linear* and takes its write effects as an injected `fx` map
  so it can be unit-tested with in-memory stubs (no DB). Tail effects that must run *after* the transaction
  (events, analytics) are returned as data in `:effects` and executed by [[run-effects!]].

  See [[metabase.dashboards-rest.api]] for the endpoint that wires this to a real transaction + `default-fx`."
  (:require
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ pure decisions ------------------------------------------------

(mu/defn cards-to-copy :- [:map
                           [:discard [:sequential :any]]
                           [:copy [:map-of ms/PositiveInt :any]]
                           [:reference [:map-of ms/PositiveInt :any]]]
  "Returns a map of which cards we need to copy, which cards we need to reference, and which are not to be copied. The
  `:copy` and `:reference` keys are maps from id to card. The `:discard` key is a vector of cards which were not
  copied due to permissions.

  If we're making a deep copy, we copy all cards that we have necessary permissions on. Otherwise, we copy Dashboard
  Questions (questions stored 'in' the dashboard rather than a collection) and reference the rest (assuming
  permissions)."
  [deep-copy? :- ms/MaybeBooleanValue
   dashcards :- [:sequential :any]]
  (let [card->cards (fn [{:keys [card series]}] (into [card] series))
        readable? (fn [card] (and (mi/model card) (mi/can-read? card)))
        card->decision (fn [parent-card card]
                         (cond
                           (or
                            (not (readable? parent-card))
                            (not (readable? card))
                            (:archived card))
                           :discard

                           (or (:dashboard_id card)
                               (and deep-copy? (not= :model (:type card))))
                           :copy

                           :else :reference))
        split-cards (fn [{:keys [card] :as db-card}]
                      (let [cards (card->cards db-card)]
                        (group-by (partial card->decision card) cards)))]
    (reduce (fn [acc db-card]
              (let [{:keys [discard copy reference]} (split-cards db-card)]
                (-> acc
                    (update :reference merge (m/index-by :id reference))
                    (update :copy merge (m/index-by :id copy))
                    (update :discard concat discard))))
            {:reference {}
             :copy {}
             :discard []}
            (filter :card_id dashcards))))

(defn card-copy-specs
  "Pure: given the cards we decided to `:copy`, return a seq of `[old-card-id card-data]` pairs describing the cards to
  create (correct collection, renamed if copying within the same collection, re-parented if a Dashboard Question). The
  actual create is performed by the `fx` `:create-card!` handler — this just computes *what* to create."
  [copy new-dashboard-id same-collection? dest-coll-id]
  (for [[id to-copy] copy]
    [id (cond-> to-copy
          true                    (assoc :collection_id dest-coll-id)
          same-collection?        (update :name #(str % " - " (tru "Duplicate")))
          (:dashboard_id to-copy) (assoc :dashboard_id new-dashboard-id))]))

(defn tab-copy-specs
  "Pure: strip db-managed keys off each existing tab and re-parent it to `new-dashboard-id`, ready for insert."
  [new-dashboard-id existing-tabs]
  (for [tab existing-tabs]
    (-> tab
        (assoc :dashboard_id new-dashboard-id)
        (dissoc :id :entity_id :created_at :updated_at))))

(defn- update-colvalmap-setting
  "Visualizer dashcards have unique visualization settings which embed column id remapping metadata
  This function iterates through the `:columnValueMapping` viz setting and updates referenced card ids

  col->val-source can look like:
  {:COLUMN_2 [{:sourceId 'card:<OLD_CARD_ID>', :originalName 'sum', :name 'COLUMN_2'}], ...}"
  [col->val-source id->new-card]
  (let [update-cvm-item (fn [item]
                          (if-let [source-id (:sourceId item)]
                            (if-let [[_ card-id] (and (string? source-id)
                                                      (re-find #"^card:(\d+)$" source-id))]
                              (if-let [new-card (get id->new-card (Long/parseLong card-id))]
                                (assoc item :sourceId (str "card:" (:id new-card)))
                                item)
                              item)
                            item))
        update-cvm      (fn [cvm]
                          (when (map? cvm)
                            (update-vals cvm #(mapv update-cvm-item %))))]
    (update-cvm col->val-source)))

(defn update-cards-for-copy
  "Update dashcards in a dashboard for copying.
  If the dashboard has tabs, fix up the tab ids in dashcards to point to the new tabs.
  Then if shallow copy, return the cards. If deep copy, replace ids with id from the newly-copied cards.
  If there is no new id, it means user lacked curate permissions for the cards
  collections and it is omitted."
  [dashcards id->new-card id->referenced-card id->new-tab-id]
  (let [dashcards (if (seq id->new-tab-id)
                    (map #(assoc % :dashboard_tab_id (id->new-tab-id (:dashboard_tab_id %)))
                         dashcards)
                    dashcards)]
    (keep (fn [dashboard-card]
            (cond
              (:action_id dashboard-card)
              nil

              (some-> dashboard-card :visualization_settings :virtual_card :display #{"iframe"})
              dashboard-card

              ;; text cards need no manipulation
              (some-> dashboard-card :visualization_settings :virtual_card :display #{"text" "heading"})
              dashboard-card

              ;; referenced cards need no manipulation
              (get id->referenced-card (:card_id dashboard-card))
              dashboard-card

              ;; if we didn't duplicate, it doesn't go in the dashboard
              (not (get id->new-card (:card_id dashboard-card)))
              nil

              :else
              (let [new-id (fn [id]
                             (-> id id->new-card :id))]
                (-> dashboard-card
                    (update :card_id new-id)
                    (assoc :card (-> dashboard-card :card_id id->new-card))
                    (m/update-existing :parameter_mappings
                                       (fn [pms]
                                         (keep (fn [pm]
                                                 (m/update-existing pm :card_id new-id))
                                               pms)))
                    (m/update-existing :series
                                       (fn [series]
                                         (keep (fn [card]
                                                 (when-let [id' (new-id (:id card))]
                                                   (assoc card :id id')))
                                               series)))
                    (m/update-existing-in [:visualization_settings :visualization :columnValuesMapping]
                                          update-colvalmap-setting id->new-card)))))
          dashcards)))

(defn dashboard-data
  "Pure: build the row to insert for the copied dashboard, merging request overrides over the original's values."
  [{:keys [name description collection_id collection_position]} existing-dashboard creator-id]
  {:name                (or name (:name existing-dashboard))
   :description         (or description (:description existing-dashboard))
   :parameters          (or (:parameters existing-dashboard) [])
   :creator_id          creator-id
   :collection_id       collection_id
   :collection_position collection_position
   :width               (:width existing-dashboard)})

;;; -------------------------------------------------- effects -----------------------------------------------------

(def default-fx
  "Real write-effect handlers for [[copy-dashboard!]]. Tests pass an alternate map of stubs.

  Each handler performs one DB write and returns the value the orchestrator threads forward:
    :reconcile-position! -> nil  (side effect: shift sibling collection_position)
    :insert-dashboard!   -> the inserted dashboard instance
    :create-card!        -> the created card instance (delay-event?=true: event fired post-tx)
    :insert-tabs!        -> seq of new tab pks (ordered to match input)
    :add-dashcards!      -> truthy on success
    :check-remote-sync!  -> nil  (side effect: throws if dest forbids the deps)"
  {:reconcile-position! (fn [dashboard-data] (api/maybe-reconcile-collection-position! dashboard-data))
   :insert-dashboard!   (fn [dashboard-data] (first (t2/insert-returning-instances! :model/Dashboard dashboard-data)))
   :create-card!        (fn [card-data] (queries/create-card! card-data @api/*current-user* true false))
   :insert-tabs!        (fn [tab-specs] (t2/insert-returning-pks! :model/DashboardTab tab-specs))
   :add-dashcards!      (fn [dashboard dashcards] ((requiring-resolve 'metabase.dashboards.models.dashboard/add-dashcards!) dashboard dashcards))
   :check-remote-sync!  (fn [existing-dashboard new-coll-id new-dashboard]
                          (let [collections (requiring-resolve 'metabase.collections.core/moving-into-remote-synced?)
                                check       (requiring-resolve 'metabase.collections.core/check-non-remote-synced-dependencies)]
                            (when (collections (:collection_id existing-dashboard) new-coll-id)
                              (check new-dashboard))))})

(defn run-effects!
  "Execute the tail `:effects` data returned by [[copy-dashboard!]]. These run *after* the transaction so newly
  created rows are visible from other threads (events) — mirroring the prior inline behaviour."
  [effects]
  (doseq [[k & args] effects]
    (case k
      :event     (apply events/publish-event! args)
      :analytics (apply analytics/track-event! args))))

;;; ----------------------------------------------- orchestrator ---------------------------------------------------

(defn copy-dashboard!
  "Linear orchestrator for copying a dashboard. Performs its write effects through the injected `fx` map (default
  [[default-fx]]) so it can be exercised with in-memory stubs and no database.

  `ctx` keys:
    :request            - the request body map (:name :description :collection_id :collection_position :is_deep_copy)
    :existing-dashboard - the fully-hydrated source dashboard (with :dashcards and :tabs)
    :creator-id         - id of the user performing the copy

  Returns `{:dashboard <copied dashboard, with :uncopied attached if any cards were dropped>
            :effects   <vector of [:event ...] / [:analytics ...] tuples to run after the tx>}`.

  The data-dependency chain (insert dashboard -> its id -> copy cards keyed by new id -> build dashcards) lives in
  ordinary `let` bindings — no state machine. The caller wraps this in a transaction and calls [[run-effects!]]."
  [{:keys [request existing-dashboard creator-id]} fx]
  (let [{:keys [collection_id is_deep_copy]} request
        new-row          (dashboard-data request existing-dashboard creator-id)
        same-collection? (= (:collection_id existing-dashboard) collection_id)
        ;; Adding a new dashboard at collection_position could shift siblings; fix up first.
        _                ((:reconcile-position! fx) new-row)
        dash             ((:insert-dashboard! fx) new-row)
        ;; decide (pure) which cards to copy/reference/discard, then create the copies (effect, feedback: new ids)
        {:keys [copy reference discard]} (cards-to-copy is_deep_copy (:dashcards existing-dashboard))
        id->new-card     (into {} (for [[old-id card-data] (card-copy-specs copy (u/the-id dash) same-collection? collection_id)]
                                    [old-id ((:create-card! fx) card-data)]))
        new-cards        (vals id->new-card)
        ;; tabs: pure spec -> insert -> zip old->new ids (feedback used when rewriting dashcards)
        existing-tabs    (seq (:tabs existing-dashboard))
        id->new-tab-id   (when existing-tabs
                           (zipmap (map :id existing-tabs)
                                   ((:insert-tabs! fx) (tab-copy-specs (:id dash) existing-tabs))))
        ;; pure: rewrite dashcards to point at the new cards/tabs, then insert them
        dashcards        (seq (update-cards-for-copy (:dashcards existing-dashboard) id->new-card reference id->new-tab-id))
        _                (when dashcards
                           (api/check-500 ((:add-dashcards! fx) dash dashcards)))
        dashboard        (cond-> dash (seq discard) (assoc :uncopied discard))]
    ((:check-remote-sync! fx) existing-dashboard collection_id dashboard)
    {:dashboard dashboard
     :effects   (-> [[:analytics :snowplow/dashboard {:event :dashboard-created :dashboard-id (u/the-id dashboard)}]]
                    (into (for [card new-cards]
                            [:event :event/card-create {:object card :user-id creator-id}]))
                    (conj [:event :event/dashboard-create {:object dashboard :user-id creator-id}]))}))
