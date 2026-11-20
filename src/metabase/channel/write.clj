(ns metabase.channel.write
  "The write functions of Channels and ChannelTemplates, through which every writer creates, updates and deletes them."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.channel.db :as channel.db]
   [metabase.channel.schema :as channel.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- stringify-auth-info-keys
  "An HTTP channel's `:auth-info` is keyed by the header or parameter names the user chose, so it is string-keyed, as
  `::channel.schema/http-details` says, rather than keywordized like the rest of the details."
  [details]
  (cond-> details
    (map? (:auth-info details)) (update :auth-info update-keys u/qualified-name)))

(defn- check-type-and-details
  "Throws a 400 unless the `:type` and `:details` of `channel`, one of which an update changes alone against the stored
  other, still fit together as [[channel.schema/channel-type->details-schema]] says."
  [{:keys [type details]}]
  (let [channel-type (some-> type keyword)
        schema       (channel.schema/channel-type->details-schema channel-type)
        details      (some-> details json/encode json/decode+kw stringify-auth-info-keys)]
    (when-not (and schema (mr/validate (if (= channel-type :channel/email) [:maybe schema] schema) details))
      (throw (ex-info (tru "The details of a channel must fit its type.") {:status-code 400})))))

(defn check-valid-channel-template
  "Throws unless `channel-template` matches `:metabase.channel.models.channel/ChannelTemplate`."
  [channel-template]
  (mu/validate-throw :metabase.channel.models.channel/ChannelTemplate channel-template))

(defn log-template-change!
  "Log template creation or update with relevant details for observability."
  [action {:keys [channel_type details] :as _instance}]
  (let [template-type (keyword (:type details))]
    (log/infof "ChannelTemplate %s: channel_type=%s template_type=%s"
               (name action) channel_type template-type)
    (analytics/inc! (case action
                      :create :metabase-notification/template-create
                      :update :metabase-notification/template-update)
                    {:channel-type channel_type})))

;;; --------------------------------------------------- Channel ----------------------------------------------------

(mu/defn create-channel!
  "Insert the Channel `row`, whose after-insert hook publishes its create event, returning the inserted Channel; for the
  REST API."
  [row :- ::channel.schema/channel.update]
  (events/with-batched-events
    (channel.db/insert-channel! row)))

(defn- check-channel-changes
  "Throws a 400 unless `channel`, a Channel as an update leaves it, has the `:type` and `:details` that fit together,
  when `changes` change one of them alone."
  [channel changes]
  (when (not= (contains? changes :type) (contains? changes :details))
    (check-type-and-details channel)))

(defn- derived-columns
  "`changes` to `channel` with the name a deactivated Channel gets, which frees the name for a new Channel, and the time of
  the update."
  [channel changes]
  (let [merged (merge channel changes)]
    (cond-> changes
      (false? (:active changes)) (assoc :name (u/truncate (format "DEACTIVATED_%d %s" (:id merged) (:name merged)) 254))
      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))))

(mu/defn update-channel! :- :int
  "Apply `changes` to `channel-or-id`, a Channel the caller already loaded or the id of one, and publish its update
  event, deleting the PulseChannels of a Channel it deactivates, returning the number of Channels updated; for the REST
  API and the SerDes import, whose `:import?` changes nothing, as master's hooks checked imports too."
  [channel-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::channel.schema/channel.changes
   _opts         :- ::channel.schema/write-opts]
  (let [channel (if (map? channel-or-id) channel-or-id (channel.db/channel channel-or-id))
        changes (when channel (changed channel changes))]
    (if (empty? changes)
      0
      (do
        (check-channel-changes (merge channel changes) changes)
        (let [changes (derived-columns channel changes)]
          (events/with-batched-events
            (when (false? (:active changes))
              ((:delete! (mi/write-fns :model/PulseChannel)) (channel.db/pulse-channel-ids-for-channel (:id channel)) {}))
            (u/prog1 (channel.db/update-channel! (:id channel) changes)
              (events/updated! :model/Channel (merge channel changes) channel))))))))

(mu/defn delete-channels! :- :int
  "Delete the Channels with `ids` and publish their delete events, returning the number deleted; for remote sync and
  the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::channel.schema/write-opts]
  (let [channels (when (seq ids) (channel.db/channels-with-ids ids))]
    (if (empty? channels)
      0
      (events/with-batched-events
        (events/deleting! :model/Channel channels
                          #(channel.db/delete-channels! (mapv :id channels)))))))

;;; ----------------------------------------------- ChannelTemplate ------------------------------------------------

(defn- check-template-changes
  "Throws unless `changes` to `template` are an update a ChannelTemplate allows."
  [template changes]
  (when (some-> (:channel_type changes) keyword (not= (keyword (:channel_type template))))
    (throw (ex-info (tru "You cannot change the channel type of a channel template.") {:status-code 400})))
  (check-valid-channel-template (merge template changes)))

(mu/defn update-channel-template! :- :int
  "Apply `changes` to `template-or-id`, a ChannelTemplate the caller already loaded or the id of one, publish its update
  event and log the change, returning the number of ChannelTemplates updated; for notification updates and the SerDes
  import."
  [template-or-id :- [:or ms/PositiveInt :map]
   changes        :- ::channel.schema/channel-template.changes
   _opts          :- ::channel.schema/write-opts]
  (let [template (if (map? template-or-id) template-or-id (channel.db/channel-template template-or-id))
        changes  (when template (changed template changes))]
    (if (empty? changes)
      0
      (do
        (check-template-changes template changes)
        (let [changes (cond-> changes
                        (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
          (events/with-batched-events
            (u/prog1 (channel.db/update-channel-template! (:id template) changes)
              (events/updated! :model/ChannelTemplate (merge template changes) template)
              (log-template-change! :update (merge template changes)))))))))

(mu/defn delete-channel-templates! :- :int
  "Delete the ChannelTemplates with `ids` and publish their delete events, returning the number deleted; for the
  notification module and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::channel.schema/write-opts]
  (let [templates (when (seq ids) (channel.db/channel-templates-with-ids ids))]
    (if (empty? templates)
      0
      (events/with-batched-events
        (events/deleting! :model/ChannelTemplate templates
                          #(channel.db/delete-channel-templates! (mapv :id templates)))))))

;;; ------------------------------------------------ Generic writers -------------------------------------------------

(defmethod mi/write-fns :model/Channel
  [_model]
  {:update! update-channel!
   :delete! delete-channels!})

(defmethod mi/write-fns :model/ChannelTemplate
  [_model]
  {:update! update-channel-template!
   :delete! delete-channel-templates!})
