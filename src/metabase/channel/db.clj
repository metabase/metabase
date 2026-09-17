(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.channel.schema :as channel.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow [[::channel-opts]] / [[::channel-template-opts]]; queries that do not fit them live in
;;; the channel-only section at the bottom of this namespace.

(mr/def ::channel-filters
  "Which Channels a query applies to. Keys mirror the columns of `channel`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id     {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:name   {:optional true} :string]
   [:type   {:optional true} [:or :keyword :string]]
   [:active {:optional true} :boolean]])

(mr/def ::channel-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::channel-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::channel.schema/channel.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::channel.schema/channel.column
                                              [:tuple ::channel.schema/channel.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->channel-model
  [columns]
  (u.query/model-with-columns :model/Channel columns))

(defn- ->channel-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::channel-template-filters
  "Which ChannelTemplates a query applies to. Keys mirror the columns of `channel_template`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::channel-template-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::channel-template-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::channel.schema/channel-template.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::channel.schema/channel-template.column
                                              [:tuple ::channel.schema/channel-template.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->channel-template-model
  [columns]
  (u.query/model-with-columns :model/ChannelTemplate columns))

(defn- ->channel-template-args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-channels :- [:sequential ::channel.schema/channel.partial]
  "The Channels matching `opts`."
  ([]
   (select-channels nil))
  ([{:keys [columns] :as opts} :- [:maybe ::channel-opts]]
   (apply t2/select (->channel-model columns) (->channel-args opts))))

(mu/defn select-one-channel :- [:maybe ::channel.schema/channel.partial]
  "The first Channel matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::channel-opts]]
  (apply t2/select-one (->channel-model columns) (->channel-args opts)))

(mu/defn select-channel-pk->instance :- [:map-of ms/PositiveInt ::channel.schema/channel.partial]
  "A map of id to the Channel matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::channel-opts]]
  (apply t2/select-pk->fn identity (u.query/model-with-pk-columns :model/Channel :id columns) (->channel-args opts)))

(mu/defn channel-exists? :- :boolean
  "Whether a Channel matching `opts` exists."
  [opts :- [:maybe ::channel-opts]]
  (apply t2/exists? :model/Channel (->channel-args opts)))

(mu/defn select-channel-templates :- [:sequential ::channel.schema/channel-template.partial]
  "The ChannelTemplates matching `opts`."
  ([]
   (select-channel-templates nil))
  ([{:keys [columns] :as opts} :- [:maybe ::channel-template-opts]]
   (apply t2/select (->channel-template-model columns) (->channel-template-args opts))))

(mu/defn select-one-channel-template :- [:maybe ::channel.schema/channel-template.partial]
  "The first ChannelTemplate matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::channel-template-opts]]
  (apply t2/select-one (->channel-template-model columns) (->channel-template-args opts)))

(mu/defn select-channel-template-pk->instance :- [:map-of ms/PositiveInt ::channel.schema/channel-template.partial]
  "A map of id to the ChannelTemplate matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::channel-template-opts]]
  (apply t2/select-pk->fn identity (u.query/model-with-pk-columns :model/ChannelTemplate :id columns)
         (->channel-template-args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-channel! :- ::channel.schema/channel
  "Insert the Channel `row` and return the inserted instance."
  [row :- ::channel.schema/channel.create]
  (t2/insert-returning-instance! :model/Channel row))

(mu/defn update-channels! :- :int
  "Apply `changes` to every Channel matching `opts`, returning the number updated."
  [opts    :- [:maybe ::channel-opts]
   changes :- ::channel.schema/channel.update]
  (apply t2/update! :model/Channel (conj (u.query/opts->kv-args opts) changes)))

(mu/defn insert-channel-template! :- ms/PositiveInt
  "Insert `template` and return its id."
  [template :- ::channel.schema/channel-template.create]
  (t2/insert-returning-pk! :model/ChannelTemplate template))

(mu/defn delete-channel-templates! :- :int
  "Delete every ChannelTemplate matching `opts`, returning the number deleted."
  [opts :- [:maybe ::channel-template-opts]]
  (apply t2/delete! :model/ChannelTemplate (->channel-template-args opts)))

;;; --------------------------------------- Queries used only by the channel module ---------------------------------------

(mu/defn delete-pulse-channels-for-channel!
  "Delete the PulseChannels of the Channel with `channel-id`, returning the number deleted."
  [channel-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannel :channel_id channel-id))

(mu/defn accepted-admin-emails
  "The emails of the active personal superusers who have logged in at least once, in id order."
  []
  (t2/select-fn-set :email :model/User
                    :is_superuser true
                    :is_active    true
                    :last_login   [:not= nil]
                    :type         "personal"
                    {:order-by [[:id :asc]]}))

(mu/defn user-contact-info
  "The name, email, locale, and derived common name of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id))

(mu/defn active-user-emails
  "The emails of the active Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(mu/defn user-ids-with-permission
  "The ids of the Users belonging to a PermissionsGroup that holds `permission-path`."
  [permission-path :- :string]
  (app-db/query {:select   [:pgm.user_id]
                 :from     [[:permissions_group_membership :pgm]]
                 :join     [[:permissions_group :pg] [:= :pgm.group_id :pg.id]]
                 :where    [:exists ^:allow-subquery
                            {:select [1]
                             :from   [[:permissions :p]]
                             :where  [:and
                                      [:= :p.group_id :pg.id]
                                      [:= :p.object permission-path]]}]
                 :group-by [:pgm.user_id]}))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn any-user
  "Some User, or nil."
  []
  (t2/select-one :model/User))
