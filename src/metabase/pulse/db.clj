(ns metabase.pulse.db
  "Application database queries for the pulse module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow the `::opts` schemas per model; queries that do not fit them live in the
;;; pulse-only section at the bottom of this namespace.

(def ^:private pulse-set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:dashboard_id_set    :dashboard_id
   :alert_condition_set :alert_condition})

(mr/def ::pulse-filters
  "Which Pulses a query applies to. Keys mirror the columns of `pulse`: a scalar matches that value and a set
  matches any of its values. `:dashboard_id_set`/`:alert_condition_set` match the rows where that column is set
  (`true`) or null (`false`)."
  [:map {:closed true}
   [:id                  {:optional true} [:or ::lib.schema.id/pulse [:set ::lib.schema.id/pulse]]]
   [:archived            {:optional true} :boolean]
   [:dashboard_id        {:optional true} ::lib.schema.id/dashboard]
   [:dashboard_id_set    {:optional true} :boolean]
   [:alert_condition_set {:optional true} :boolean]])

(mr/def ::pulse-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::pulse-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::pulse.schema/pulse.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::pulse.schema/pulse.column
                                              [:tuple ::pulse.schema/pulse.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->pulse-model
  [columns]
  (u.query/model-with-columns :model/Pulse columns))

(defn- ->pulse-args
  [opts]
  (u.query/opts->args opts {:set-columns pulse-set-columns}))

(mr/def ::pulse-card-filters
  "Which PulseCards a query applies to. Keys mirror the columns of `pulse_card`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:pulse_id {:optional true} [:or ::lib.schema.id/pulse [:set ::lib.schema.id/pulse]]]])

(mr/def ::pulse-card-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::pulse-card-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::pulse.schema/pulse-card.column]]]])

(defn- ->pulse-card-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::pulse-channel-filters
  "Which PulseChannels a query applies to. Keys mirror the columns of `pulse_channel`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id           {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:pulse_id     {:optional true} [:or ::lib.schema.id/pulse [:set ::lib.schema.id/pulse]]]
   [:channel_type {:optional true} [:or :keyword :string]]
   [:enabled      {:optional true} :boolean]])

(mr/def ::pulse-channel-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::pulse-channel-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::pulse.schema/pulse-channel.column]]]])

(defn- ->pulse-channel-model
  [columns]
  (u.query/model-with-columns :model/PulseChannel columns))

(defn- ->pulse-channel-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::pulse-channel-recipient-filters
  "Which PulseChannelRecipients a query applies to. Keys mirror the columns of `pulse_channel_recipient`: a scalar
  matches that value and a set matches any of its values."
  [:map {:closed true}
   [:id                {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:pulse_channel_id  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:user_id           {:optional true} ::lib.schema.id/user]])

(mr/def ::pulse-channel-recipient-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::pulse-channel-recipient-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::pulse.schema/pulse-channel-recipient.column]]]])

(defn- ->pulse-channel-recipient-model
  [columns]
  (u.query/model-with-columns :model/PulseChannelRecipient columns))

(defn- ->pulse-channel-recipient-args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-pulses :- [:sequential ::pulse.schema/pulse.partial]
  "The Pulses matching `opts`."
  ([]
   (select-pulses nil))
  ([{:keys [columns] :as opts} :- [:maybe ::pulse-opts]]
   (apply t2/select (->pulse-model columns) (->pulse-args opts))))

(mu/defn select-one-pulse :- [:maybe ::pulse.schema/pulse.partial]
  "The first Pulse matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::pulse-opts]]
  (apply t2/select-one (->pulse-model columns) (->pulse-args opts)))

(mu/defn select-one-pulse-pk :- [:maybe ::lib.schema.id/pulse]
  "The id of the first Pulse matching `opts`, or nil."
  [opts :- [:maybe ::pulse-opts]]
  (apply t2/select-one-pk :model/Pulse (->pulse-args opts)))

(mu/defn count-pulses :- :int
  "The number of Pulses matching `opts`."
  [opts :- [:maybe ::pulse-opts]]
  (apply t2/count :model/Pulse (->pulse-args opts)))

(mu/defn select-pulse-channels :- [:sequential ::pulse.schema/pulse-channel.partial]
  "The PulseChannels matching `opts`."
  ([]
   (select-pulse-channels nil))
  ([{:keys [columns] :as opts} :- [:maybe ::pulse-channel-opts]]
   (apply t2/select (->pulse-channel-model columns) (->pulse-channel-args opts))))

(mu/defn select-one-pulse-channel :- [:maybe ::pulse.schema/pulse-channel.partial]
  "The first PulseChannel matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::pulse-channel-opts]]
  (apply t2/select-one (->pulse-channel-model columns) (->pulse-channel-args opts)))

