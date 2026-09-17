(ns metabase-enterprise.security-center.db
  "Application database queries for `:model/SecurityAdvisory`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace runs a SecurityAdvisory query itself (model definitions still use
  `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::match-status
  [:or :keyword :string])

(mr/def ::security-advisory-filters
  "Which SecurityAdvisories a query applies to. Keys mirror the columns of `security_advisory`: a scalar matches that
  value and a set matches any of its values. `:acknowledged_at_set` matches the rows where `:acknowledged_at` is set
  (`true`) or null (`false`)."
  [:map {:closed true}
   [:id                  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:advisory_id         {:optional true} [:or :string [:set :string]]]
   [:match_status        {:optional true} [:or ::match-status [:set ::match-status]]]
   [:acknowledged_at_set {:optional true} :boolean]])

(mr/def ::security-advisory-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::security-advisory-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::security-center.schema/security-advisory.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::security-center.schema/security-advisory.column
                                              [:tuple ::security-center.schema/security-advisory.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:acknowledged_at_set :acknowledged_at})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/SecurityAdvisory columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:set-columns set-columns}))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns set-columns}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-security-advisories :- [:sequential ::security-center.schema/security-advisory.partial]
  "The SecurityAdvisories matching `opts`."
  ([]
   (select-security-advisories nil))
  ([{:keys [columns] :as opts} :- [:maybe ::security-advisory-opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn reducible-select-security-advisories
  "A reducible of the SecurityAdvisories matching `opts`."
  ([]
   (reducible-select-security-advisories nil))
  ([{:keys [columns] :as opts} :- [:maybe ::security-advisory-opts]]
   (apply t2/reducible-select (->model columns) (->args opts))))

(mu/defn select-one-security-advisory :- [:maybe ::security-center.schema/security-advisory.partial]
  "The first SecurityAdvisory matching `opts`, or nil."
  [opts :- [:maybe ::security-advisory-opts]]
  (apply t2/select-one :model/SecurityAdvisory (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn update-security-advisories! :- :int
  "Apply `changes` to every SecurityAdvisory matching `opts`, returning the number updated."
  [opts    :- [:maybe ::security-advisory-opts]
   changes :- ::security-center.schema/security-advisory.update]
  (apply t2/update! :model/SecurityAdvisory (conj (->kv-args opts) changes)))

;;; ------------------------------- Queries used only by the security-center module -------------------------------

(mu/defn max-security-advisory-updated-at :- [:maybe ms/TemporalInstant]
  "The latest `updated_at` across every SecurityAdvisory, or nil when there are none."
  []
  (:updated_at (t2/query-one {:select [[[:max :updated_at] :updated_at]]
                              :from   [:security_advisory]})))

(mu/defn upsert-security-advisory! :- ms/PositiveInt
  "Insert or update a SecurityAdvisory by `:advisory_id`. On insert, `:match_status` starts as `:unknown` until the
  matching engine evaluates it. On update, sets `advisory`'s columns, leaving `:match_status`, `:last_evaluated_at`,
  and acknowledgement fields (which `advisory` doesn't include) untouched."
  [advisory :- ::security-center.schema/security-advisory.columns]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             advisory
                             (assoc advisory :match_status :unknown)))))

(mu/defn record-advisory-evaluation! :- :int
  "Apply `changes` to the SecurityAdvisory with `id` and stamp `last_evaluated_at` with now, returning the number
  updated."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:match_status    {:optional true} [:maybe ::match-status]]
               [:acknowledged_by {:optional true} [:maybe :int]]
               [:acknowledged_at {:optional true} [:maybe ms/TemporalInstant]]]]
  (update-security-advisories! {:id id} (assoc changes :last_evaluated_at :%now)))

(mu/defn record-advisory-notification! :- :int
  "Set `last_notified_at` of the SecurityAdvisory with `id` to now, returning the number updated."
  [id :- ms/PositiveInt]
  (update-security-advisories! {:id id} {:last_notified_at :%now}))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, names, and email of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-fn->fn :id identity [:model/User :id :first_name :last_name :email] :id [:in user-ids]))
