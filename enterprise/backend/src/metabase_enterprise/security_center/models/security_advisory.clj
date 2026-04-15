(ns metabase-enterprise.security-center.models.security-advisory
  (:require
   [metabase.analytics.snowplow :as snowplow]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SecurityAdvisory [_model] :security_advisory)

(doto :model/SecurityAdvisory
  (derive :metabase/model))

(t2/deftransforms :model/SecurityAdvisory
  {:severity          mi/transform-keyword
   :match_status      mi/transform-keyword
   :affected_versions mi/transform-json
   ;; EDN because HoneySQL treats keywords as identifiers and strings as values.
   :matching_query    mi/transform-edn})

(t2/define-before-insert :model/SecurityAdvisory
  [advisory]
  (assoc advisory :fetched_at (mi/now)))

(methodical/defmethod t2/batched-hydrate [:model/SecurityAdvisory :acknowledged_by_user]
  "Hydrate `:acknowledged_by_user` from the `:acknowledged_by` FK to a User map with `:id`, `:common_name`, and `:email`."
  [_model k advisories]
  (let [user-ids (keep :acknowledged_by advisories)
        id->user (when (seq user-ids)
                   (t2/select-fn->fn :id #(select-keys % [:id :common_name :email])
                                     [:model/User :id :first_name :last_name :email]
                                     :id [:in (set user-ids)]))]
    (mi/instances-with-hydrated-data
     advisories k
     (constantly id->user)
     :acknowledged_by {:default nil})))

(defn acknowledge!
  "Acknowledge a security advisory. Sets `acknowledged_by` and `acknowledged_at`,
   and publishes an audit event. Returns the updated advisory with `:acknowledged_by` hydrated.
   Throws if already acknowledged."
  [advisory user-id]
  (when (:acknowledged_at advisory)
    (throw (ex-info "Advisory already acknowledged" {:status-code 409})))
  (let [now (mi/now)]
    (t2/update! :model/SecurityAdvisory (:id advisory)
                {:acknowledged_by user-id
                 :acknowledged_at now})
    (events/publish-event! :event/security-advisory-acknowledge
                           {:object  advisory
                            :user-id user-id})
    (snowplow/track-event! :snowplow/simple_event
                           {:event        "security_advisory_acknowledged"
                            :event_detail (name (:severity advisory))})
    (-> (t2/select-one :model/SecurityAdvisory :id (:id advisory))
        (t2/hydrate :acknowledged_by_user))))

(defn acknowledge-many!
  "Acknowledge multiple security advisories by their advisory_id strings. Skips already-acknowledged
   advisories. Returns a sequence of updated advisories with `:acknowledged_by` hydrated."
  [advisory-ids user-id]
  (let [advisories (t2/select :model/SecurityAdvisory :advisory_id [:in (set advisory-ids)] :acknowledged_at nil)]
    (mapv #(acknowledge! % user-id) advisories)))
