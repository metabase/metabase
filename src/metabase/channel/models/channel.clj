(ns ^{:added "0.51.0"} metabase.channel.models.channel
  (:require
   [malli.core :as mc]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.channel.db :as channel.db]
   [metabase.channel.schema :as channel.schema]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/Channel         [_model] :channel)
(methodical/defmethod t2/table-name :model/ChannelTemplate [_model] :channel_template)

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?))

(defmethod events/spec :model/Channel
  [_model]
  {:create :event/channel-create
   :update :event/channel-update
   :delete :event/channel-delete})

(defmethod audit/spec :model/Channel [_model]
  {:track          [:id :name :description :type :active]
   :track-redacted [:details]
   :skip           []
   :topics         {:create :channel-create
                    :update :channel-update}})

(defmethod app-db-copy/spec :model/Channel [_model]
  {:skip? false})

(doto :model/ChannelTemplate
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?))

(defmethod events/spec :model/ChannelTemplate
  [_model]
  {:create :event/channel-template-create
   :update :event/channel-template-update
   :delete :event/channel-template-delete})

(defmethod app-db-copy/spec :model/ChannelTemplate [_model]
  {:skip? false})

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(def ^:private RowTimestamp
  "A `created_at`/`updated_at` column: a `java.time` value on the way out, and -- because a notification update echoes
  back the channel and template it was handed -- the ISO string it was encoded as on the way back in."
  [:maybe [:or ms/TemporalInstant ms/TemporalString]])

(defn- stringify-auth-info-keys
  "An HTTP channel's `:auth-info` is keyed by the header or parameter names the user chose, so it is string-keyed, as
  `::channel.schema/http-details` says, rather than keywordized like the rest of the details."
  [details]
  (cond-> details
    (map? (:auth-info details)) (update :auth-info update-keys u/qualified-name)))