(mu/defn select-one-pulse-channel-pk :- [:maybe ms/PositiveInt]
  "The id of the first PulseChannel matching `opts`, or nil."
  [opts :- [:maybe ::pulse-channel-opts]]
  (apply t2/select-one-pk :model/PulseChannel (->pulse-channel-args opts)))

(mu/defn select-pulse-channel-pks :- [:set ms/PositiveInt]
  "The ids of the PulseChannels matching `opts`."
  [opts :- [:maybe ::pulse-channel-opts]]
  (or (apply t2/select-pks-set :model/PulseChannel (->pulse-channel-args opts)) #{}))

(mu/defn select-pulse-channel-recipients :- [:sequential ::pulse.schema/pulse-channel-recipient.partial]
  "The PulseChannelRecipients matching `opts`."
  ([]
   (select-pulse-channel-recipients nil))
  ([{:keys [columns] :as opts} :- [:maybe ::pulse-channel-recipient-opts]]
   (apply t2/select (->pulse-channel-recipient-model columns) (->pulse-channel-recipient-args opts))))

(mu/defn select-one-pulse-channel-recipient-pk :- [:maybe ms/PositiveInt]
  "The id of the first PulseChannelRecipient matching `opts`, or nil."
  [opts :- [:maybe ::pulse-channel-recipient-opts]]
  (apply t2/select-one-pk :model/PulseChannelRecipient (->pulse-channel-recipient-args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-pulse! :- ::pulse.schema/pulse
  "Insert the Pulse `pulse` and return the inserted instance."
  [pulse :- ::pulse.schema/pulse.create]
  (t2/insert-returning-instance! :model/Pulse pulse))

(mu/defn update-pulses! :- :int
  "Apply `changes` to every Pulse matching `opts`, returning the number updated."
  [opts    :- [:maybe ::pulse-opts]
   changes :- ::pulse.schema/pulse.update]
  (apply t2/update! :model/Pulse (conj (u.query/opts->kv-args opts {:set-columns pulse-set-columns}) changes)))

(mu/defn insert-pulse-cards! :- :int
  "Insert the PulseCard `rows`, returning the number inserted."
  [rows :- [:sequential ::pulse.schema/pulse-card.create]]
  (t2/insert! :model/PulseCard rows))

(mu/defn delete-pulse-cards! :- :int
  "Delete every PulseCard matching `opts`, returning the number deleted."
  [opts :- [:maybe ::pulse-card-opts]]
  (apply t2/delete! :model/PulseCard (->pulse-card-args opts)))

(mu/defn insert-pulse-channel! :- ms/PositiveInt
  "Insert the PulseChannel `row` and return its id."
  [row :- ::pulse.schema/pulse-channel.create]
  (t2/insert-returning-pk! :model/PulseChannel row))

(mu/defn update-pulse-channels! :- :int
  "Apply `changes` to every PulseChannel matching `opts`, returning the number updated."
  [opts    :- [:maybe ::pulse-channel-opts]
   changes :- ::pulse.schema/pulse-channel.update]
  (apply t2/update! :model/PulseChannel (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-pulse-channels! :- :int
  "Delete every PulseChannel matching `opts`, returning the number deleted."
  [opts :- [:maybe ::pulse-channel-opts]]
  (apply t2/delete! :model/PulseChannel (->pulse-channel-args opts)))

(mu/defn insert-pulse-channel-recipients! :- :int
  "Insert the PulseChannelRecipient `rows`, returning the number inserted."
  [rows :- [:sequential ::pulse.schema/pulse-channel-recipient.create]]
  (t2/insert! :model/PulseChannelRecipient rows))

(mu/defn delete-pulse-channel-recipients! :- :int
  "Delete every PulseChannelRecipient matching `opts`, returning the number deleted."
  [opts :- [:maybe ::pulse-channel-recipient-opts]]
  (apply t2/delete! :model/PulseChannelRecipient (->pulse-channel-recipient-args opts)))

;;; --------------------------------------- Queries used only by the pulse module ---------------------------------------

(mu/defn select-alerts
  "The alert-type Pulses (unarchived unless `archived?`), optionally narrowed to those with a recipient or creator
  `user-id`, ordered by lower-cased name."
  [archived? :- :boolean
   user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Pulse
             (merge {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
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
                                   [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]}))))

(mu/defn select-dashboard-subscription-pulses
  "The dashboard-subscription Pulses (unarchived unless `archived?`), optionally narrowed to `dashboard-id` and/or
  those with a recipient or creator `user-id`, ordered by lower-cased name."
  [archived?    :- :boolean
   dashboard-id :- [:maybe ::lib.schema.id/dashboard]
   user-id      :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Pulse
             {:select-distinct [:p.* [[:lower :p.name] :lower-name]]
              :from            [[:pulse :p]]
              :left-join       (concat
                                [[:report_dashboard :d] [:= :p.dashboard_id :d.id]]
                                (when user-id
                                  [[:pulse_channel :pchan]         [:= :p.id :pchan.pulse_id]
                                   [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]))
              :where           [:and
                                [:= :p.alert_condition nil]
                                [:= :p.archived archived?]
                                [:or
                                 [:= :p.dashboard_id nil]
                                 [:= :d.archived false]]
                                (when dashboard-id
                                  [:= :p.dashboard_id dashboard-id])
                                (when user-id
                                  [:and
                                   [:not= :p.dashboard_id nil]
                                   [:or
                                    [:= :p.creator_id user-id]
                                    [:= :pcr.user_id user-id]]])]
              :order-by        [[:lower-name :asc]]}))

(mu/defn select-alerts-for-card-and-user
  "The alert-type Pulses (unarchived unless `archived?`) on the Card with `card-id` that the User with `user-id` is
  set to receive."
  [card-id   :- ::lib.schema.id/card
   user-id   :- ::lib.schema.id/user
   archived? :- :boolean]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                       [:pulse_channel :pchan] [:= :pchan.pulse_id :p.id]
                       [:pulse_channel_recipient :pcr] [:= :pchan.id :pcr.pulse_channel_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:= :pc.card_id card-id]
                       [:= :pcr.user_id user-id]
                       [:= :p.archived archived?]]}))

(mu/defn select-alerts-for-cards
  "The alert-type Pulses (unarchived unless `archived?`) on any of the Cards with `card-ids`."
  [card-ids  :- [:sequential ::lib.schema.id/card]
   archived? :- :boolean]
  (t2/select :model/Pulse
             {:select [:p.*]
              :from   [[:pulse :p]]
              :join   [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
              :where  [:and
                       [:not= :p.alert_condition nil]
                       [:in :pc.card_id card-ids]
                       [:= :p.archived archived?]]}))

(mu/defn update-pulses-for-dashboard! :- :int
  "Apply `changes` to the Pulses of the Dashboard with `dashboard-id`, leaving `updated_at` untouched, returning the
  number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::pulse.schema/pulse.update]
  (t2/update! :model/Pulse {:dashboard_id dashboard-id} (assoc changes :updated_at :updated_at)))

(mu/defn select-pulse-cards-for-pulses
  "The Cards of the Pulses with `pulse-ids` together with their PulseCard options, in position order. Excludes
  archived Cards unless `include-archived?`."
  [pulse-ids         :- [:sequential ::lib.schema.id/pulse]
   include-archived? :- :boolean]
  (t2/select
   :model/Card
   {:select    [:c.id :c.name :c.description :c.collection_id :c.display :pc.include_csv :pc.include_xls :pc.format_rows :pc.pivot_results
                :pc.dashboard_card_id :dc.dashboard_id [nil :parameter_mappings] [:p.id :pulse_id]] ;; :dc.parameter_mappings - how do you select this?
    :from      [[:pulse :p]]
    :join      [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                [:report_card :c] [:= :c.id :pc.card_id]]
    :left-join [[:report_dashboardcard :dc] [:= :pc.dashboard_card_id :dc.id]]
    :where     [:and
                [:in :p.id pulse-ids]
                (when-not include-archived? [:= :c.archived false])]
    :order-by [[:pc.position :asc]]}))

(mu/defn select-pulse-card-refs
  "The Card id (as `:id`), export options, and DashboardCard id of the PulseCards of the Pulse with `pulse-id`, in
  position order."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select [:model/PulseCard [:card_id :id] :include_csv :include_xls :dashboard_card_id]
             :pulse_id pulse-id
             {:order-by [[:position :asc]]}))

(mu/defn select-max-pulse-card-position
  "The `:max` position of the PulseCards of the Pulse with `pulse-id`."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select-one [:model/PulseCard [:%max.position :max]] :pulse_id pulse-id))

(mu/defn select-pulse-channels-without-recipients
  "The id, details, Channel, and type of the PulseChannels of the Pulse with `pulse-id` that have no recipients."
  [pulse-id :- ::lib.schema.id/pulse]
  (t2/select [:model/PulseChannel :id :details :channel_id :channel_type]
             {:where [:and
                      [:= :pulse_id pulse-id]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [:pulse_channel_recipient]
                              :where  [:= :pulse_channel_recipient.pulse_channel_id
                                       :pulse_channel.id]}]]]}))

