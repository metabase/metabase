(ns metabase-enterprise.session-management.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.schema :as session.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::session-type
  "How a session was created: an ordinary login, or a full-app embedding one. Derived from whether the `core_session`
  row carries an anti-CSRF token, which only full-app-embed sessions do."
  [:enum "normal" "full-app-embed"])

(mr/def ::session-status
  "Which sessions a query is about: the `live` ones (the default), the `ended` ones, or `all` of them."
  [:enum :live :ended :all])

(mr/def ::session-filters
  "The filters accepted by [[metabase-enterprise.session-management.query/filters->where]]. Temporal values arrive
  already parsed. `:query` is a free-text search over the session owner's name and email; only the list endpoint
  accepts it, since revoking by a name search is far easier to get wrong than revoking by an explicit criterion.
  `status` defaults to `:live`; the `reason` and `ended-*` filters only ever match ended sessions."
  [:map {:closed true}
   [:status             {:optional true} [:maybe ::session-status]]
   [:user-id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:ids                {:optional true} [:maybe [:sequential :string]]]
   [:provider           {:optional true} [:maybe [:sequential :string]]]
   [:type               {:optional true} [:maybe ::session-type]]
   [:tenancy            {:optional true} [:maybe [:enum :all :internal :external]]]
   [:query              {:optional true} [:maybe :string]]
   [:created-before     {:optional true} [:maybe ms/TemporalInstant]]
   [:created-after      {:optional true} [:maybe ms/TemporalInstant]]
   [:last-active-before {:optional true} [:maybe ms/TemporalInstant]]
   [:last-active-after  {:optional true} [:maybe ms/TemporalInstant]]
   [:reason             {:optional true} [:maybe ::session.schema/end-reason]]
   [:ended-before       {:optional true} [:maybe ms/TemporalInstant]]
   [:ended-after        {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::revocation
  "What [[metabase-enterprise.session-management.db/revoke-live-sessions!]] reports about a revoke."
  [:map {:closed true}
   [:revoked          ms/IntGreaterThanOrEqualToZero]
   [:user-ids         [:sequential ::lib.schema.id/user]]
   [:current-revoked? :boolean]])

(mr/def ::session-sort-column
  "Columns the session list can be sorted by. `:last_active_at` sorts on the same
  `COALESCE(last_active_at, created_at)` the idle-timeout predicate uses, so a session that has never been touched
  sorts by when it was created rather than last. `:ended_at` is null for a live session, and for an ended one whose
  ending the nightly sweep has not recorded yet."
  [:enum :created_at :last_active_at :user_email :provider :ended_at])
