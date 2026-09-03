(ns metabase-enterprise.security-center.db
  "Application database queries for the security-center module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [toucan2.core :as t2]))

(defn advisory
  "The SecurityAdvisory with `id`, or nil."
  [id]
  (t2/select-one :model/SecurityAdvisory :id id))

(defn advisory-by-advisory-id
  "The SecurityAdvisory with the external `advisory-id`, or nil."
  [advisory-id]
  (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id))

(defn advisories-newest-first
  "Every SecurityAdvisory, newest first."
  []
  (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]}))

(defn advisories-reducible
  "Reducible SecurityAdvisories."
  []
  (t2/reducible-select :model/SecurityAdvisory))

(defn advisories-with-statuses-reducible
  "Reducible severity and acknowledgement time of the SecurityAdvisories whose match status is one of `statuses`."
  [statuses]
  (t2/reducible-select [:model/SecurityAdvisory :severity :acknowledged_at] :match_status [:in statuses]))

(defn unacknowledged-advisories-with-statuses
  "The unacknowledged SecurityAdvisories whose match status is one of `statuses`."
  [statuses]
  (t2/select :model/SecurityAdvisory :acknowledged_at nil :match_status [:in statuses]))

(defn unacknowledged-advisories-by-advisory-ids
  "The unacknowledged SecurityAdvisories with the external `advisory-ids`."
  [advisory-ids]
  (t2/select :model/SecurityAdvisory :advisory_id [:in advisory-ids] :acknowledged_at nil))

(defn update-advisory!
  "Apply `changes` to the SecurityAdvisory with `id`."
  [id changes]
  (t2/update! :model/SecurityAdvisory id changes))

(defn user-summaries-by-id
  "A map of ID to the ID, names, and email of the Users with `user-ids`."
  [user-ids]
  (t2/select-fn->fn :id identity [:model/User :id :first_name :last_name :email] :id [:in user-ids]))

(defn hydrate-acknowledged-by-user
  "Hydrate `:acknowledged_by_user` onto `advisories`."
  [advisories]
  (t2/hydrate advisories :acknowledged_by_user))

(defn hydrate-recipients-detail
  "Hydrate `:recipients-detail` onto `recipients`."
  [recipients]
  (t2/hydrate recipients :recipients-detail))