(mu/defn select-active-dashboard-subscription-channels
  "The enabled PulseChannels of dashboard subscriptions whose Dashboard is not archived."
  []
  (t2/select :model/PulseChannel
             {:select    [:pc.*]
              :from      [[:pulse_channel :pc]]
              :left-join [[:pulse :p] [:= :pc.pulse_id :p.id]
                          [:report_dashboard :d] [:= :p.dashboard_id :d.id]]
              :where     [:and
                          [:= :pc.enabled true]
                          ;; only do this for dashboard subscriptions, alert has been
                          ;; migrated to notifications
                          [:not= :p.dashboard_id nil]
                          [:= :d.archived false]]}))

(mu/defn count-other-pulse-channels
  "The number of PulseChannels of the Pulse with `pulse-id` other than `channel-id`."
  [pulse-id   :- ::lib.schema.id/pulse
   channel-id :- ms/PositiveInt]
  (t2/count :model/PulseChannel :pulse_id pulse-id, :id [:not= channel-id]))

(mu/defn select-active-recipients-for-channels
  "The id, email, name, and PulseChannel id of the active User recipients of the PulseChannels with `channel-ids`, in
  User id order."
  [channel-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/User :id :email :first_name :last_name :pcr.pulse_channel_id]
             {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
              :where     [:and
                          [:in :pcr.pulse_channel_id channel-ids]
                          [:= :core_user.is_active true]]
              :order-by [[:core_user.id :asc]]}))

