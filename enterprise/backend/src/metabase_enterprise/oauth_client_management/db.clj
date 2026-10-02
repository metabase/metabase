(ns metabase-enterprise.oauth-client-management.db
  "Application database queries for OAuth client management, so that no other namespace in the module runs a query
  itself. The HoneySQL they are assembled from lives in [[metabase-enterprise.oauth-client-management.query]].

  Reads only: revoking goes through [[metabase.oauth-server.core/revoke-clients!]]."
  (:require
   [metabase-enterprise.oauth-client-management.query :as ocm.query]
   [metabase-enterprise.oauth-client-management.schema :as ocm.schema]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn clients :- [:sequential :map]
  "The registered clients matching `filters` — active ones unless `:status` says otherwise — newest registration
  first, at most `limit` from `offset`. The live-token and distinct-user counts are computed in SQL against `now-ms`
  (epoch milliseconds). No hash is selected, so none can leave the database."
  [filters :- ::ocm.schema/client-filters
   now-ms  :- :int
   limit   :- [:maybe ms/PositiveInt]
   offset  :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/query
   (cond-> (merge oauth-server/client-from-and-joins
                  {:select   [[:c.client_id :client_id]
                              [:c.client_name :client_name]
                              [:c.client_uri :client_uri]
                              [:c.logo_uri :logo_uri]
                              [:c.redirect_uris :redirect_uris]
                              [:c.application_type :application_type]
                              [:c.registration_type :registration_type]
                              [:c.created_at :created_at]
                              [oauth-server/client-status-expr :status]
                              [:c.revoked_at :revoked_at]
                              [:c.revoked_by_user_id :revoked_by_user_id]
                              [:revoker.email :revoked_by_email]
                              [:revoker.first_name :revoked_by_first_name]
                              [:revoker.last_name :revoked_by_last_name]
                              [(oauth-server/live-token-count-expr now-ms) :live_tokens]
                              [(oauth-server/live-token-user-count-expr now-ms) :user_count]]
                   :where    (ocm.query/client-where filters)
                   :order-by ocm.query/client-order-by})
     limit  (assoc :limit limit)
     offset (assoc :offset offset))))

(mu/defn- count-where :- ms/IntGreaterThanOrEqualToZero
  "How many `oauth_client` rows satisfy `where`."
  [where :- ::h2x/honeysql-expr]
  (-> (t2/query (merge oauth-server/client-from-and-joins
                       {:select [[[:count [:inline 1]] :count]]
                        :where  where}))
      first
      :count
      long))

(mu/defn client-count :- ms/IntGreaterThanOrEqualToZero
  "How many clients match `filters`, `:status` included. Uses the same joins and predicates as [[clients]], so the
  total can never disagree with the rows being paged through."
  [filters :- ::ocm.schema/client-filters]
  (count-where (ocm.query/client-where filters)))

(mu/defn active-client-count :- ms/IntGreaterThanOrEqualToZero
  "How many *active* clients match `filters`, whatever its `:status` says. Called after a revoke to report how many
  still match — 0 unless a registration raced it."
  [filters :- ::ocm.schema/client-filters]
  (count-where (ocm.query/client-where (assoc filters :status :active))))
