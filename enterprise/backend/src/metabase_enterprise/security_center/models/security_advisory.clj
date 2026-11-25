(ns metabase-enterprise.security-center.models.security-advisory
  (:require
   [malli.util :as mut]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SecurityAdvisory [_model] :security_advisory)

(doto :model/SecurityAdvisory
  (derive :metabase/model))

(t2/deftransforms :model/SecurityAdvisory
  {:severity          mi/transform-keyword
   :match_status      mi/transform-keyword
   :affected_versions mi/transform-json
   :download_jar_urls mi/transform-json
   ;; EDN because HoneySQL treats keywords as identifiers and strings as values.
   :matching_query    mi/transform-edn})

(t2/define-before-insert :model/SecurityAdvisory
  [advisory]
  (assoc advisory :fetched_at (mi/now)))

(t2/define-before-update :model/SecurityAdvisory
  [advisory]
  (let [changes (t2/changes advisory)]
    (cond-> advisory
      (and (some? (:acknowledged_by changes)) (not (contains? changes :acknowledged_at)))
      (assoc :acknowledged_at (mi/now)))))

(methodical/defmethod t2/batched-hydrate [:model/SecurityAdvisory :acknowledged_by_user]
  "Hydrate `:acknowledged_by_user` from the `:acknowledged_by` FK to a User map with `:id`, `:common_name`, and `:email`."
  [_model k advisories]
  (let [user-ids (keep :acknowledged_by advisories)
        id->user (when (seq user-ids)
                   (update-vals (security-center.db/user-summaries-by-id (set user-ids))
                                #(select-keys % [:id :common_name :email])))]
    (mi/instances-with-hydrated-data
     advisories k
     (constantly id->user)
     :acknowledged_by {:default nil})))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-advisory!
  "Insert or update a SecurityAdvisory by `:advisory_id`, starting `:match_status` as `:unknown` on insert, and on
  update setting only the columns of `advisory`, so that `:match_status`, `:last_evaluated_at` and the acknowledgement
  fields stay untouched."
  [advisory :- ::security-center.schema/security-advisory.update]
  (security-center.db/upsert-advisory! advisory))

(mu/defn record-advisory-evaluation!
  "Apply `changes` to the SecurityAdvisory with `id` and stamp `last_evaluated_at` with now, returning the number
  updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::security-center.schema/security-advisory.update [:match_status :acknowledged_by :acknowledged_at])]
  (security-center.db/record-advisory-evaluation! id changes))

(mu/defn record-advisory-notification!
  "Set `last_notified_at` of the SecurityAdvisory with `id` to now, returning the number updated."
  [id :- ms/PositiveInt]
  (security-center.db/record-advisory-notification! id))

(mu/defn acknowledge!
  "Acknowledge a security advisory. Sets `acknowledged_by` and `acknowledged_at`,
   and publishes an audit event. Returns the updated advisory with `:acknowledged_by` hydrated.
   Throws if already acknowledged."
  [advisory :- [:map [:id ms/PositiveInt]]
   user-id  :- ::lib.schema.id/user]
  (when (:acknowledged_at advisory)
    (throw (ex-info "Advisory already acknowledged" {:status-code 409})))
  (security-center.db/update-advisory! (:id advisory) {:acknowledged_by user-id})
  (events/publish-event! :event/security-advisory-acknowledge
                         {:object  advisory
                          :user-id user-id})
  (analytics/track-event! :snowplow/simple_event
                          {:event        "security_advisory_acknowledged"
                           :event_detail (name (:severity advisory))})
  (-> (security-center.db/advisory (:id advisory))
      (t2/hydrate :acknowledged_by_user)))

(mu/defn acknowledge-security-advisories!
  "Acknowledge the security advisories with the given advisory_id strings, skipping the already acknowledged, and
  return the updated advisories with `:acknowledged_by` hydrated."
  [advisory-ids :- [:or [:sequential :string] [:set :string]]
   user-id      :- ::lib.schema.id/user]
  (let [advisories (security-center.db/unacknowledged-advisories-by-advisory-ids (set advisory-ids))
        ids        (mapv :id advisories)]
    (if (empty? advisories)
      []
      (do
        (when-let [changed-ids (not-empty (into [] (comp (remove #(= user-id (:acknowledged_by %))) (map :id)) advisories))]
          (security-center.db/update-advisories! changed-ids {:acknowledged_by user-id}))
        (events/publish-event! :event/security-advisory-acknowledge
                               {:objects advisories
                                :user-id user-id})
        (doseq [advisory advisories]
          (analytics/track-event! :snowplow/simple_event
                                  {:event        "security_advisory_acknowledged"
                                   :event_detail (name (:severity advisory))}))
        (mapv (u/index-by :id (t2/hydrate (security-center.db/advisories-by-ids ids) :acknowledged_by_user)) ids)))))

(defenterprise replace-security-advisories!
  "Delete every SecurityAdvisory and insert `advisories`, returning the inserted instances, which the testing API
  seeds."
  :feature :none
  [advisories]
  (security-center.db/delete-all-advisories!)
  (security-center.db/insert-advisories! advisories))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SecurityAdvisory [_model]
  {:skip? true})
