(ns metabase.models.pulse
  "Notifications are ways to deliver the results of Questions to users without going through the normal Metabase UI. At
  the time of this writing, there are two delivery mechanisms for Notifications -- email and Slack notifications;
  these destinations are known as 'Channels'. Notifications themselves are further divided into two categories --
  'Pulses', which are sent at specified intervals, and 'Alerts', which are sent when certain conditions are met (such
  as a query returning results).

  Because 'Pulses' were originally the only type of Notification, this name is still used for the model itself, and in
  some of the functions below. To keep things clear, try to make sure you use the term 'Notification' for things that
  work with either type.

  One more thing to keep in mind: this code is pretty old and doesn't follow the code patterns used in the other
  Metabase models. There is a plethora of CRUD functions for working with Pulses that IMO aren't really needed (e.g.
  functions for fetching a specific Pulse). At some point in the future, we can clean this namespace up and bring the
  code in line with the rest of the codebase, but for the time being, it probably makes sense to follow the existing
  patterns in this namespace rather than further confuse things.

  Legacy note: Currently Pulses are associated with a dashboard, but this is not always the case since there are legacy
  pulses that are a collection of cards, not dashboard."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :as pulse-channel :refer [PulseChannel]]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def Pulse
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/Pulse)

(methodical/defmethod t2/table-name :model/Pulse [_model] :pulse)
(methodical/defmethod t2/model-for-automagic-hydration [:default :pulse]  [_original-model _k] :model/Pulse)

(doto :model/Pulse
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set))

(t2/deftransforms :model/Pulse
  {:parameters mi/transform-json})

(defn- assert-valid-parameters [{:keys [parameters]}]
  (when-not (mc/validate [:maybe
                          [:sequential
                           [:and
                            [:map [:id ms/NonBlankString]]
                            [:map-of :keyword :any]]]]
                         parameters)
    (throw (ex-info (tru ":parameters must be a sequence of maps with String :id keys")
                    {:parameters parameters}))))