(mu/defn select-pulse-channel-recipient-user-ids :- [:set ::lib.schema.id/user]
  "The User ids of the PulseChannelRecipients of the PulseChannel with `channel-id`."
  [channel-id :- ms/PositiveInt]
  (or (t2/select-fn-set :user_id :model/PulseChannelRecipient, :pulse_channel_id channel-id) #{}))

(mu/defn count-other-pulse-channel-recipients
  "The number of PulseChannelRecipients of the PulseChannel with `channel-id` other than `recipient-id`."
  [channel-id   :- ms/PositiveInt
   recipient-id :- ms/PositiveInt]
  (t2/count :model/PulseChannelRecipient :pulse_channel_id channel-id :id [:not= recipient-id]))

(mu/defn delete-pulse-channel-recipients-raw!
  "Delete the PulseChannelRecipients of the Users with `user-ids` on the PulseChannel with `channel-id`, without
  running model hooks."
  [channel-id :- ms/PositiveInt
   user-ids   :- [:set ::lib.schema.id/user]]
  (t2/delete! (t2/table-name :model/PulseChannelRecipient) :pulse_channel_id channel-id :user_id [:in user-ids]))

;;; ------------------------------------------- Other models -------------------------------------------

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card card-id))

(mu/defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :dataset_query [:model/Card :dataset_query] card-id))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil. `dashboard-id` may be nil (e.g. a legacy Pulse with no Dashboard), in
  which case the result is nil."
  [dashboard-id :- [:maybe ::lib.schema.id/dashboard]]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id :model/Dashboard, :id dashboard-id))

(mu/defn dashcard-ids-by-card
  "A map of Card id to DashboardCard id for the DashboardCards of the Dashboard with `dashboard-id` showing one of
  `card-ids`."
  [dashboard-id :- ::lib.schema.id/dashboard
   card-ids     :- [:set ::lib.schema.id/card]]
  (t2/select-fn->pk :card_id :model/DashboardCard :dashboard_id dashboard-id :card_id [:in card-ids]))

(mu/defn pulse-card-pairs-for-dashboard
  "Distinct `:pulse-id`/`:card-id` pairs for the Pulses (subscriptions) attached to the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (app-db/query {:select-distinct [[:p.id :pulse-id] [:pc.card_id :card-id]]
                 :from            [[:pulse :p]]
                 :left-join       [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                 :where           [:= :p.dashboard_id dashboard-id]}))

(mu/defn dashboard-card-ids-for-dashboard
  "The distinct, non-nil Card ids shown by the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (map :card_id (app-db/query {:select-distinct [:dc.card_id]
                               :from            [[:report_dashboardcard :dc]]
                               :where           [:and
                                                 [:= :dc.dashboard_id dashboard-id]
                                                 [:not= :dc.card_id nil]]})))

(mu/defn superusers
  "The superusers."
  []
  (t2/select :model/User :is_superuser true))

(mu/defn user-emails-by-id
  "A map of User id to email for the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :email :model/User, :id [:in user-ids]))

(mu/defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn :tenant_id :model/User :id [:in user-ids]))

(defn user-name-and-email
  "The first name, last name, and email of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :first_name :last_name :email] user-id))

(defn users-names-and-emails
  "The first names, last names, and emails of the Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :first_name :last_name :email] :id [:in user-ids]))

(defn dashboard-parameters
  "The id and parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :id :parameters] dashboard-id))

(defn dashboard-name-description-creator
  "The name, description, and creator id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id))
