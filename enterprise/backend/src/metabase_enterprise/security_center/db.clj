(ns metabase-enterprise.security-center.db
  "Application database queries for the security-center module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn advisory :- [:maybe (ms/InstanceOf :model/SecurityAdvisory)]
  "The SecurityAdvisory with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/SecurityAdvisory :id id))

(mu/defn advisory-by-advisory-id :- [:maybe (ms/InstanceOf :model/SecurityAdvisory)]
  "The SecurityAdvisory with the external `advisory-id`, or nil."
  [advisory-id :- :string]
  (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id))

(mu/defn max-advisory-updated-at :- [:maybe ms/TemporalInstant]
  "The latest `updated_at` across every SecurityAdvisory, or nil when there are none."
  []
  (:updated_at (t2/query-one {:select [[[:max :updated_at] :updated_at]]
                              :from   [:security_advisory]})))

(mu/defn advisories-newest-first :- [:sequential (ms/InstanceOf :model/SecurityAdvisory)]
  "Every SecurityAdvisory, newest first."
  []
  (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]}))

(mu/defn advisories-reducible
  "Reducible SecurityAdvisories."
  []
  (t2/reducible-select :model/SecurityAdvisory))

(mu/defn advisories-with-statuses-reducible
  "Reducible severity and acknowledgement time of the SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:seqable [:or :keyword :string]]]
  (t2/reducible-select [:model/SecurityAdvisory :severity :acknowledged_at] :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-with-statuses :- [:sequential (ms/InstanceOf :model/SecurityAdvisory)]
  "The unacknowledged SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:seqable [:or :keyword :string]]]
  (t2/select :model/SecurityAdvisory :acknowledged_at nil :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-by-advisory-ids :- [:sequential (ms/InstanceOf :model/SecurityAdvisory)]
  "The unacknowledged SecurityAdvisories with the external `advisory-ids`."
  [advisory-ids :- [:seqable :string]]
  (t2/select :model/SecurityAdvisory :advisory_id [:in advisory-ids] :acknowledged_at nil))

(mu/defn update-advisory! :- :int
  "Apply `changes` to the SecurityAdvisory with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:match_status      {:optional true} :keyword]
               [:last_evaluated_at {:optional true} :any]
               [:acknowledged_by   {:optional true} [:maybe ms/PositiveInt]]
               [:acknowledged_at   {:optional true} :any]
               [:last_notified_at  {:optional true} :any]]]
  (t2/update! :model/SecurityAdvisory id changes))

(mu/defn upsert-advisory! :- ms/PositiveInt
  "Insert or update a SecurityAdvisory by `:advisory_id`. On insert, `:match_status` starts as `:unknown` until the
  matching engine evaluates it. On update, sets `advisory`'s columns, leaving `:match_status`, `:last_evaluated_at`,
  and acknowledgement fields (which `advisory` doesn't include) untouched."
  [advisory :- [:map {:closed true}
                [:advisory_id       :string]
                [:title             :string]
                [:severity          :string]
                [:description       :string]
                [:advisory_url      {:optional true} [:maybe :string]]
                [:remediation       :string]
                [:affected_versions :any]
                [:download_jar_urls {:optional true} :any]
                [:matching_query    :any]
                [:published_at      ms/TemporalInstant]
                [:updated_at        ms/TemporalInstant]]]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             advisory
                             (assoc advisory :match_status :unknown)))))

(mu/defn user-summaries-by-id :- [:map-of ms/PositiveInt [:map {:closed true}
                                                          [:id          ms/PositiveInt]
                                                          [:first_name  [:maybe :string]]
                                                          [:last_name   [:maybe :string]]
                                                          [:email       :string]
                                                          ;; added by the User model's post-select hook
                                                          [:common_name {:optional true} [:maybe :string]]]]
  "A map of ID to the ID, names, and email of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :id identity [:model/User :id :first_name :last_name :email] :id [:in user-ids]))