(t2/define-before-insert :model/Pulse
  [notification]
  (let [defaults      {:parameters []}
        dashboard-id  (:dashboard_id notification)
        collection-id (if dashboard-id
                        (t2/select-one-fn :collection_id 'Dashboard, :id dashboard-id)
                        (:collection_id notification))
        notification  (->> (for [[k v] notification
                                 :when (some? v)]
                             {k v})
                           (apply merge defaults {:collection_id collection-id}))]
    (u/prog1 notification
      (assert-valid-parameters notification)
      (collection/check-collection-namespace Pulse (:collection_id notification)))))

(def ^:dynamic *allow-moving-dashboard-subscriptions*
  "If true, allows the collection_id on a dashboard subscription to be modified. This should
  only be done when the associated dashboard is being moved to a new collection."
  false)

(t2/define-before-update :model/Pulse
  [notification]
  (let [{:keys [collection_id dashboard_id]} (t2/original notification)]
    (when (and dashboard_id
               (contains? notification :collection_id)
               (not= (:collection_id notification) collection_id)
               (not *allow-moving-dashboard-subscriptions*))
      (throw (ex-info (tru "collection ID of a dashboard subscription cannot be directly modified") notification)))
    (when (and dashboard_id
               (contains? notification :dashboard_id)
               (not= (:dashboard_id notification) dashboard_id))
      (throw (ex-info (tru "dashboard ID of a dashboard subscription cannot be modified") notification))))
  (u/prog1 (t2/changes notification)
    (assert-valid-parameters notification)
    (collection/check-collection-namespace Pulse (:collection_id notification))))

(defn- alert->card
  "Return the Card associated with an Alert, fetching it if needed, for permissions-checking purposes."
  [alert]
  (or
   ;; if `card` is already present as a top-level key we can just use that directly
   (:card alert)
   ;; otherwise fetch the associated `:cards` (if not already fetched) and then pull the first one out, since Alerts
   ;; can only have one Card
   (-> (t2/hydrate alert :cards) :cards first)
   ;; if there's still not a Card, throw an Exception!
   (throw (Exception. (tru "Invalid Alert: Alert does not have a Card associated with it")))))

(defn is-alert?
  "Whether `notification` is an Alert (as opposed to a regular Pulse)."
  [notification]
  (boolean (:alert_condition notification)))

;;; Permissions to read or write an *Alert* are the same as those of its 'parent' *Card*. For all intents and purposes,
;;; an Alert cannot be put into a Collection.
;;;
;;; Permissions to read a *Dashboard Subscription* are more complex. A non-admin can read a Dashboard Subscription if
;;; they have read access to its parent *Collection*, and they are a creator or recipient of the subscription. A
;;; non-admin can write a Dashboard Subscription only if they are its creator. (Admins have full read and write
;;; permissions for all objects.) These checks are handled by the `can-read?` and `can-write?` methods below.

(defmethod mi/perms-objects-set Pulse
  [notification read-or-write]
  (if (is-alert? notification)
    (mi/perms-objects-set (alert->card notification) read-or-write)
    (perms/perms-objects-set-for-parent-collection notification read-or-write)))

(defn- current-user-is-creator?
  [notification]
  (= api/*current-user-id* (:creator_id notification)))

(defn- current-user-is-recipient?
  [notification]
  (let [channels (:channels (t2/hydrate notification [:channels :recipients]))
        recipient-ids (for [{recipients :recipients} channels
                            recipient recipients]
                        (:id recipient))]
    (boolean
     (some #{api/*current-user-id*} recipient-ids))))

(defmethod mi/can-read? Pulse
  [notification]
  (if (is-alert? notification)
   (mi/current-user-has-full-permissions? :read notification)
   (or api/*is-superuser?*
       (or (current-user-is-creator? notification)
           (current-user-is-recipient? notification)))))

;; Non-admins should be able to create subscriptions, and update subscriptions that they created, but not edit anyone
;; else's subscriptions (except for unsubscribing themselves, which uses a custom API).
(defmethod mi/can-write? Pulse
  [notification]
  (if (is-alert? notification)
    (mi/current-user-has-full-permissions? :write notification)
    (or api/*is-superuser?*
        (and (mi/current-user-has-full-permissions? :read notification)
             (current-user-is-creator? notification)))))

(defmethod serdes/hash-fields Pulse
  [_pulse]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def AlertConditions
  "Schema for valid values of `:alert_condition` for Alerts."
  [:enum "rows" "goal"])

(def CardRef
  "Schema for the map we use to internally represent the fact that a Card is in a Notification and the details about its
  presence there."
  (mu/with-api-error-message
    [:map
     [:id                                 ms/PositiveInt]
     [:include_csv                        ms/BooleanValue]
     [:include_xls                        ms/BooleanValue]
     [:dashboard_card_id {:optional true} [:maybe ms/PositiveInt]]]
    (deferred-tru "value must be a map with the keys `{0}`, `{1}`, `{2}`, and `{3}`." "id" "include_csv" "include_xls" "dashboard_card_id")))

(def HybridPulseCard
  "This schema represents the cards that are included in a pulse. This is the data from the `PulseCard` and some
  additional information used by the UI to display it from `Card`. This is a superset of `CardRef` and is coercible to
  a `CardRef`"
  (mu/with-api-error-message
    [:merge CardRef
     [:map
      [:name               [:maybe string?]]
      [:description        [:maybe string?]]
      [:display            [:maybe ms/KeywordOrString]]
      [:collection_id      [:maybe ms/PositiveInt]]
      [:dashboard_id       [:maybe ms/PositiveInt]]
      [:parameter_mappings [:maybe [:sequential ms/Map]]]]]
    (deferred-tru "value must be a map with the following keys `({0})`"
        (str/join ", " ["collection_id" "description" "display" "id" "include_csv" "include_xls" "name"
                        "dashboard_id" "parameter_mappings"]))))

(def CoercibleToCardRef
  "Schema for functions accepting either a `HybridPulseCard` or `CardRef`."
  [:or HybridPulseCard CardRef])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-simple-hydration-method channels
  :channels
  "Return the PulseChannels associated with this `notification`."
  [notification-or-id]
  (t2/select PulseChannel, :pulse_id (u/the-id notification-or-id)))

(def ^:dynamic *allow-hydrate-archived-cards*
  "By default the :cards hydration method only return active cards,
  but in cases we need to send email after a card is archived, we need to be able to hydrate archived card as well."
  false)

(mu/defn ^:private cards* :- [:sequential HybridPulseCard]
  [notification-or-id]
  (t2/select
   :model/Card
   {:select    [:c.id :c.name :c.description :c.collection_id :c.display :pc.include_csv :pc.include_xls
                :pc.dashboard_card_id :dc.dashboard_id [nil :parameter_mappings]] ;; :dc.parameter_mappings - how do you select this?
    :from      [[:pulse :p]]
    :join      [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                [:report_card :c] [:= :c.id :pc.card_id]]
    :left-join [[:report_dashboardcard :dc] [:= :pc.dashboard_card_id :dc.id]]
    :where     [:and
                [:= :p.id (u/the-id notification-or-id)]
                (when-not *allow-hydrate-archived-cards*
                  [:= :c.archived false])]
    :order-by [[:pc.position :asc]]}))

(mi/define-simple-hydration-method cards
  :cards
  "Return the Cards associated with this `notification`."
  [notification-or-id]
  (cards* notification-or-id))

;;; ---------------------------------------- Notification Fetching Helper Fns ----------------------------------------

(mu/defn hydrate-notification :- (mi/InstanceOf Pulse)
  "Hydrate Pulse or Alert with the Fields needed for sending it."
  [notification :- (mi/InstanceOf Pulse)]
  (-> notification
      (t2/hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))

(mu/defn ^:private hydrate-notifications :- [:sequential (mi/InstanceOf Pulse)]
  "Batched-hydrate multiple Pulses or Alerts."
  [notifications :- [:sequential (mi/InstanceOf Pulse)]]
  (as-> notifications <>
    (t2/hydrate <> :creator :cards [:channels :recipients])
    (map #(m/dissoc-in % [:details :emails]) <>)))

(mu/defn ^:private notification->pulse :- (mi/InstanceOf Pulse)
  "Take a generic `Notification`, and put it in the standard Pulse format the frontend expects. This really just
  consists of removing associated `Alert` columns."
  [notification :- (mi/InstanceOf Pulse)]
  (dissoc notification :alert_condition :alert_above_goal :alert_first_only))

;; TODO - do we really need this function? Why can't we just use `t2/select` and `hydrate` like we do for everything
;; else?
(mu/defn retrieve-pulse :- [:maybe (mi/InstanceOf Pulse)]
  "Fetch a single *Pulse*, and hydrate it with a set of 'standard' hydrations; remove Alert columns, since this is a
  *Pulse* and they will all be unset."
  [pulse-or-id]
  (some-> (t2/select-one Pulse :id (u/the-id pulse-or-id), :alert_condition nil)
          hydrate-notification
          notification->pulse))

(mu/defn retrieve-notification :- [:maybe (mi/InstanceOf Pulse)]
  "Fetch an Alert or Pulse, and do the 'standard' hydrations, adding `:channels` with `:recipients`, `:creator`, and
  `:cards`."
  [notification-or-id & additional-conditions]
  {:pre [(even? (count additional-conditions))]}
  (some-> (apply t2/select-one Pulse :id (u/the-id notification-or-id), additional-conditions)
          hydrate-notification))

(mu/defn ^:private notification->alert :- (mi/InstanceOf Pulse)
  "Take a generic `Notification` and put it in the standard `Alert` format the frontend expects. This really just
  consists of collapsing `:cards` into a `:card` key with whatever the first Card is."
  [notification :- (mi/InstanceOf Pulse)]
  (-> notification
      (assoc :card (first (:cards notification)))
      (dissoc :cards)))

(mu/defn retrieve-alert :- [:maybe (mi/InstanceOf Pulse)]
  "Fetch a single Alert by its `id` value, do the standard hydrations, and put it in the standard `Alert` format."
  [alert-or-id]
  (some-> (t2/select-one Pulse, :id (u/the-id alert-or-id), :alert_condition [:not= nil])
          hydrate-notification
          notification->alert))

(defn- query-as [model query]
  (t2/select model query))

(mu/defn retrieve-alerts :- [:sequential (mi/InstanceOf Pulse)]
  "Fetch all Alerts."
  ([]
   (retrieve-alerts nil))

  ([{:keys [archived? user-id]
     :or   {archived? false}}]
   (assert boolean? archived?)
   (let [query (merge {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
                       :from            [[:pulse :p]]
                       :where           [:and
                                         [:not= :p.alert_condition nil]
                                         [:= :p.archived archived?]
                                         (when user-id
                                           [:or
                                            [:= :p.creator_id user-id]
                                            [:= :pcr.user_id user-id]])]
                       :order-by        [[:lower-name :asc]]}
                      (when user-id
                        {:left-join [[:pulse_channel :pchan] [:= :p.id :pchan.pulse_id]
                                     [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]}))]
     (for [alert (hydrate-notifications (query-as Pulse query))
           :let  [alert (notification->alert alert)]
           ;; if for whatever reason the Alert doesn't have a Card associated with it (e.g. the Card was deleted) don't
           ;; return the Alert -- it's basically orphaned/invalid at this point. See #13575 -- we *should* be deleting
           ;; Alerts if their associated PulseCard is deleted, but that's not currently the case.
           :when (:card alert)]
       alert))))

(mu/defn retrieve-pulses :- [:sequential (mi/InstanceOf Pulse)]
  "Fetch all `Pulses`. When `user-id` is included, only fetches `Pulses` for which the provided user is the creator
  or a recipient."
  [{:keys [archived? dashboard-id user-id]
    :or   {archived? false}}]
  (let [query {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
               :from            [[:pulse :p]]
               :left-join       (concat
                                 [[:report_dashboard :d] [:= :p.dashboard_id :d.id]]
                                 (when user-id
                                   [[:pulse_channel :pchan]         [:= :p.id :pchan.pulse_id]
                                    [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]))
               :where           [:and
                                 [:= :p.alert_condition nil]
                                 [:= :p.archived archived?]
                                 ;; Only return dashboard subscriptions for non-archived dashboards
                                 [:or
                                  [:= :p.dashboard_id nil]
                                  [:= :d.archived false]]
                                 (when dashboard-id
                                   [:= :p.dashboard_id dashboard-id])
                                 ;; Only return dashboard subscriptions when `user-id` is passed, so that legacy
                                 ;; pulses don't show up in the notification management page
                                 (when user-id
                                   [:and
                                    [:not= :p.dashboard_id nil]
                                    [:or
                                     [:= :p.creator_id user-id]
                                     [:= :pcr.user_id user-id]]])]
               :order-by        [[:lower-name :asc]]}]
    (for [pulse (query-as Pulse query)]
      (-> pulse
          (dissoc :lower-name)
          hydrate-notification
          notification->pulse))))

(defn retrieve-user-alerts-for-card
  "Find all alerts for `card-id` that `user-id` is set to receive"
  [{:keys [archived? card-id user-id]
    :or   {archived? false}}]
  (assert boolean? archived?)
  (map (comp notification->alert hydrate-notification)
       (query-as Pulse
                 {:select [:p.*]
                  :from   [[:pulse :p]]
                  :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                           [:pulse_channel :pchan] [:= :pchan.pulse_id :p.id]
                           [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]
                  :where  [:and
                           [:not= :p.alert_condition nil]
                           [:= :pc.card_id card-id]
                           [:= :pcr.user_id user-id]
                           [:= :p.archived archived?]]})))

(defn retrieve-alerts-for-cards
  "Find all alerts for `card-ids`, used for admin users"
  [{:keys [archived? card-ids]
    :or   {archived? false}}]
  (when (seq card-ids)
    (map (comp notification->alert hydrate-notification)
         (query-as Pulse
                   {:select [:p.*]
                    :from   [[:pulse :p]]
                    :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                    :where  [:and
                             [:not= :p.alert_condition nil]
                             [:in :pc.card_id card-ids]
                             [:= :p.archived archived?]]}))))

(mu/defn card->ref :- CardRef
  "Create a card reference from a card or id"
  [card :- :map]
  {:id                (u/the-id card)
   :include_csv       (get card :include_csv false)
   :include_xls       (get card :include_xls false)
   :dashboard_card_id (get card :dashboard_card_id nil)})


;;; ------------------------------------------ Other Persistence Functions -------------------------------------------

(mu/defn update-notification-cards!
  "Update the PulseCards for a given `notification-or-id`. `card-refs` should be a definitive collection of *all* Cards
  for the Notification in the desired order. They should have keys like `id`, `include_csv`, and `include_xls`.

  *  If a Card ID in `card-refs` has no corresponding existing `PulseCard` object, one will be created.
  *  If an existing `PulseCard` has no corresponding ID in CARD-IDs, it will be deleted.
  *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  [notification-or-id card-refs :- [:maybe [:sequential CardRef]]]
  ;; first off, just delete any cards associated with this pulse (we add them again below)
  (t2/delete! PulseCard :pulse_id (u/the-id notification-or-id))
  ;; now just insert all of the cards that were given to us
  (when (seq card-refs)
    (let [cards (map-indexed (fn [i {card-id :id :keys [include_csv include_xls dashboard_card_id]}]
                               {:pulse_id          (u/the-id notification-or-id)
                                :card_id           card-id
                                :position          i
                                :include_csv       include_csv
                                :include_xls       include_xls
                                :dashboard_card_id dashboard_card_id})
                             card-refs)]
      (t2/insert! PulseCard cards))))

(defn- create-update-delete-channel!
  "Utility function used by [[update-notification-channels!]] which determines how to properly update a single pulse
  channel."
  [notification-or-id new-channel existing-channel]
  ;; NOTE that we force the :id of the channel being updated to the :id we *know* from our
  ;;      existing list of PulseChannels pulled from the db to ensure we affect the right record
  (let [channel (when new-channel
                  (assoc new-channel
                         :pulse_id       (u/the-id notification-or-id)
                         :id             (:id existing-channel)
                         :enabled        (:enabled new-channel)
                         :channel_type   (keyword (:channel_type new-channel))
                         :schedule_type  (keyword (:schedule_type new-channel))
                         :schedule_frame (keyword (:schedule_frame new-channel))))]
    (cond
      ;; 1. in channels, NOT in db-channels = CREATE
      (and channel (not existing-channel))  (pulse-channel/create-pulse-channel! channel)
      ;; 2. NOT in channels, in db-channels = DELETE
      (and (nil? channel) existing-channel) (t2/delete! PulseChannel :id (:id existing-channel))
      ;; 3. in channels, in db-channels = UPDATE
      (and channel existing-channel)        (pulse-channel/update-pulse-channel! channel)
      ;; 4. NOT in channels, NOT in db-channels = NO-OP
      :else                                 nil)))

(mu/defn update-notification-channels!
  "Update the PulseChannels for a given `notification-or-id`. `channels` should be a definitive collection of *all* of
  the channels for the Notification.

   * If a channel in the list has no existing `PulseChannel` object, one will be created.

   * If an existing `PulseChannel` has no corresponding entry in `channels`, it will be deleted.

   * All previously existing channels will be updated with their most recent information."
  [notification-or-id channels :- [:sequential :map]]
  (let [new-channels   (group-by (comp keyword :channel_type) channels)
        old-channels   (group-by (comp keyword :channel_type) (t2/select PulseChannel
                                                                :pulse_id (u/the-id notification-or-id)))
        handle-channel #(create-update-delete-channel! (u/the-id notification-or-id)
                                                       (first (get new-channels %))
                                                       (first (get old-channels %)))]
    (assert (zero? (count (get new-channels nil)))
      "Cannot have channels without a :channel_type attribute")
    ;; don't automatically archive this Pulse if we end up deleting its last PulseChannel -- we're probably replacing
    ;; it with a new one immediately thereafter.
    (binding [pulse-channel/*archive-parent-pulse-when-last-channel-is-deleted* false]
      ;; for each of our possible channel types call our handler function
      (doseq [[channel-type] pulse-channel/channel-types]
        (handle-channel channel-type)))))

(mu/defn ^:private create-notification-and-add-cards-and-channels!
  "Create a new Pulse/Alert with the properties specified in `notification`; add the `card-refs` to the Notification and
  add the Notification to `channels`. Returns the `id` of the newly created Notification."
  [notification card-refs :- [:maybe [:sequential CardRef]] channels]
  (t2/with-transaction [_conn]
    (let [notification (first (t2/insert-returning-instances! Pulse notification))]
      (update-notification-cards! notification card-refs)
      (update-notification-channels! notification channels)
      (u/the-id notification))))

(mu/defn create-pulse!
  "Create a new Pulse by inserting it into the database along with all associated pieces of data such as:
  PulseCards, PulseChannels, and PulseChannelRecipients.

  Returns the newly created Pulse, or throws an Exception."
  {:style/indent 2}
  [cards    :- [:sequential [:map-of :keyword :any]]
   channels :- [:sequential [:map-of :keyword :any]]
   kvs      :- [:map
                [:name                                 ms/NonBlankString]
                [:creator_id                           ms/PositiveInt]
                [:skip_if_empty       {:optional true} [:maybe :boolean]]
                [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
                [:parameters          {:optional true} [:maybe [:sequential :map]]]]]
  (let [pulse-id (create-notification-and-add-cards-and-channels! kvs cards channels)]
    ;; return the full Pulse (and record our create event).
    (u/prog1 (retrieve-pulse pulse-id)
      (events/publish-event! :event/subscription-create {:object <>
                                                         :user-id api/*current-user-id*}))))

(defn create-alert!
  "Creates a pulse with the correct fields specified for an alert"
  [alert creator-id card-id channels]
  (let [id (-> alert
               (assoc :skip_if_empty true, :creator_id creator-id)
               (create-notification-and-add-cards-and-channels! [card-id] channels))]
    ;; return the full Pulse (and record our create event)
    (retrieve-alert id)))

(mu/defn ^:private notification-or-id->existing-card-refs :- [:sequential CardRef]
  [notification-or-id]
  (t2/select [PulseCard [:card_id :id] :include_csv :include_xls :dashboard_card_id]
    :pulse_id (u/the-id notification-or-id)
    {:order-by [[:position :asc]]}))

(mu/defn ^:private card-refs-have-changed? :- :boolean
  [notification-or-id new-card-refs :- [:sequential CardRef]]
  (not= (notification-or-id->existing-card-refs notification-or-id)
        new-card-refs))

(mu/defn ^:private update-notification-cards-if-changed! [notification-or-id new-card-refs]
  (when (card-refs-have-changed? notification-or-id new-card-refs)
    (update-notification-cards! notification-or-id new-card-refs)))

(mu/defn update-notification!
  "Update the supplied keys in a `notification`."
  [notification :- [:map
                    [:id                    ms/PositiveInt]
                    [:name                {:optional true} ms/NonBlankString]
                    [:alert_condition     {:optional true} AlertConditions]
                    [:alert_above_goal    {:optional true} boolean?]
                    [:alert_first_only    {:optional true} boolean?]
                    [:skip_if_empty       {:optional true} boolean?]
                    [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                    [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                    [:cards               {:optional true} [:sequential CoercibleToCardRef]]
                    [:channels            {:optional true} [:sequential :map]]
                    [:archived            {:optional true} boolean?]
                    [:parameters          {:optional true} [:maybe [:sequential :map]]]]]
  (t2/update! Pulse (u/the-id notification)
    (u/select-keys-when notification
      :present [:collection_id :collection_position :archived]
      :non-nil [:name :alert_condition :alert_above_goal :alert_first_only :skip_if_empty :parameters]))
  ;; update Cards if the 'refs' have changed
  (when (contains? notification :cards)
    (update-notification-cards-if-changed! notification (map card->ref (:cards notification))))
  ;; update channels as needed
  (when (contains? notification :channels)
    (update-notification-channels! notification (:channels notification))))

(defn update-pulse!
  "Update an existing Pulse, including all associated data such as: PulseCards, PulseChannels, and
  PulseChannelRecipients.

  Returns the updated Pulse or throws an Exception."
  [pulse]
  (update-notification! pulse)
  ;; fetch the fully updated pulse, log an update event, and return it
  (u/prog1 (retrieve-pulse (u/the-id pulse))
    (events/publish-event! :event/subscription-update {:object <> :user-id api/*current-user-id*})))

(defn- alert->notification
  "Convert an 'Alert` back into the generic 'Notification' format."
  [{:keys [card cards], :as alert}]
  (let [card  (or card (first cards))
        cards (when card [(card->ref card)])]
    (cond-> (-> (assoc alert :skip_if_empty true)
                (dissoc :card))
      (seq cards) (assoc :cards cards))))

;; TODO - why do we make sure to strictly validate everything when we create a PULSE but not when we create an ALERT?
(defn update-alert!
  "Updates the given `alert` and returns it"
  [alert]
  (update-notification! (alert->notification alert))
  ;; fetch the fully updated pulse, log an update event, and return it
  (u/prog1 (retrieve-alert (u/the-id alert))
    (events/publish-event! :event/alert-update {:object <> :user-id api/*current-user-id*})))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/extract-one "Pulse"
  [_model-name _opts pulse]
  (cond-> (serdes/extract-one-basics "Pulse" pulse)
    (:collection_id pulse) (update :collection_id serdes/*export-fk* 'Collection)
    (:dashboard_id  pulse) (update :dashboard_id  serdes/*export-fk* 'Dashboard)
    true                   (update :creator_id    serdes/*export-user*)))

(defmethod serdes/load-xform "Pulse" [pulse]
  (cond-> (serdes/load-xform-basics pulse)
      true                   (update :creator_id    serdes/*import-user*)
      (:collection_id pulse) (update :collection_id serdes/*import-fk* 'Collection)
      (:dashboard_id  pulse) (update :dashboard_id  serdes/*import-fk* 'Dashboard)))

(defmethod serdes/dependencies "Pulse" [{:keys [collection_id dashboard_id]}]
  (filterv some? [(when collection_id [{:model "Collection" :id collection_id}])
                  (when dashboard_id  [{:model "Dashboard"  :id dashboard_id}])]))