(t2/deftransforms :model/Channel
  {:type    (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details (update (mi/transform-encrypted-json "channel.details") :out #(comp stringify-auth-info-keys %))})

(t2/deftransforms :model/ChannelTemplate
  {:channel_type  (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details       mi/transform-json})

(mr/def ::Channel
  "Channel schema."
  [:merge
   [:map {:closed true}
    [:name                         string?]
    [:type                         :keyword]
    [:active      {:optional true} :boolean]
    [:description {:optional true} [:maybe string?]]
    [:id          {:optional true} ms/PositiveInt]
    [:created_at  {:optional true} RowTimestamp]
    [:updated_at  {:optional true} RowTimestamp]]
   ::channel.schema/channel.details-by-type])

(def ^:private channel-template-entries
  "Entries every channel template has, whatever its `:channel_type`."
  [[:id           {:optional true} ms/PositiveInt]
   [:name         {:optional true} ms/NonBlankString]
   [:channel_type                  [:fn {:json-schema {:type "string"}} #(= "channel" (-> % keyword namespace))]]])

(def ^:private channel-template-row-entries
  "[[channel-template-entries]] plus the timestamps a stored template carries. Kept out of the user-provided schema
  below, which describes a request body rather than a row."
  (into channel-template-entries
        [[:created_at {:optional true} RowTimestamp]
         [:updated_at {:optional true} RowTimestamp]]))

(mr/def ::ChannelTemplate
  "Channel Template schema."
  [:merge
   (into [:map {:closed true}] channel-template-row-entries)
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :channel_type)}
    [:channel/email [:map {:closed true} [:details ::channel.schema/channel-template.email-details]]]
    [::mc/default   [:map {:closed true} [:details {:optional true} :nil]]]]])

(mr/def ::ChannelTemplateUserProvided
  "Channel Template schema for API-provided templates. Does not allow handlebars-resource."
  [:merge
   (into [:map {:closed true}] channel-template-entries)
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :channel_type)}
    [:channel/email [:map {:closed true} [:details ::channel.schema/channel-template.email-details.user-provided]]]
    [::mc/default   [:map {:closed true}]]]])

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

(defn- check-type-and-details
  "Throws a 400 unless the `:type` and `:details` of `channel`, one of which an update changes alone against the stored
  other, still fit together as [[channel.schema/channel-type->details-schema]] says."
  [{:keys [type details]}]
  (let [channel-type (some-> type keyword)
        schema       (channel.schema/channel-type->details-schema channel-type)
        details      (some-> details json/encode json/decode+kw stringify-auth-info-keys)]
    (when-not (and schema (mr/validate (if (= channel-type :channel/email) [:maybe schema] schema) details))
      (throw (ex-info (tru "The details of a channel must fit its type.") {:status-code 400})))))

(t2/define-before-update :model/Channel
  [channel]
  (let [changes       (t2/changes channel)
        deactivation? (false? (:active changes))]
    (when (not= (contains? changes :type) (contains? changes :details))
      (check-type-and-details channel))
    (when deactivation?
      (channel.db/delete-pulse-channels-for-channel! (:id channel)))
    (cond-> channel
      deactivation?
      ;; Channel.name has an unique constraint and it's a useful property for serialization
      ;; We rename deactivated channels so that new channels can reuse the name
      ;; Limit to 254 characters to avoid hitting character limit
      (assoc :name (u/truncate (format "DEACTIVATED_%d %s" (:id channel) (:name channel)) 254)))))

(defn- check-valid-channel-template
  "Throws unless `channel-template` matches [[::ChannelTemplate]]."
  [channel-template]
  (mu/validate-throw ::ChannelTemplate channel-template))

(defn- log-template-change!
  "Log template creation or update with relevant details for observability."
  [action {:keys [channel_type details] :as _instance}]
  (let [template-type (keyword (:type details))]
    (log/infof "ChannelTemplate %s: channel_type=%s template_type=%s"
               (name action) channel_type template-type)
    (analytics/inc! (case action
                      :create :metabase-notification/template-create
                      :update :metabase-notification/template-update)
                    {:channel-type channel_type})))

(t2/define-before-insert :model/ChannelTemplate
  [instance]
  (check-valid-channel-template instance)
  instance)

(t2/define-before-update :model/ChannelTemplate
  [instance]
  (when (some-> (:channel_type (t2/changes instance)) keyword (not= (keyword (:channel_type (t2/original instance)))))
    (throw (ex-info (tru "You cannot change the channel type of a channel template.") {:status-code 400})))
  (check-valid-channel-template instance)
  instance)

(t2/define-after-insert :model/ChannelTemplate
  [instance]
  (log-template-change! :create instance)
  instance)

(t2/define-after-update :model/ChannelTemplate
  [instance]
  (log-template-change! :update instance)
  instance)

;; Currently only email channel has templates, but this is extensible
(def ^:private template-channel-labels [{:channel-type :channel/email}])

(defmethod analytics.core/known-labels :metabase-notification/template-create [_] template-channel-labels)
(defmethod analytics.core/known-labels :metabase-notification/template-update [_] template-channel-labels)

;;; ----------------------------------------------------- Permissions ----------------------------------------------------

(defn- can-manage-channels?
  "Whether the current user can read, create and write Channels and ChannelTemplates: a superuser, or anyone with the
  `:setting` application permission."
  []
  (boolean
   (or (mi/superuser?)
       (perms/current-user-has-application-permissions? :setting))))

(methodical/defmethod t2/batched-hydrate [:model/Channel :can_read]
  "Whether the current user can read each of `channels`, answered once for all of them."
  [_model k channels]
  (let [answer (can-manage-channels?)]
    (for [channel channels]
      (when channel
        (vary-meta channel assoc k answer)))))

(methodical/defmethod t2/batched-hydrate [:model/Channel :can_write]
  "Whether the current user can write each of `channels`, answered once for all of them."
  [_model k channels]
  (let [answer (can-manage-channels?)]
    (for [channel channels]
      (when channel
        (assoc channel k answer)))))

(methodical/defmethod t2/batched-hydrate [:model/ChannelTemplate :can_write]
  "Whether the current user can write each of `templates`, answered once for all of them."
  [_model k templates]
  (let [answer (can-manage-channels?)]
    (for [template templates]
      (when template
        (assoc template k answer)))))

(defmethod mi/can-create? :model/Channel
  [_model _channel]
  (can-manage-channels?))

(defmethod mi/can-create? :model/ChannelTemplate
  [_model _template]
  (can-manage-channels?))

(methodical/defmethod mi/to-json :model/Channel
  "Only include `:details` for callers who can write the channel, matching `remove-details-if-needed` in the channel
  API. Encoding at the model boundary keeps every response that returns a Channel consistent."
  [channel json-generator]
  (next-method (if (mi/can-write? (t2/hydrate channel :can_write))
                 channel
                 (dissoc channel :details))
               json-generator))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- storage-paths
  "The storage path of each of the Channel `entities`, under `channels/` by name."
  [entities _ctx]
  (mapv (fn [channel]
          [{:label "channels"} {:label (:name channel) :key (:name channel)}])
        entities))

(defmethod serialization/spec :model/Channel [_]
  {:schema        ::channel.schema/external-channel
   :identity      [:name]
   :copy          [:name :description :type :details :active]
   :defaults      {:active true}
   :storage-paths storage-paths
   :rows-by-refs  serialization/channel-rows-by-refs})
