(ns metabase-enterprise.security-center.db
  "Application database queries for the security-center module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn advisory :- [:maybe ::security-center.schema/security-advisory]
  "The SecurityAdvisory with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/SecurityAdvisory :id id))

(mu/defn advisory-by-advisory-id :- [:maybe ::security-center.schema/security-advisory]
  "The SecurityAdvisory with the external `advisory-id`, or nil."
  [advisory-id :- :string]
  (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id))

(mu/defn max-advisory-updated-at :- [:maybe ms/TemporalInstant]
  "The latest `updated_at` across every SecurityAdvisory, or nil when there are none."
  []
  (:updated_at (t2/query-one {:select [[[:max :updated_at] :updated_at]]
                              :from   [:security_advisory]})))

(mu/defn advisories-newest-first :- [:sequential ::security-center.schema/security-advisory]
  "Every SecurityAdvisory, newest first."
  []
  (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]}))

(mu/defn advisories-reducible
  "Reducible SecurityAdvisories."
  []
  (t2/reducible-select :model/SecurityAdvisory))

(mu/defn advisories-with-statuses-reducible
  "Reducible severity and acknowledgement time of the SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:set [:or :keyword :string]]]
  (t2/reducible-select [:model/SecurityAdvisory :severity :acknowledged_at] :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-with-statuses :- [:sequential ::security-center.schema/security-advisory]
  "The unacknowledged SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:sequential [:or :keyword :string]]]
  (t2/select :model/SecurityAdvisory :acknowledged_at nil :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-by-advisory-ids :- [:sequential ::security-center.schema/security-advisory]
  "The unacknowledged SecurityAdvisories with the external `advisory-ids`."
  [advisory-ids :- [:set :string]]
  (t2/select :model/SecurityAdvisory :advisory_id [:in advisory-ids] :acknowledged_at nil))

(mu/defn update-advisory! :- :int
  "Apply `changes` to the SecurityAdvisory with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::security-center.schema/security-advisory.update [:match_status :last_evaluated_at :acknowledged_by :acknowledged_at :last_notified_at])]
  (t2/update! :model/SecurityAdvisory id changes))

(mu/defn record-advisory-notification! :- :int
  "Set `last_notified_at` of the SecurityAdvisory with `id` to now, returning the number updated."
  [id :- ms/PositiveInt]
  (t2/update! :model/SecurityAdvisory id {:last_notified_at :%now}))

(mu/defn upsert-advisory! :- ms/PositiveInt
  "Insert or update a SecurityAdvisory by `:advisory_id`. On insert, `:match_status` starts as `:unknown` until the
  matching engine evaluates it. On update, sets `advisory`'s columns, leaving `:match_status`, `:last_evaluated_at`,
  and acknowledgement fields (which `advisory` doesn't include) untouched."
  [advisory :- ::security-center.schema/security-advisory.update]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             advisory
                             (assoc advisory :match_status :unknown)))))

(mu/defn user-summaries-by-id :- [:map-of ms/PositiveInt (mut/select-keys ::users.schema/user [:id :first_name :last_name :email])]
  "A map of ID to the ID, names, and email of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-fn->fn :id identity [:model/User :id :first_name :last_name :email] :id [:in user-ids]))
