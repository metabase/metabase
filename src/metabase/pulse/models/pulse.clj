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
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.channel.models.channel :as channel.models]
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
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.users.models.user :as user]
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
  (derive :hook/entity-id))

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
  "`pulse`, a row an INSERT writes, without its nil columns and with the defaults of a Pulse."
  [pulse]
  (merge {:parameters []}
         (into {} (filter (comp some? val)) pulse)))

(t2/define-before-insert :model/Pulse
  [pulse]
  (cond-> (new-pulse pulse)
    (:dashboard_id pulse) (assoc :collection_id (pulse.db/dashboard-collection-clause (:dashboard_id pulse)))))

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
    (when (some #(contains? changes %) [:dashboard_id :collection_position :alert_condition :alert_first_only :alert_above_goal])
      (check-dashboard-subscription pulse))
    (cond-> pulse
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (mi/archived-directly-clause :model/Pulse changes)))))

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

(def ^:private PulseChannelInput
  "A PulseChannel as [[replace-pulse-channels!]] and [[create-pulses!]] accept it: a subset of `::pulse-channel`
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

(def ^:private NotificationOrId
  "A Pulse/Alert id or a Pulse row — the shapes [[u/the-id]] is called with below."
  [:or ms/PositiveInt ::pulse.schema/pulse [:map [:id ms/PositiveInt]]])

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
  [[metabase.pulse.api.pulse/maybe-add-recipients]]."
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

;;; ------------------------------------------------------ Writes ----------------------------------------------------------

(defn- moved-pulses
  "The `pulses` whose Collection their changes, `changes-of` a Pulse, move."
  [pulses changes-of]
  (remove (fn [pulse]
            (let [changes (changes-of pulse)]
              (or (not (contains? changes :collection_id))
                  (= (:collection_id pulse) (:collection_id changes)))))
          pulses))

(defn- collection-parents
  "The Collections of the `rows`, each holding `:collection_id`, as rows by id, read together."
  [rows]
  (when-let [ids (not-empty (into [] (comp (keep :collection_id) (distinct)) rows))]
    (collection/collections-for-content-checks ids)))

(defn- check-collection
  "Throw unless the Collection of `row`, holding `:collection_id` and `:archived`, which `parents` has by id, satisfies
  these rules:

  - it can hold the content of a Pulse
  - it is in a namespace a Pulse can go in
  - it is not archived, unless the Pulse is"
  [parents {:keys [collection_id archived]}]
  (when collection_id
    (let [parent (or (get parents collection_id) (collection/content-parent collection_id))]
      (collection/check-allowed-content :model/Pulse parent)
      (collection/check-collection-namespace :model/Pulse parent)
      (collection/check-collection-not-archived archived parent))))

(defn- check-collections
  "Throws unless the Collection of each of `rows`, each holding `:collection_id` and `:archived`, can hold a Pulse, for
  the first row that cannot, reading the Collections together."
  [rows]
  (let [parents (collection-parents rows)]
    (run! #(check-collection parents %) (into [] (comp (map #(select-keys % [:collection_id :archived])) (distinct)) rows))))

(defn- check-moved-collections
  "Throws unless the Collection each of the `pulses` moves to under its changes, `changes-of` a Pulse, can hold it."
  [pulses changes-of]
  (check-collections (map #(merge % (changes-of %)) (moved-pulses pulses changes-of))))

(defn- changed-columns
  "The part of `changes` that differs from the stored columns of `pulse`."
  [pulse changes]
  (into {} (remove (fn [[k v]] (= v (get pulse k)))) changes))

(mu/defn- assoc-dashboard-collections :- [:sequential (mut/dissoc ::pulse.schema/pulse.update :id)]
  "`pulses`, each filed in the Collection of its Dashboard when it is a dashboard subscription."
  [pulses :- [:sequential (mut/dissoc ::pulse.schema/pulse.update :id)]]
  (let [dashboards (when-let [ids (not-empty (into [] (comp (keep :dashboard_id) (distinct)) pulses))]
                     (u/index-by :id (pulse.db/dashboards-by-id ids)))]
    (mapv #(assoc % :collection_id (if-let [dashboard-id (:dashboard_id %)]
                                     (:collection_id (get dashboards dashboard-id))
                                     (:collection_id %)))
          pulses)))

(defn- column-changes
  "The columns of the Pulse that `changes`, columns and parts, change."
  [changes]
  (u/select-keys-when changes
                      :present [:collection_id :collection_position :archived]
                      :non-nil [:name :alert_condition :alert_above_goal :alert_first_only :skip_if_empty :parameters]))

(defn- id->changes-of
  "A map from id to the changes of the columns of each of `updates`, the id of a Pulse and its changes, that changes a
  Pulse of `id->stored`."
  [updates id->stored]
  (into {}
        (keep (fn [update]
                (let [changes (column-changes (dissoc update :id))]
                  (when (and (id->stored (:id update)) (seq changes))
                    [(:id update) changes]))))
        updates))

(defn- enable-pulse-channels!
  "Enable or disable the PulseChannels of the Pulses of `id->stored` whose `:archived` the changes in `id->changes` flip."
  [id->stored id->changes]
  (doseq [[archived ids] (group-by #(:archived (id->changes %))
                                   (filter (fn [id]
                                             (let [changes (id->changes id)]
                                               (and (contains? changes :archived)
                                                    (not= (:archived (id->stored id)) (:archived changes)))))
                                           (keys id->changes)))]
    (pulse-channel/set-pulse-channels-enabled! (vec ids) (not archived))))

(defn- check-pulse-updates
  "Throw unless the Collection that each Pulse of `id->stored` moves to under `updates`, each the id of a Pulse and its
  changes, can hold it, as [[check-collection]] says."
  [updates id->stored]
  (let [id->changes (id->changes-of updates id->stored)]
    (check-moved-collections (vals (select-keys id->stored (keys id->changes))) #(id->changes (:id %)))))

(defn- prepare-pulse-updates
  "The `updates` that change a column of a Pulse of `id->stored`, each with its columns only."
  [updates id->stored]
  (let [id->changes (id->changes-of updates id->stored)]
    (into [] (comp (map :id) (filter id->changes) (distinct) (map #(assoc (id->changes %) :id %))) updates)))

(defn- check-and-prepare-pulse-updates
  "Check `updates` against `id->stored` with [[check-pulse-updates]] and return what [[prepare-pulse-updates]] makes of
  them."
  [updates id->stored]
  (check-pulse-updates updates id->stored)
  (prepare-pulse-updates updates id->stored))

(defn- pulse-update-event
  "The update event of the Pulses of `id->stored` that `updates` change, with the rows `id->updated` after the write."
  [updates id->stored id->updated opts]
  (events/update-event id->stored updates (assoc opts :objects id->updated)))

(defn- publish-pulse-updates!
  "Enable or disable the PulseChannels of the Pulses of `id->stored` whose `:archived` `updates` flip, then publish their
  update event."
  [opts updates id->stored id->updated]
  (enable-pulse-channels! id->stored (into {} (map (juxt :id #(dissoc % :id))) updates))
  (let [event (pulse-update-event updates id->stored id->updated opts)]
    (when (seq (:changes event))
      (events/publish-event! :event/pulse-update event))))

(declare update-parts!)

(def ^:private PulseChanges
  "What [[update-pulses!]] sets on each of its Pulses: columns only."
  [:map {:closed true}
   [:name                {:optional true} ms/NonBlankString]
   [:alert_condition     {:optional true} AlertConditions]
   [:alert_above_goal    {:optional true} boolean?]
   [:alert_first_only    {:optional true} boolean?]
   [:skip_if_empty       {:optional true} boolean?]
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:archived            {:optional true} boolean?]
   [:parameters          {:optional true} [:maybe [:sequential ::pulse.schema/pulse.parameter]]]])

(def ^:private PulseUpdate
  "What [[update-pulses!]] takes for each Pulse: its `:id` and the columns to change."
  [:merge PulseChanges [:map {:closed true} [:id ::lib.schema.id/pulse]]])

(def ^:private PulseChangesWithParts
  "What [[update-pulse!]] sets on its Pulse: columns, and the `:cards` and `:channels` to replace."
  [:map {:closed true}
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

(mu/defn update-pulses! :- :nil
  "Apply `updates`, each the id of a Pulse that exists and its columns only, in one transaction, publishing their
  update event with `opts`, where a change of `:archived` also sets `archived_directly` and enables or disables the
  PulseChannels, and a change of `:collection_id` checks that the new Collection can hold the Pulses."
  ([updates :- [:sequential PulseUpdate]]
   (update-pulses! updates nil))
  ([updates :- [:sequential PulseUpdate]
    opts    :- :metabase.events.schema/write-opts]
   (mdb/update-batched! :model/Pulse updates
                        {:before-update check-and-prepare-pulse-updates
                         :reread?       true
                         :after-update  #(publish-pulse-updates! opts %1 %2 %3)})))

(defn- write-pulse-columns!
  "Check and write the `changes` to the columns of the Pulse `stored`, if any, and return the update event of the write,
  or nil when it changes no column."
  [stored changes opts]
  (let [id->stored {(:id stored) stored}
        updates    [(assoc changes :id (:id stored))]]
    (check-pulse-updates updates id->stored)
    (when-let [updates (not-empty (prepare-pulse-updates updates id->stored))]
      (pulse.db/update-pulses! updates)
      (enable-pulse-channels! id->stored (into {} (map (juxt :id #(dissoc % :id))) updates))
      (pulse-update-event updates id->stored (pulse.db/pulses-by-ids [(:id stored)]) opts))))

(mu/defn update-pulse! :- :nil
  "Apply `changes`, columns and the `:cards` and `:channels` to replace, to the Pulse with `pulse-id` when it exists,
  publishing one update event with `opts`, last: a touch event when only its parts changed."
  ([pulse-id :- ::lib.schema.id/pulse
    changes  :- PulseChangesWithParts]
   (update-pulse! pulse-id changes nil))
  ([pulse-id :- ::lib.schema.id/pulse
    changes  :- PulseChangesWithParts
    opts     :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (when-let [stored (get (pulse.db/pulses-by-ids [pulse-id]) pulse-id)]
       (let [event    (write-pulse-columns! stored changes opts)
             changed  (seq (:changes event))
             parts    (update-parts! [(assoc changes :id pulse-id)])
             touch    (when (and (not changed) (contains? parts pulse-id))
                        (events/touch-event (vec (vals (pulse.db/pulses-by-ids [pulse-id]))) opts))]
         (when-let [published (or (when changed event) touch)]
           (events/publish-event! :event/pulse-update published)))))
   nil))

(mu/defn update-pulses-for-dashboards! :- :nil
  "Set the name and Collection of the Pulses of each Dashboard of `changes-by-dashboard`, a map of Dashboard id to
  `{:name .. :collection_id ..}`, in one statement for all of them, leaving `updated_at` untouched, as a change to the
  Dashboard does, publishing the update event."
  [changes-by-dashboard :- [:map-of ::lib.schema.id/dashboard (mut/dissoc ::pulse.schema/pulse.update :id)]]
  (when (seq changes-by-dashboard)
    (t2/with-transaction [_conn]
      (let [pulses     (pulse.db/pulses-for-dashboards (vec (keys changes-by-dashboard)))
            changes-of (fn [pulse] (get changes-by-dashboard (:dashboard_id pulse)))
            changed    (filterv #(seq (changed-columns % (changes-of %))) pulses)]
        (check-moved-collections pulses changes-of)
        (when (seq changed)
          (binding [*allow-moving-dashboard-subscriptions* true]
            (run! pulse.db/update-pulses-for-dashboards!
                  (map #(select-keys changes-by-dashboard %)
                       (partition-all mdb/update-partition-size (distinct (map :dashboard_id changed))))))
          (events/publish-event! :event/pulse-update
                                 (events/update-event (u/index-by :id changed)
                                                      (mapv #(assoc (changes-of %) :id (:id %)) changed)
                                                      {:objects (into {} (map (fn [pulse] [(:id pulse) (merge pulse (changes-of pulse))])) changed)}))))))
  nil)

(defn- publish-touch!
  "Publish, as the last step of a write of their parts, the update event of the Pulses with `pulse-ids`, which changed
  none of their columns, so that the records of each Pulse are made once."
  [pulse-ids]
  (when-let [ids (not-empty (vec (distinct (keep identity pulse-ids))))]
    (events/publish-event! :event/pulse-update (events/touch-event (vec (vals (pulse.db/pulses-by-ids ids)))))))

(mu/defn append-pulse-cards! :- :nil
  "Append the PulseCards `new-pulse-cards` to their Pulses, publishing, last, the update event of each Pulse that gains
  one."
  [new-pulse-cards :- [:sequential pulse-card/NewPulseCard]]
  (when (seq new-pulse-cards)
    (t2/with-transaction [_conn]
      (run! pulse-card/append-pulse-cards! (map vec (partition-all mdb/create-partition-size new-pulse-cards)))
      (publish-touch! (map :pulse_id new-pulse-cards))))
  nil)

(mu/defn delete-pulse-cards-for-dashcards! :- :nil
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`, publishing, last, the update event of each Pulse
  that loses one."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (when (seq dashcard-ids)
    (t2/with-transaction [_conn]
      (when-let [cards (not-empty (pulse.db/pulse-cards-for-dashcards dashcard-ids))]
        (pulse-card/delete-pulse-cards! (mapv :id cards))
        (publish-touch! (map :pulse_id cards)))))
  nil)

(mu/defn update-pulse-channel-details! :- :nil
  "Set the `:details` of the PulseChannel `pulse-channel`, a row as selected from the app DB, publishing, last, the update
  event of its Pulse."
  [pulse-channel :- [:map [:id ms/PositiveInt] [:pulse_id ::lib.schema.id/pulse]]
   details       :- ::pulse.schema/pulse-channel.details]
  (t2/with-transaction [_conn]
    (pulse-channel/update-pulse-channel-details! pulse-channel details)
    (publish-touch! [(:pulse_id pulse-channel)]))
  nil)

(defn- delete-channels-and-publish!
  "Delete the PulseChannels of `pulses`, and the SendPulse triggers of those, then publish the delete event of the
  Pulses."
  [opts pulses]
  (pulse-channel/delete-pulse-channels! (mapv :id (pulse.db/pulse-channels-for-pulses (mapv :id pulses))))
  (events/publish-event! :event/pulse-delete (events/delete-event pulses opts)))

(mu/defn delete-pulses! :- :nil
  "Delete the Pulses with `ids` along with their PulseChannels and the SendPulse triggers of those, in one transaction,
  publishing their delete event right before the first Pulse statement."
  ([ids :- [:sequential ::lib.schema.id/pulse]]
   (delete-pulses! ids nil))
  ([ids  :- [:sequential ::lib.schema.id/pulse]
    opts :- :metabase.events.schema/write-opts]
   (mdb/delete-batched! :model/Pulse ids {:before-delete #(delete-channels-and-publish! opts %)})))

(mu/defn remove-pulse-channels! :- :nil
  "Delete the PulseChannels with `channel-ids` and archive each Pulse left without a PulseChannel, publishing its
  update event, while a Pulse that keeps a PulseChannel publishes none as the channels it loses are upkeep, not a
  change of it."
  ([channel-ids :- [:sequential ms/PositiveInt]]
   (remove-pulse-channels! channel-ids nil))
  ([channel-ids :- [:sequential ms/PositiveInt]
    opts        :- :metabase.events.schema/write-opts]
   (when (seq channel-ids)
     (t2/with-transaction [_conn]
       (let [pulse-ids (vec (distinct (map :pulse_id (pulse.db/pulse-channels-with-ids channel-ids))))]
         (pulse-channel/delete-pulse-channels! channel-ids)
         (when-let [emptied (not-empty (vec (remove (set (pulse.db/pulse-ids-with-channels pulse-ids)) pulse-ids)))]
           (update-pulses! (mapv #(hash-map :id % :archived true) emptied) opts)))))
   nil))

(defn- emptied-channel-ids
  "The ids of the PulseChannels that lose their last recipient when `recipients` are deleted and have no raw email
  addresses, as Slack PulseChannels and ones with email address subscriptions are never deleted with their recipients."
  [recipients]
  (when (seq recipients)
    (let [channel-ids (into #{} (map :pulse_channel_id) recipients)
          remaining   (merge (zipmap channel-ids (repeat 0))
                             (pulse.db/pulse-channel-recipient-counts (vec channel-ids)))
          deleting    (frequencies (map :pulse_channel_id recipients))
          candidates  (filterv #(= (get deleting %) (get remaining %)) channel-ids)
          details     (when (seq candidates) (pulse.db/pulse-channel-details-by-ids candidates))]
      (filterv #(empty? (:emails (get details %))) candidates))))

(defn- delete-recipients!
  "Delete the PulseChannelRecipients `recipients` and the PulseChannels they were the last recipients of, archiving
  the Pulses left without a PulseChannel and publishing no event for a Pulse that keeps its PulseChannels, as a
  recipient leaving is upkeep, not a change of the Pulse."
  [recipients opts]
  (when (seq recipients)
    (t2/with-transaction [_conn]
      (let [emptied   (vec (emptied-channel-ids recipients))
            emptied?  (set emptied)
            remaining (vec (remove (comp emptied? :pulse_channel_id) recipients))]
        (remove-pulse-channels! emptied opts)
        (when (seq remaining)
          (pulse.db/delete-pulse-channel-recipients! (mapv :id remaining)))))))

(mu/defn delete-pulse-channel-recipients! :- :nil
  "Delete the PulseChannelRecipients with `recipient-ids`, together with a PulseChannel that loses its last recipient
  and has no raw email addresses, and archive its Pulse when it was the last PulseChannel of the Pulse."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (when (seq recipient-ids)
    (delete-recipients! (pulse.db/pulse-channel-recipients-by-ids recipient-ids) nil))
  nil)

(mu/defn delete-pulse-channel-recipients-for-users! :- :nil
  "Delete every PulseChannelRecipient of the Users with `user-ids`, and the PulseChannels they were the last recipients
  of, as [[delete-pulse-channel-recipients!]] does."
  ([user-ids :- [:sequential ::lib.schema.id/user]]
   (delete-pulse-channel-recipients-for-users! user-ids nil))
  ([user-ids :- [:sequential ::lib.schema.id/user]
    opts     :- :metabase.events.schema/write-opts]
   (when (seq user-ids)
     (delete-recipients! (pulse.db/pulse-channel-recipients-for-users user-ids) opts))
   nil))

(defn- card-rows
  "The PulseCard rows that put the Cards of `card-refs` on the Pulse with `pulse-id`, in order."
  [pulse-id card-refs]
  (vec (map-indexed (fn [i {card-id :id :keys [include_csv include_xls format_rows pivot_results dashboard_card_id]}]
                      {:pulse_id          pulse-id
                       :card_id           card-id
                       :position          i
                       :include_csv       include_csv
                       :include_xls       include_xls
                       :format_rows       format_rows
                       :pivot_results     pivot_results
                       :dashboard_card_id dashboard_card_id})
                    card-refs)))

(defn- channel-row
  "The PulseChannel `channel` of the Pulse with `pulse-id`, with the keywords of its columns."
  [pulse-id channel]
  (assoc channel
         :channel_type   (keyword (:channel_type channel))
         :schedule_type  (keyword (:schedule_type channel))
         :schedule_frame (keyword (:schedule_frame channel))
         :pulse_id       pulse-id))

(mu/defn- replace-pulse-cards! :- [:set ::lib.schema.id/pulse]
  "Replace the PulseCards of each Pulse of `card-refs-by-pulse`, a map from its id to the CardRefs, a definitive
  collection of *all* Cards of the Pulse in the desired order, with those, given the CardRefs it has now in `existing`, a
  map from its id, and return the ids of the Pulses that had or gained a PulseCard."
  [card-refs-by-pulse :- [:map-of ::lib.schema.id/pulse [:sequential CardRef]]
   existing           :- [:map-of ::lib.schema.id/pulse [:sequential CardRef]]]
  (when (seq card-refs-by-pulse)
    (pulse-card/delete-pulse-cards! (pulse.db/pulse-card-ids-for-pulses (filterv #(seq (get existing %)) (keys card-refs-by-pulse))))
    (pulse-card/create-pulse-cards! (into [] (mapcat (fn [[pulse-id card-refs]] (card-rows pulse-id card-refs))) card-refs-by-pulse)))
  (into #{}
        (filter (fn [pulse-id] (or (seq (get existing pulse-id)) (seq (get card-refs-by-pulse pulse-id)))))
        (keys card-refs-by-pulse)))

(mu/defn- replace-pulse-channels! :- [:set ::lib.schema.id/pulse]
  "Replace the PulseChannels of each Pulse of `channels-by-pulse`, a map from its id to a definitive collection of
  *all* of its channels, creating a channel that has no existing PulseChannel, deleting an existing PulseChannel that
  has no entry and updating the others with their most recent information, and return the ids of the Pulses that
  changed any."
  [channels-by-pulse :- [:map-of ::lib.schema.id/pulse [:sequential PulseChannelInput]]]
  (if (empty? channels-by-pulse)
    #{}
    (let [existing (group-by :pulse_id (pulse.db/pulse-channels-for-pulses (vec (keys channels-by-pulse))))
          diffs    (into {}
                         (map (fn [[pulse-id channels]]
                                [pulse-id (u/row-diff (get existing pulse-id)
                                                      (map-indexed (fn [idx channel]
                                                                     (assoc (channel-row pulse-id channel)
                                                                            :id (or (:id channel) (- (inc idx)))))
                                                                   channels)
                                                      {:to-compare #(dissoc % :created_at :updated_at)})]))
                         channels-by-pulse)
          to-create (into [] (mapcat (comp :to-create val)) diffs)
          to-update (into [] (mapcat (comp :to-update val)) diffs)
          to-delete (into [] (mapcat (comp :to-delete val)) diffs)
          created   (pulse-channel/create-pulse-channels! to-create)
          _         (assert (every? :id to-update) "Cannot update a PulseChannel without an :id")
          updated   (pulse-channel/update-pulse-channels! to-update)
          _         (assert (every? :id to-delete) "Cannot delete a PulseChannel without an :id")
          _         (when (seq to-delete)
                      (pulse-channel/delete-pulse-channels! (mapv :id to-delete)))]
      (into #{} (map :pulse_id) (concat created updated to-delete)))))

(def ^:private PulseCreate
  "What [[create-pulses!]] takes for one Pulse: its columns and the `:cards` and `:channels` it has."
  [:map {:closed true}
   [:name                                 ms/NonBlankString]
   [:creator_id                           ms/PositiveInt]
   [:cards                                [:sequential CardRef]]
   [:channels                             [:sequential PulseChannelInput]]
   [:skip_if_empty       {:optional true} [:maybe :boolean]]
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
   [:parameters          {:optional true} [:maybe [:sequential ::pulse.schema/pulse.parameter]]]
   [:disable_links       {:optional true} [:maybe ms/BooleanValue]]])

(defn- check-pulse-creates
  "Throw unless every Pulse of `rows` satisfies these rules:

  - it is in a Collection that can hold a Pulse (a dashboard subscription in that of its Dashboard)
  - its PulseChannels are valid new ones"
  [rows]
  (let [checked (assoc-dashboard-collections (mapv #(dissoc % :cards :channels) rows))
        parents (collection-parents checked)]
    (doseq [[pulse row] (map vector checked rows)]
      (check-collection parents pulse)
      (pulse-channel/check-new-pulse-channels (map #(channel-row 0 %) (:channels row))))))

(defn- create-pulse-batch!
  "Check and insert `rows`, one batch of a call, with their PulseCards and PulseChannels, and return the inserted Pulses."
  [rows]
  (check-pulse-creates rows)
  (let [pulses (pulse.db/insert-pulses! (mapv #(dissoc % :cards :channels) rows))]
    (pulse-card/create-pulse-cards! (vec (mapcat (fn [row pulse] (card-rows (:id pulse) (:cards row))) rows pulses)))
    (pulse-channel/create-pulse-channels! (vec (mapcat (fn [row pulse] (map #(channel-row (:id pulse) %) (:channels row))) rows pulses)))
    pulses))

(mu/defn create-pulses! :- [:sequential (ms/InstanceOf :model/Pulse)]
  "Insert the Pulses of `rows` with their PulseCards, PulseChannels and PulseChannelRecipients in batches in one
  transaction, publishing one create event for all, and return them with the standard hydrations, in order."
  [rows :- [:sequential PulseCreate]]
  (let [ids (t2/with-transaction [_conn]
              (let [pulses (into [] (mapcat (comp create-pulse-batch! vec)) (partition-all mdb/create-partition-size rows))]
                (when (seq pulses)
                  (events/publish-event! :event/pulse-create (events/create-event pulses)))
                (mapv :id pulses)))]
    (if (seq ids)
      (let [id->pulse (pulse.db/pulses-by-ids ids)]
        (mapv notification->pulse (hydrate-notifications (mapv id->pulse ids))))
      [])))

(defn- update-parts!
  "Replace the `:cards` and `:channels` that each of `rows` gives of its Pulse, returning the ids of the Pulses that
  changed any."
  [rows]
  (let [with-cards (filterv #(contains? % :cards) rows)
        existing   (when (seq with-cards)
                     (update-vals (group-by :pulse_id (pulse.db/pulse-card-refs-for-pulses (mapv :id with-cards)))
                                  (fn [refs] (mapv #(dissoc % :pulse_id) refs))))
        changed    (into {}
                         (keep (fn [{:keys [id cards]}]
                                 (let [refs (mapv card->ref cards)]
                                   (when (not= (get existing id []) refs)
                                     [id refs]))))
                         with-cards)]
    (into (replace-pulse-cards! changed (or existing {}))
          (replace-pulse-channels! (into {} (comp (filter #(contains? % :channels)) (map (juxt :id :channels))) rows)))))

(defmethod collection/shift-positions-in-collection! :model/Pulse
  [_model collection-id positions direction]
  (pulse.db/shift-pulse-positions! collection-id positions direction))

(defmethod collection/archive-in-collections! :model/Pulse
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-pulses! (mapv #(hash-map :id % :archived true) ids) opts)))

(defmethod collection/restore-in-collections! :model/Pulse
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-pulses! (mapv #(hash-map :id % :archived false) ids) opts)))

(defmethod collection/delete-in-collections! :model/Pulse
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-in-collections model collection-ids))]
    (delete-pulses! ids opts)))

(defmethod channel.models/delete-for-channels! :model/PulseChannel
  [_model channel-ids opts]
  (remove-pulse-channels! (pulse.db/pulse-channel-ids-for-channels channel-ids) opts))

(defmethod user/delete-for-users! :model/PulseChannelRecipient
  [_model user-ids opts]
  (delete-pulse-channel-recipients-for-users! (vec user-ids) opts))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

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
   :hydrate        pulse.audit/hydrate
   :details        pulse.audit/details
   :state          pulse.audit/state
   :touch          :row
   :topics         {:create pulse.audit/create-topic
                    :update :subscription-update}})

(defmethod collection-items/spec :model/Pulse [_model]
  {"pulse" {:rank    2
            :items   pulse.db/collection-pulse-items
            :hydrate pulse.collection-items/hydrate}})

(defmethod eid-translation/spec :model/Pulse [_model]
  {:names [:pulse]})
