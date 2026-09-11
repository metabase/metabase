(ns metabase-enterprise.session-management.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::session-filters
  "The filters accepted by [[metabase-enterprise.session-management.query/filters->where]]. Temporal values arrive
  already parsed."
  [:map {:closed true}
   [:user-id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:ids                {:optional true} [:maybe [:sequential :string]]]
   [:provider           {:optional true} [:maybe :string]]
   [:type               {:optional true} [:maybe [:enum "normal" "full-app-embed"]]]
   [:tenancy            {:optional true} [:maybe [:enum :all :internal :external]]]
   [:created-before     {:optional true} [:maybe ms/TemporalInstant]]
   [:created-after      {:optional true} [:maybe ms/TemporalInstant]]
   [:last-active-before {:optional true} [:maybe ms/TemporalInstant]]
   [:last-active-after  {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::revocation
  "What [[metabase-enterprise.session-management.db/revoke-live-sessions!]] reports about a revoke."
  [:map {:closed true}
   [:revoked          ms/IntGreaterThanOrEqualToZero]
   [:user-ids         [:sequential ::lib.schema.id/user]]
   [:current-revoked? :boolean]])

(mr/def ::session-sort-column
  "Columns the session list can be sorted by. `:last_active_at` sorts on the same
  `COALESCE(last_active_at, created_at)` the idle-timeout predicate uses, so a session that has never been touched
  sorts by when it was created rather than last."
  [:enum :created_at :last_active_at :user_email :provider])
