(ns metabase-enterprise.security-center.models.security-advisory
  (:require
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
   :matching_query    mi/transform-json})

(methodical/defmethod t2/batched-hydrate [:model/SecurityAdvisory :acknowledged_by]
  "Hydrate `acknowledged_by` from an int FK to a `{:user_id, :name}` map."
  [_model k advisories]
  (let [user-ids (keep :acknowledged_by advisories)
        id->user (when (seq user-ids)
                   (into {}
                         (map (juxt :id (fn [{:keys [id first_name last_name]}]
                                          {:user_id id
                                           :name    (str first_name " " last_name)})))
                         (t2/select [:model/User :id :first_name :last_name]
                                    :id [:in (set user-ids)])))]
    (mi/instances-with-hydrated-data
     advisories k
     (constantly id->user)
     :acknowledged_by {:default nil})))

(defn acknowledge!
  "Acknowledge a security advisory. Sets `acknowledged_by` and `acknowledged_at`,
   and publishes an audit event. Returns the updated advisory with `:acknowledged_by` hydrated."
  [advisory user-id]
  (let [now (mi/now)]
    (t2/update! :model/SecurityAdvisory (:id advisory)
                {:acknowledged_by user-id
                 :acknowledged_at now})
    (events/publish-event! :event/security-advisory-acknowledge
                           {:object  advisory
                            :user-id user-id})
    (-> (t2/select-one :model/SecurityAdvisory :id (:id advisory))
        (t2/hydrate :acknowledged_by))))
