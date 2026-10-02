(ns metabase-enterprise.oauth-client-management.query
  "The HoneySQL OAuth client management builds but does not run: how registered clients are filtered and sorted.
  [[metabase-enterprise.oauth-client-management.db]] is what executes these against the application database.

  Only the criteria are here. The fragments that name the OAuth tables belong to the OSS module and reach this one
  through [[metabase.oauth-server.core]]."
  (:require
   [metabase-enterprise.oauth-client-management.schema :as ocm.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- status-conditions
  "The HoneySQL predicates for a `status` filter."
  [status]
  (case (or status :active)
    :active  [[:= :c.revoked_at nil]]
    :revoked [[:not= :c.revoked_at nil]]
    :all     []))

(mu/defn client-where :- ::h2x/honeysql-expr
  "The `:where` for a client-management query: the registered clients of the `status` in `filters` (active by
  default) matching the rest of `filters`. Independent of the request being served, so that listing clients and
  revoking them stay in lockstep — whatever a filtered list shows is exactly what the same filters would revoke."
  [{:keys [status ids]} :- ::ocm.schema/client-filters]
  (let [clauses (cond-> (status-conditions status)
                  ;; an explicitly empty id list matches nothing; `IN ()` is not valid SQL anywhere
                  (some? ids)
                  (conj (if (seq ids) [:in :c.client_id ids] [:inline false])))]
    (if (seq clauses)
      (into [:and] clauses)
      ;; `status=all` with no other filter asks for every client, and `[:and]` alone is not valid SQL
      [:inline true])))

(def client-order-by
  "The `:order-by` for the client list: newest registration first."
  ;; a stable tiebreaker, so paging can't show or skip a row because two clients registered in the same instant
  [[:c.created_at :desc] [:c.id :desc]])
