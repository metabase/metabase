(ns metabase-enterprise.oauth-client-management.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::client-status
  "Which registered clients a query is about: the `active` ones (the default), the `revoked` ones, or `all` of them.
  A client is revoked exactly when it carries a `revoked_at`."
  [:enum :active :revoked :all])

(mr/def ::client-filters
  "The filters [[metabase-enterprise.oauth-client-management.query/client-where]] takes. `status` defaults to
  `:active`. `:query` is a free-text search over the client's name, `client_id` and redirect URIs; only the list
  endpoint accepts it, since revoking by a substring search is far easier to get wrong than revoking by an explicit
  criterion."
  [:map {:closed true}
   [:status            {:optional true} [:maybe ::client-status]]
   [:ids               {:optional true} [:maybe [:sequential :string]]]
   [:user-id           {:optional true} [:maybe ::lib.schema.id/user]]
   [:query             {:optional true} [:maybe :string]]
   [:registered-before {:optional true} [:maybe ms/TemporalInstant]]
   [:registered-after  {:optional true} [:maybe ms/TemporalInstant]]
   ;; these two only ever match a client that has been revoked
   [:revoked-before    {:optional true} [:maybe ms/TemporalInstant]]
   [:revoked-after     {:optional true} [:maybe ms/TemporalInstant]]
   ;; and these two only a client that has been used
   [:last-used-before  {:optional true} [:maybe ms/TemporalInstant]]
   [:last-used-after   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::client-sort-column
  "Columns the client list can be sorted by. `:client_name` sorts a client that registered without a name as the
  empty string, so it lands first ascending. `:live_tokens` and `:user_count` are aggregates over the client's
  tokens rather than stored columns. `:revoked_at` is null for an active client, so it only orders the revoked list.
  `:last_used_at` sorts a client that has never been used as its `created_at`."
  [:enum :created_at :client_name :live_tokens :user_count :revoked_at :last_used_at])
