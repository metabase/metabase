(ns metabase.pulse.models.pulse
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
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.pulse.audit :as pulse.audit]
   [metabase.pulse.collection-items :as pulse.collection-items]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------- Setup ----------------------------------------------------------

(methodical/defmethod t2/table-name :model/Pulse [_model] :pulse)
(methodical/defmethod t2/model-for-automagic-hydration [:default :pulse]  [_original-model _k] :model/Pulse)

(doto :model/Pulse
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(def ^:private transform-pulse-parameters
  "Toucan 2 transform for a Pulse's `:parameters`, normalized like a Dashboard's but with each `:type` optional."
  {:in  (comp mi/json-in #(lib/normalize ::parameters.schema/parameters-with-optional-types %))
   :out (comp (mi/catch-normalization-exceptions #(lib/normalize ::parameters.schema/parameters-with-optional-types %))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/Pulse
  {:parameters transform-pulse-parameters})

;;; ------------------------------------------------------- Hooks ----------------------------------------------------------

(defn- check-dashboard-subscription
  "Throws a 400 when `pulse`, as an update leaves it beside its stored columns, is a dashboard subscription with a
  column of an alert or a collection position."
  [{:keys [dashboard_id collection_position alert_condition alert_first_only alert_above_goal]}]
  (when (and dashboard_id (some some? [alert_condition alert_first_only alert_above_goal]))
    (throw (ex-info (tru "A dashboard subscription cannot have the columns of an alert.")
                    {:status-code 400})))
  (when (and dashboard_id (some? collection_position))
    (throw (ex-info (tru "A dashboard subscription cannot have a collection position.")
                    {:status-code 400}))))

(defn- new-pulse
  "`pulse`, a row an INSERT writes, without its nil columns, with the defaults of a Pulse, and filed in the Collection
  of its Dashboard when it is a dashboard subscription."
  [{:keys [dashboard_id] :as pulse}]
  (merge {:parameters []}
         (into {} (filter (comp some? val)) pulse)
         {:collection_id (if dashboard_id
                           (pulse.db/dashboard-collection-id dashboard_id)
                           (:collection_id pulse))}))

(t2/define-before-insert :model/Pulse
  [pulse]
  (u/prog1 (new-pulse pulse)
    (check-dashboard-subscription <>)
    (collection/check-collection-for :model/Pulse <>)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *allow-moving-dashboard-subscriptions*
  "If true, allows the collection_id on a dashboard subscription to be modified. This should
  only be done when the associated dashboard is being moved to a new collection."
  false)

(t2/define-before-update :model/Pulse
  [pulse]
  (let [changes (t2/changes pulse)
        {original-dashboard-id :dashboard_id} (t2/original pulse)]
    (when (and original-dashboard-id (contains? changes :dashboard_id))
      (throw (ex-info (tru "dashboard ID of a dashboard subscription cannot be modified") {:status-code 400})))
    (when (and original-dashboard-id (contains? changes :collection_id) (not *allow-moving-dashboard-subscriptions*))
      (throw (ex-info (tru "collection ID of a dashboard subscription cannot be directly modified") {:status-code 400})))
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/Pulse pulse))
    (when (some #(contains? changes %) [:dashboard_id :collection_position :alert_condition :alert_first_only :alert_above_goal])
      (check-dashboard-subscription pulse))
    (when (contains? changes :archived)
      (pulse.db/set-pulse-channels-enabled! (u/the-id pulse) (not (:archived changes))))
    (cond-> pulse
      (contains? changes :archived) (assoc :archived_directly (mi/archived-directly pulse #(collection/archived? (:collection_id pulse)))))))

(t2/define-before-delete :model/Pulse
  [pulse]
  ;; to trigger deleting the scheduled jobs
  (pulse.db/delete-pulse-channels-for-pulse! (u/the-id pulse)))

;;; ---------------------------------------------------- Permissions -----------------------------------------------------

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

(defn- alert-cards
  "A map from the id of each of `alerts` to its Card, the Cards of those without one fetched together."
  [alerts]
  (let [missing (into [] (remove :card) alerts)]
    (into (into {} (keep #(when (:card %) [(:id %) (:card %)])) alerts)
          (map (fn [alert]
                 [(:id alert)
                  (or (first (:cards alert))
                      (throw (Exception. (tru "Invalid Alert: Alert does not have a Card associated with it"))))]))
          (when (seq missing) (t2/hydrate missing :cards)))))

(defn- check-collection-key
  "Throws a 500 unless `owner`, a Pulse or the Card of an Alert, has the `:collection_id` its permission checks read."
  [owner]
  (api/check-500 (contains? owner :collection_id) "No :collection_id is set for the Collection check of a Pulse."))

(defn- collection-ids-permitting
  "The ids among `collection-ids` of the Collections the current user has `permission` on, from one permission query."
  [collection-ids permission]
  (when (seq collection-ids)
    (let [permissions (perms/collection-permissions-for-user (api/current-user-info) (vec (distinct collection-ids))
                                                             {:root-namespace nil})]
      (into #{}
            (filter #(perms/collection-permission-at-least? (get permissions %) permission))
            (keys permissions)))))

(defn- collection-permits?
  "Whether the current user has `permission` on the Collection of `notification`: its Card's for an Alert, its own
  otherwise."
  [notification permission]
  (let [owner (if (is-alert? notification) (get (alert-cards [notification]) (:id notification)) notification)]
    (check-collection-key owner)
    (contains? (collection-ids-permitting [(:collection_id owner)] permission) (:collection_id owner))))

(defn- current-user-is-creator?
  [notification]
  (= api/*current-user-id* (:creator_id notification)))

(defn- recipient-pulse-ids
  "The ids among `pulses` of those the current user is a recipient of, their channels and recipients fetched together."
  [pulses]
  (into #{}
        (comp (filter (fn [pulse]
                        (some (fn [{:keys [recipients]}] (some #(= api/*current-user-id* (:id %)) recipients))
                              (:channels pulse))))
              (map :id))
        (when (seq pulses) (t2/hydrate (vec pulses) [:channels :recipients]))))

(methodical/defmethod t2/batched-hydrate [:model/Pulse :can_read]
  "Whether the current user reads each of `pulses`: an Alert as its Card, a Dashboard Subscription as its creator or
  recipient, answered together."
  [_model _k pulses]
  (let [rows          (remove nil? pulses)
        alerts        (filter is-alert? rows)
        cards         (alert-cards alerts)
        _             (run! check-collection-key (vals cards))
        readable      (collection-ids-permitting (map :collection_id (vals cards)) :read)
        candidates    (when-not api/*is-superuser?*
                        (remove #(or (is-alert? %) (current-user-is-creator? %)) rows))
        recipient-ids (recipient-pulse-ids candidates)]
    (for [pulse pulses]
      (when pulse
        (vary-meta pulse assoc :can_read
                   (boolean
                    (if (is-alert? pulse)
                      (contains? readable (:collection_id (get cards (:id pulse))))
                      (or api/*is-superuser?*
                          (current-user-is-creator? pulse)
                          (contains? recipient-ids (:id pulse))))))))))

;; Non-admins should be able to create subscriptions, and update subscriptions that they created, but not edit anyone
;; else's subscriptions (except for unsubscribing themselves, which uses a custom API).
(methodical/defmethod t2/batched-hydrate [:model/Pulse :can_write]
  "Whether the current user writes each of `pulses`: an Alert as the content of its Card's Collection, a Dashboard
  Subscription as its creator, answered together."
  [_model _k pulses]
  (let [rows          (remove nil? pulses)
        cards         (alert-cards (filter is-alert? rows))
        _             (run! check-collection-key (vals cards))
        writable      (collection/content-writable-collection-ids (map :collection_id (vals cards))
                                                                  {:root-namespace nil, :audit-rules? false})
        subscriptions (when-not api/*is-superuser?* (remove is-alert? rows))
        _             (run! check-collection-key subscriptions)
        readable      (collection-ids-permitting (map :collection_id subscriptions) :read)]
    (for [pulse pulses]
      (when pulse
        (assoc pulse :can_write
               (boolean
                (if (is-alert? pulse)
                  (contains? writable (:collection_id (get cards (:id pulse))))
                  (or api/*is-superuser?*
                      (and (contains? readable (:collection_id pulse))
                           (current-user-is-creator? pulse))))))))))

(defn- email-recipient-keys
  "The set of recipients of the email channel of `pulse`, a Pulse or the changes to one: Users by their `:id`, other
  addresses by their `:email`."
  [pulse]
  (->> (:channels pulse)
       (m/find-first #(= :email (keyword (:channel_type %))))
       :recipients
       (keep (some-fn :id :email))
       set))

(defn- recipient-additions-permitted?
  "Whether the current user may add the recipients that `changes` brings to `pulse`: with advanced permissions, only a
  superuser or a user with the subscription permission may."
  [pulse changes]
  (or (not (premium-features/enable-advanced-permissions?))
      (boolean api/*is-superuser?*)
      (perms/current-user-has-application-permissions? :subscription)
      (empty? (set/difference (email-recipient-keys changes) (email-recipient-keys pulse)))))

(defmethod mi/can-update? :model/Pulse
  [pulse changes]
  (and (mi/can-write? pulse)
       (or (some? (:dashboard_id pulse)) (collection/can-move? pulse changes))
       (recipient-additions-permitted? pulse changes)))

(defn- can-read-attachments?
  "Return true if the card has attachments and those can be read. If it has no attachments, return true"
  [card]
  (if (or (:include_csv card) (:include_xls card))
    (let [level (perms/download-perms-level (or (:dataset_query card) (pulse.db/card-query (:id card))) api/*current-user-id*)]
      (and level (not= level  :no)))
    true))

(defmethod mi/can-create? :model/Pulse
  [_m {cards :cards dashboard-id :dashboard_id collection-id :collection_id}]
  (and
   ;; make sure we are allowed to *read* all the Cards we want to put in this Pulse
   (let [card-ids (into [] (comp (map u/the-id) (distinct)) cards)
         readable (t2/hydrate (pulse.db/cards card-ids) :can_read)]
     (and (= (count readable) (count card-ids))
          (every? mi/can-read? readable)
          (every? can-read-attachments? cards)))
   ;; nil is root, except for a dashboard subscription, which the before-insert hook files with its dashboard
   (cond
     (some? collection-id) (some-> (pulse.db/collection collection-id) (t2/hydrate :can_write) mi/can-write?)
     (some? dashboard-id)  true
     :else                 (mi/can-write? (t2/hydrate collection/root-collection :can_write)))
   ;; prohibit creating dashboard subs if the the user doesn't have at least read access for the dashboard
   (or (nil? dashboard-id) (some-> (pulse.db/dashboard dashboard-id) (t2/hydrate :can_read) mi/can-read?))))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def AlertConditions
  "Schema for valid values of `:alert_condition` for Alerts."
  [:enum "rows" "goal"])

(def CardBase
  "Schema for the map we use to internally represent the base elements of a Card used for Notifications. id is not
  required since the card may be a placeholder."
  (mu/with-api-error-message
   [:map {:closed true}
    [:include_csv                        ms/BooleanValue]
    [:include_xls                        ms/BooleanValue]
    [:format_rows       {:optional true} [:maybe ms/BooleanValue]]
    [:pivot_results     {:optional true} [:maybe ms/BooleanValue]]
    [:dashboard_card_id {:optional true} [:maybe ms/PositiveInt]]]
   (deferred-tru "value must be a map with the keys `{0}`, `{1}`, and `{2}`." "include_csv" "include_xls" "dashboard_card_id")))

(def CardRef
  "Schema for the map we use to internally represent the fact that a Card is in a Notification and the details about its
  presence there."
  (mu/with-api-error-message
   [:merge CardBase
    [:map
     [:id ms/PositiveInt]]]
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
     [:parameter_mappings [:maybe ::parameters.schema/parameter-mappings]]
     [:pulse_id           {:optional true} [:maybe ms/PositiveInt]]]]
   (deferred-tru "value must be a map with the following keys `({0})`"
                 (str/join ", " ["collection_id" "description" "display" "id" "include_csv" "include_xls" "name"
                                 "dashboard_id" "parameter_mappings"]))))

(def CoercibleToCardRef
  "Schema for functions accepting either a `HybridPulseCard`, `CardRef`, or `CardBase`."
  [:or HybridPulseCard CardRef CardBase])

(def ^:private RecipientInput
  "One entry of `PulseChannelInput`'s `:recipients`: either a Metabase User (by `:id`) or a raw email address."
  [:map {:closed true}
   [:id    {:optional true} ms/PositiveInt]
   [:email {:optional true} :string]])

(def PulseChannelInput
  "A PulseChannel as [[update-notification-channels!]]/[[create-pulse!]] accept it: a subset of `::pulse-channel`
  columns (`:id`/`:pulse_id` filled in server-side when absent) plus `:recipients`."
  [:map {:closed true}
   [:id             {:optional true} ms/PositiveInt]
   [:channel_type   {:optional true} [:or :keyword :string]]
   [:channel_id     {:optional true} [:maybe ms/PositiveInt]]
   [:details        {:optional true} ::pulse.schema/pulse-channel.details]
   [:enabled        {:optional true} :boolean]
   [:pulse_id       {:optional true} ::lib.schema.id/pulse]
   [:entity_id      {:optional true} [:maybe :string]]
   [:recipients     {:optional true} [:maybe [:sequential [:or RecipientInput :metabase.users.schema/user]]]]
   [:schedule_type  {:optional true} [:or :keyword :string]]
   [:schedule_day   {:optional true} [:maybe :string]]
   [:schedule_hour  {:optional true} [:maybe :int]]
   [:schedule_frame {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at     {:optional true} ms/TemporalInstant]
   [:updated_at     {:optional true} ms/TemporalInstant]])

(def UpdateNotificationInput
  "What [[update-notification!]] accepts: the keys of a Pulse/Alert to update, all optional except `:id`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:name                {:optional true} ms/NonBlankString]
   [:alert_condition     {:optional true} AlertConditions]
   [:alert_above_goal    {:optional true} boolean?]
   [:alert_first_only    {:optional true} boolean?]
   [:skip_if_empty       {:optional true} boolean?]
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:cards               {:optional true} [:sequential CoercibleToCardRef]]
   [:channels            {:optional true} [:sequential PulseChannelInput]]
   [:archived            {:optional true} boolean?]
   [:parameters          {:optional true} [:maybe [:sequential ::pulse.schema/pulse.parameter]]]])

(def NotificationOrId
  "A Pulse/Alert id, a full Pulse row, or [[update-notification!]]'s own argument map — the shapes
  [[u/the-id]] is called with below."
  [:or ms/PositiveInt ::pulse.schema/pulse UpdateNotificationInput])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :channels]
  [_model k pulses]
  (mi/instances-with-hydrated-data
   pulses k
   #(group-by :pulse_id (pulse.db/pulse-channels-for-pulses (map :id pulses)))
   :id
   {:default []}))

(mu/defn- cards* :- [:sequential HybridPulseCard]
  "The non-archived Cards of the Pulses with `pulse-ids`."
  [pulse-ids :- [:sequential ms/PositiveInt]]
  (pulse.db/pulse-cards-for-pulses pulse-ids))

(methodical/defmethod t2/batched-hydrate [:model/Pulse :cards]
  [_model k pulses]
  (mi/instances-with-hydrated-data
   pulses k
   #(update-vals (group-by :pulse_id (cards* (map :id pulses)))
                 (fn [cards] (map (fn [card] (dissoc card :pulse_id)) cards)))
   :id
   {:default []}))

;;; ---------------------------------------- Notification Fetching Helper Fns ----------------------------------------

(mu/defn hydrate-notification :- (ms/InstanceOf :model/Pulse)
  "Hydrate Pulse or Alert with the Fields needed for sending it."
  [notification :- (ms/InstanceOf :model/Pulse)]
  (-> notification
      (t2/hydrate :creator :cards [:channels :recipients])
      (m/dissoc-in [:details :emails])))

(mu/defn- hydrate-notifications :- [:sequential (ms/InstanceOf :model/Pulse)]
  "Batched-hydrate multiple Pulses or Alerts."
  [notifications :- [:sequential (ms/InstanceOf :model/Pulse)]]
  (as-> notifications <>
    (t2/hydrate <> :creator :cards [:channels :recipients])
    (map #(m/dissoc-in % [:details :emails]) <>)))

(mu/defn- notification->pulse :- (ms/InstanceOf :model/Pulse)
  "Take a generic `Notification`, and put it in the standard Pulse format the frontend expects. This really just
  consists of removing associated `Alert` columns."
  [notification :- (ms/InstanceOf :model/Pulse)]
  (dissoc notification :alert_condition :alert_above_goal :alert_first_only))

;; TODO - do we really need this function? Why can't we just use `t2/select` and `hydrate` like we do for everything
;; else?  (#40016)
(mu/defn retrieve-pulse :- [:maybe (ms/InstanceOf :model/Pulse)]
  "Fetch a single *Pulse*, and hydrate it with a set of 'standard' hydrations; remove Alert columns, since this is a
  *Pulse* and they will all be unset."
  [pulse-or-id :- NotificationOrId]
  (some-> (pulse.db/pulse (u/the-id pulse-or-id))
          hydrate-notification
          notification->pulse))

(mu/defn retrieve-notification :- [:maybe (ms/InstanceOf :model/Pulse)]
  "Fetch an Alert or Pulse, and do the 'standard' hydrations, adding `:channels` with `:recipients`, `:creator`, and
  `:cards`."
  [notification-or-id :- NotificationOrId
   & additional-conditions :- [:* [:or :keyword :boolean :nil]]]
  {:pre [(even? (count additional-conditions))]}
  (let [id   (u/the-id notification-or-id)
        opts (apply hash-map additional-conditions)]
    (some-> (cond
              (contains? opts :alert_condition) (pulse.db/unarchived-non-alert-pulse id)
              (contains? opts :archived)        (pulse.db/unarchived-pulse id)
              :else                             (pulse.db/pulse id))
            hydrate-notification)))

(mu/defn- notification->alert :- (ms/InstanceOf :model/Pulse)
  "Take a generic `Notification` and put it in the standard `Alert` format the frontend expects. This really just
  consists of collapsing `:cards` into a `:card` key with whatever the first Card is."
  [notification :- (ms/InstanceOf :model/Pulse)]
  (-> notification
      (assoc :card (first (:cards notification)))
      (dissoc :cards)
      ;; TODO (Kelvin 2025-12-19) Remove this once we support alerts on modular embedding,
      ;; as we only currently have `disable_links` column on Subscriptions.
      (dissoc :disable_links)
      (dissoc :archived_directly)))

(mu/defn retrieve-alert :- [:maybe (ms/InstanceOf :model/Pulse)]
  "Fetch a single Alert by its `id` value, do the standard hydrations, and put it in the standard `Alert` format."
  [alert-or-id :- NotificationOrId]
  (some-> (pulse.db/alert (u/the-id alert-or-id))
          hydrate-notification
          notification->alert))

(def ^:private RetrieveAlertsOpts
  [:map {:closed true}
   [:archived? {:optional true} [:maybe :boolean]]
   [:user-id   {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn retrieve-alerts :- [:sequential (ms/InstanceOf :model/Pulse)]
  "Fetch all Alerts."
  ([]
   (retrieve-alerts nil))

  ([{:keys [archived? user-id]
     :or   {archived? false}} :- [:maybe RetrieveAlertsOpts]]
   (assert boolean? archived?)
   (for [alert (hydrate-notifications (pulse.db/alerts archived? user-id))
         :let  [alert (notification->alert alert)]
         ;; if for whatever reason the Alert doesn't have a Card associated with it (e.g. the Card was deleted) don't
         ;; return the Alert -- it's basically orphaned/invalid at this point. See #13575 -- we *should* be deleting
         ;; Alerts if their associated PulseCard is deleted, but that's not currently the case.
         :when (:card alert)]
     alert)))

(def ^:private RetrievePulsesOpts
  [:map {:closed true}
   [:archived?    {:optional true} [:maybe :boolean]]
   [:dashboard-id {:optional true} [:maybe ms/PositiveInt]]
   [:user-id      {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn retrieve-pulses :- [:sequential (ms/InstanceOf :model/Pulse)]
  "Fetch all `Pulses`. When `user-id` is included, only fetches `Pulses` for which the provided user is the creator
  or a recipient."
  [{:keys [archived? dashboard-id user-id]
    :or   {archived? false}} :- RetrievePulsesOpts]
  (for [pulse (pulse.db/pulses archived? dashboard-id user-id)]
    (-> pulse
        (dissoc :lower-name)
        hydrate-notification
        notification->pulse)))

(defn- tenant-scoped-caller?
  "True when the current user's recipient visibility is narrowed to their own tenant: every non-superuser
  sees only recipients with the same `:tenant_id` as themselves (nil for internal users)."
  []
  (not api/*is-superuser?*))

(defn- recipient-ids->tenant-ids
  "Map of user id -> `:tenant_id` for the Metabase-user recipients in `recipient-ids`. Recipient maps
  come from the `:recipients` batched-hydrate, which does not select `:tenant_id`, so tenant
  membership is looked up here rather than read off the map — reading it off the map compares nil to
  nil and filters nothing (or, once the caller has a tenant, drops every recipient)."
  [recipient-ids]
  (if (seq recipient-ids)
    (pulse.db/user-tenant-ids recipient-ids)
    {}))

(defn- recipient-visible-to-tenant-caller?
  "Whether a tenant-scoped caller may see `recipient`. Plain-email recipients (no `:id`) are always
  visible; Metabase-user recipients are visible only when they belong to the caller's tenant.

  This predicate is the single definition of the tenant recipient filter: the read path uses it to
  hide recipients ([[filter-cross-tenant-recipients]]) and the write path uses it to merge the same
  hidden recipients back in, so a filtered read that is submitted back as a write cannot silently
  delete them."
  [id->tenant-id tenant-id recipient]
  (or (not (:id recipient))
      (= (id->tenant-id (:id recipient)) tenant-id)))

(defn hidden-cross-tenant-recipients
  "The Metabase-user recipients in `recipients` that [[filter-cross-tenant-recipients]] would hide from
  the current user. Returns `nil` when the caller is not tenant-scoped, i.e. when nothing is hidden.

  The write path uses this to restore recipients the caller was never shown; see
  [[metabase.pulse.write/maybe-add-recipients]]."
  [recipients]
  (when (tenant-scoped-caller?)
    (let [tenant-id     (:tenant_id @api/*current-user*)
          id->tenant-id (recipient-ids->tenant-ids (into #{} (keep :id) recipients))]
      (remove #(recipient-visible-to-tenant-caller? id->tenant-id tenant-id %) recipients))))

(defn- filter-cross-tenant-recipients
  "Drop Metabase-user recipients that belong to a different tenant than the current (tenant-scoped)
  user."
  [pulses]
  (let [tenant-id     (:tenant_id @api/*current-user*)
        recipient-ids (into #{}
                            (comp (mapcat :channels) (mapcat :recipients) (keep :id))
                            pulses)
        id->tenant-id (recipient-ids->tenant-ids recipient-ids)]
    (for [pulse pulses]
      (assoc pulse :channels
             (for [channel (:channels pulse)]
               (assoc channel :recipients
                      (filter #(recipient-visible-to-tenant-caller? id->tenant-id tenant-id %)
                              (:recipients channel))))))))

(defn maybe-filter-pulses-recipients
  "If the current user is sandboxed, remove all Metabase users from the `pulses` recipient lists that are not the user
  themselves. Recipients that are plain email addresses are preserved.

  If the current user is not a superuser, also filters the recipient lists down to users in the same
  tenant: tenant users see only their own tenant, internal users see only other internal users."
  [pulses]
  (cond->> pulses
    (perms/sandboxed-or-impersonated-user?)
    (map (fn [pulse]
           (assoc pulse :channels
                  (for [channel (:channels pulse)]
                    (assoc channel :recipients
                           (filter (fn [recipient]
                                     (or (not (:id recipient))
                                         (= (:id recipient) api/*current-user-id*)))
                                   (:recipients channel)))))))

    (tenant-scoped-caller?)
    filter-cross-tenant-recipients))

(defn maybe-filter-pulse-recipients
  "[[maybe-filter-pulses-recipients]] for a single pulse."
  [pulse]
  (first (maybe-filter-pulses-recipients [pulse])))

(defn maybe-strip-sensitive-metadata
  "If the current user does not have collection read permissions for the pulse, but can still read the pulse due to
  being the creator or a recipient, we return it with some metadata removed."
  [pulse]
  (if (collection-permits? pulse :read)
    pulse
    (-> (dissoc pulse :cards)
        (update :channels
                (fn [channels]
                  (map #(dissoc % :recipients) channels))))))

(mu/defn retrieve-user-alerts-for-card
  "Find all alerts for `card-id` that `user-id` is set to receive"
  [{:keys [archived? card-id user-id]
    :or   {archived? false}} :- [:map {:closed true}
                                 [:card-id pos-int?]
                                 [:user-id pos-int?]
                                 [:archived? {:optional true} boolean?]]]
  (assert boolean? archived?)
  (map (comp notification->alert hydrate-notification)
       (pulse.db/alerts-for-card-and-user card-id user-id archived?)))

(mu/defn retrieve-alerts-for-cards
  "Find all alerts for `card-ids`, used for admin users"
  [{:keys [archived? card-ids]
    :or   {archived? false}} :- [:map {:closed true}
                                 [:card-ids [:maybe [:or
                                                     [:sequential pos-int?]
                                                     [:set pos-int?]]]]
                                 [:archived? {:optional true} boolean?]]]
  (when (seq card-ids)
    (map (comp notification->alert hydrate-notification)
         (pulse.db/alerts-for-cards card-ids archived?))))

(mu/defn card->ref :- CardRef
  "Create a card reference from a card or id"
  [card :- [:or CoercibleToCardRef :metabase.queries.schema/card]]
  {:id                (u/the-id card)
   :include_csv       (get card :include_csv false)
   :include_xls       (get card :include_xls false)
   :format_rows       (get card :format_rows true)
   :pivot_results     (get card :pivot_results false)
   :dashboard_card_id (get card :dashboard_card_id nil)})

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/Pulse
  [_model]
  {:create :event/pulse-create
   :update :event/pulse-update
   :delete :event/pulse-delete})

(defmethod app-db-copy/spec :model/Pulse [_model]
  {:skip? false})

(defmethod change-log/spec :model/Pulse [_model]
  {:track [:creator_id :name :skip_if_empty :alert_condition :alert_first_only :alert_above_goal :collection_id
           :collection_position :archived :dashboard_id :parameters :entity_id :disable_links :archived_directly]
   :skip  []})

(defmethod audit/spec :model/Pulse [_model]
  {:track          []
   :track-redacted [:alert_above_goal :alert_condition :alert_first_only :archived :archived_directly :collection_id
                    :creator_id :dashboard_id :disable_links :name :parameters :skip_if_empty]
   :skip           [:collection_position :entity_id]
   :details        pulse.audit/details
   :state          pulse.audit/state
   :topics         {:create pulse.audit/create-topic
                    :update :subscription-update}})

(defmethod collection-items/spec :model/Pulse [_model]
  {"pulse" {:rank    2
            :items   pulse.db/collection-pulse-items
            :hydrate pulse.collection-items/hydrate}})

(defmethod eid-translation/spec :model/Pulse [_model]
  {:names [:pulse]})
