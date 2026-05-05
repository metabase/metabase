(ns ^{:added "0.51.0"} metabase.channel.models.channel
  (:require
   [malli.core :as mc]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.channel.template.handlebars :as handlebars]
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
   :details mi/transform-encrypted-json})

(mr/def ::Channel
  "Channel schema."
  [:map
   [:name                         string?]
   [:type                         :keyword]
   [:details                      :map]
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

(t2/define-before-update :model/Channel
  [instance]
  (let [deactivation? (false? (:active (t2/changes instance)))]
    (when deactivation?
      (t2/delete! :model/PulseChannel :channel_id (:id instance)))
    (cond-> instance
      deactivation?
      ;; Channel.name has an unique constraint and it's a useful property for serialization
      ;; We rename deactivated channels so that new channels can reuse the name
      ;; Limit to 254 characters to avoid hitting character limit
      (assoc :name (u/truncate (format "DEACTIVATED_%d %s" (:id instance) (:name instance)) 254)))))

(defmethod serdes/entity-id "Channel" [_ {:keys [name]}] name)

(defmethod serdes/hash-fields :model/Channel [_instance] [:name :type])

(defmethod serdes/load-find-local "Channel"
  [path]
  (t2/select-one :model/Channel :name (:id (last path))))

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
   [:multi {:dispatch (comp keyword :type)}
    [:email/handlebars-resource
     [:map
      [:path [:and
              string?
              [:fn {:error/message "invalid template path"}
               handlebars/valid-template-path?]]]]]
    [:email/handlebars-text
     [:map
      [:body string?]]]]])

(mr/def ::ChannelTemplate
  "Channel Template schema."
  [:merge
   [:map
    [:channel_type [:fn #(= "channel" (-> % keyword namespace))]]]
   [:multi {:dispatch :channel_type}
    [:channel/email
     [:map
      [:details ::ChannelTemplateEmailDetails]]]
    [::mc/default :any]]])

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
   [:map
    [:channel_type [:fn #(= "channel" (-> % keyword namespace))]]]
   [:multi {:dispatch :channel_type}
    [:channel/email
     [:map
      [:details ::ChannelTemplateEmailDetailsUserProvided]]]
    [::mc/default :any]]])

(defn- check-valid-channel-template
  [channel-template]
  (mu/validate-throw ::ChannelTemplate channel-template))

(defn- user-provided-template?
  "Returns true if the template details represent a user-provided inline template (handlebars-text)
  as opposed to a built-in resource template."
  [details]
  (= :email/handlebars-text (keyword (:type details))))

(defn- log-template-change!
  "Log template creation or update with relevant details for observability."
  [action {:keys [channel_type details] :as _instance}]
  (let [template-type (keyword (:type details))]
    (if (user-provided-template? details)
      (log/infof "ChannelTemplate %s: channel_type=%s template_type=%s user_id=%s body=%s"
                 (name action) channel_type template-type api/*current-user-id* (pr-str (:body details)))
      (log/infof "ChannelTemplate %s: channel_type=%s template_type=%s user_id=%s"
                 (name action) channel_type template-type api/*current-user-id*))
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
