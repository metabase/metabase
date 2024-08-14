(ns ^{:added "0.51.0"} metabase.models.channel
  (:require
   [metabase.models.audit-log :as audit-log]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Channel [_model] :channel)

(defmethod mi/can-write? :model/Channel
  [& _]
  (or (mi/superuser?)
      (perms/current-user-has-application-permissions? :setting)))

(defmethod serdes/entity-id "Channel"
  [_ {:keys [name]}]
  name)

(defmethod serdes/hash-fields :model/Channel
  [_database]
  [:name :type])

(doto :model/Channel
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Channel
  {:type    mi/transform-keyword
   :details mi/transform-encrypted-json})

(defn- assert-channel-type
  [{channel-type :type}]
  (when-not (= "channel" (-> channel-type keyword namespace))
    (throw (ex-info "Channel type must be a namespaced keyword like :channel/http" {:status-code  400
                                                                                    :channel-type channel-type}))))

(t2/define-before-insert :model/Channel
  [instance]
  (assert-channel-type instance)
  instance)

(t2/define-before-update :model/Channel
  [instance]
  (let [deactivated? (false? (:active (t2/changes instance)))]
    (assert-channel-type instance)
    (when deactivated?
      (t2/delete! :model/PulseChannel :channel_id (:id instance)))
    (cond-> instance
      deactivated?
      ;; Channel.name has an unique constraint and it's an useful property for serialization
      ;; So we rename deactivated channels so new channel can reuse the name
      ;; Limit to 254 characters to avoid hitting character limit
      (assoc :name (subs (format "DEACTIVATED_%d %s" (:id instance) (:name instance)) 0 254)))))

(defmethod audit-log/model-details :model/Channel
  [channel _event-type]
  (select-keys channel [:id :name :description :type :active]))
