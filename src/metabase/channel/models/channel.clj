(ns ^{:added "0.51.0"} metabase.channel.models.channel
  (:require
   [malli.core :as mc]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Channel         [_model] :channel)
(methodical/defmethod t2/table-name :model/ChannelTemplate [_model] :channel_template)

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/timestamped?))

(doto :model/ChannelTemplate
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; ------------------------------------------------------------------------------------------------;;
;;                                           :model/Channel                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/Channel
  {:type    (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details (mi/transform-encrypted-json "channel.details")})

(mr/def ::Channel
  "Channel schema."
  [:map
   [:name                         string?]
   [:type                         :keyword]
   ;; per-channel-type connection config (a Slack token, an HTTP url and auth, ...) -- free-form like database details
   [:details                      ms/Map]
   [:active      {:optional true} :boolean]
   [:description {:optional true} [:maybe string?]]])

(defmethod mi/can-write? :model/Channel
  [& _]
  (or (mi/superuser?)
      (perms/current-user-has-application-permissions? :setting)))

(defmethod mi/can-read? :model/Channel
  [_channel]
  (or (mi/superuser?)
      (perms/current-user-has-application-permissions? :setting)))

(methodical/defmethod mi/to-json :model/Channel
  "Only include `:details` for callers who can write the channel, matching `remove-details-if-needed` in the channel
  API. Encoding at the model boundary keeps every response that returns a Channel consistent."
  [channel json-generator]
  (next-method (if (mi/can-write? channel)
                 channel
                 (dissoc channel :details))
               json-generator))

(t2/define-before-update :model/Channel
  [instance]
  (let [deactivation? (false? (:active (t2/changes instance)))]
    (when deactivation?
      (t2/delete! :model/PulseChannel 'channel_id (:id instance)))
    (cond-> instance
      deactivation?
      ;; Channel.name has an unique constraint and it's a useful property for serialization
      ;; We rename deactivated channels so that new channels can reuse the name
      ;; Limit to 254 characters to avoid hitting character limit
      (assoc :name (u/truncate (format "DEACTIVATED_%d %s" (:id instance) (:name instance)) 254)))))

(defmethod serdes/entity-id "Channel" [_ {:keys [name]}] name)

(defmethod serdes/load-find-local "Channel"
  [path]
  (t2/select-one :model/Channel 'name (:id (last path))))

(defmethod serdes/generate-path "Channel" [_ channel]
  [(serdes/infer-self-path "Channel" channel)])

(defmethod serdes/storage-path "Channel" [channel _ctx]
  [{:label "channels"} {:label (:name channel) :key (serdes/entity-id "Channel" channel)}])

(defmethod serdes/make-spec "Channel"
  [_model-name _opts]
  {:copy           [:name :description :type :details :active]
   :transform      {:created_at (serdes/date)}
   :defaults {:active true}})

;; ------------------------------------------------------------------------------------------------;;
;;                                       :model/ChannelTemplate                                    ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/ChannelTemplate
  {:channel_type  (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details       mi/transform-json})

(def ^:private channel-template-details-type
  #{:email/handlebars-text
    :email/handlebars-resource})

(mr/def ::ChannelTemplateEmailDetails
  [:merge
   [:map
    [:type                            (apply ms/enum-keywords-and-strings channel-template-details-type)]
    [:subject                         string?]
    [:recipient-type {:optional true} (ms/enum-keywords-and-strings :cc :bcc)]]
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :type)}
    [:email/handlebars-resource
     [:map
      [:path [:and
              string?
              [:fn {:error/message "invalid template path"}
               handlebars/valid-template-name?]]]]]
    [:email/handlebars-text
     [:map
      [:body string?]]]]])

(def ^:private channel-template-entries
  "Entries every channel template has, whatever its `:channel_type`."
  [[:id           {:optional true} ms/PositiveInt]
   [:name         {:optional true} ms/NonBlankString]
   [:channel_type                  [:fn #(= "channel" (-> % keyword namespace))]]])

(mr/def ::ChannelTemplate
  "Channel Template schema."
  [:merge
   (into [:map] channel-template-entries)
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :channel_type)}
    [:channel/email [:map [:details ::ChannelTemplateEmailDetails]]]
    [::mc/default   [:map]]]])

(mr/def ::ChannelTemplateEmailDetailsUserProvided
  "Email template details schema for API-provided templates. Only handlebars-text is allowed;
  handlebars-resource is restricted to internal use only."
  [:map
   [:type    (ms/enum-keywords-and-strings :email/handlebars-text)]
   [:subject string?]
   [:recipient-type {:optional true} (ms/enum-keywords-and-strings :cc :bcc)]
   [:body    string?]])

(mr/def ::ChannelTemplateUserProvided
  "Channel Template schema for API-provided templates. Does not allow handlebars-resource."
  [:merge
   (into [:map] channel-template-entries)
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :channel_type)}
    [:channel/email [:map [:details ::ChannelTemplateEmailDetailsUserProvided]]]
    [::mc/default   [:map]]]])

(defn- check-valid-channel-template
  [channel-template]
  (mu/validate-throw ::ChannelTemplate channel-template))

(defn- log-template-change!
  "Log template creation or update with relevant details for observability."
  [action {:keys [channel_type details] :as _instance}]
  (let [template-type (keyword (:type details))]
    (log/infof "ChannelTemplate %s: channel_type=%s template_type=%s user_id=%s"
               (name action) channel_type template-type api/*current-user-id*)
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

(defmethod mi/can-write? :model/ChannelTemplate
  [& _]
  (or (mi/superuser?)
      (perms/current-user-has-application-permissions? :setting)))
