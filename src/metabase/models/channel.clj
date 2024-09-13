(ns ^{:added "0.51.0"} metabase.models.channel
  (:require
   [metabase.models.audit-log :as audit-log]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
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
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;; ------------------------------------------------------------------------------------------------;;
;;                                           :model/Channel                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/Channel
  {:type    (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details mi/transform-encrypted-json})

(defmethod mi/can-write? :model/Channel
  [& _]
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

(defmethod audit-log/model-details :model/Channel
  [channel _event-type]
  (select-keys channel [:id :name :description :type :active]))


(defmethod serdes/entity-id "Channel" [_ {:keys [name]}] name)

(defmethod serdes/hash-fields :model/Channel         [_instance] [:name :type])

(defmethod serdes/make-spec "Channel"
  [_model-name _opts]
  {:copy      [:name :description :type :details :active]
   :transform {:created_at (serdes/date)}})
;; ------------------------------------------------------------------------------------------------;;
;;                                       :model/ChannelTemplate                                    ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/ChannelTemplate
  {:channel_type  (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))
   :details       mi/transform-json})

(def ^:private channel-template-details-type
  #{:email/mustache
    :email/resource})

(def ^:private ChannelTemplateEmailDetails
  [:merge
   [:map
    [:type    (into [:enum] (concat channel-template-details-type (map u/qualified-name channel-template-details-type)))]
    [:subject string?]]
   [:multi {:dispatch (comp keyword :type)}
    [:email/resource
     [:map
      [:path string?]]]
    [:email/mustache
     [:map
      [:body string?]]]]])

(def ^:private ChannelTemplate
  [:merge
   [:map
    [:channel_type [:fn #(= "channel" (-> % keyword namespace))]]]
   [:multi {:dispatch :channel_type}
    [:channel/email
     [:map
      [:details ChannelTemplateEmailDetails]]]]])

(defn- check-valid-channel-template
  [channel-template]
  (mu/validate-throw ChannelTemplate channel-template))

(t2/define-before-insert :model/ChannelTemplate
  [instance]
  (check-valid-channel-template instance)
  instance)

(t2/define-before-update :model/ChannelTemplate
  [instance]
  (check-valid-channel-template instance)
  instance)

(defmethod mi/can-write? :model/ChannelTemplate
  [& _]
  (or (mi/superuser?)
      (perms/current-user-has-application-permissions? :setting)))

(defmethod serdes/hash-fields :model/ChannelTemplate [_instance] [:name :channel_type :details])

(defmethod serdes/make-spec "ChannelTemplate"
  [_model-name _opts]
  {:copy      [:name :channel_type :details :entity_id]
   :transform {:created_at (serdes/date)}})
