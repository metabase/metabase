(ns metabase-enterprise.oauth-client-management.query
  "The HoneySQL OAuth client management builds but does not run: how registered clients are filtered and sorted.
  [[metabase-enterprise.oauth-client-management.db]] is what executes these against the application database.

  Only the criteria are here. The fragments that name the OAuth tables belong to the OSS module and reach this one
  through [[metabase.oauth-server.core]]."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.oauth-client-management.schema :as ocm.schema]
   [metabase.oauth-server.core :as oauth-server]
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

(def ^:private client-name-expr
  "The client's name as the search and the sort see it: a client that registered without one reads as the empty
  string."
  ;; coalesced rather than left null so a nameless client lands in the same place on every app database, instead of
  ;; wherever each one chooses to sort nulls
  [:coalesce :c.client_name (h2x/literal "")])

(defn- client-search-where
  "The predicate for a free-text search over a client: every whitespace-separated term has to match the name, the
  `client_id` or a redirect URI. A term matches any substring of any redirect URI, which is the text of the JSON
  array they are stored as."
  [search]
  (into [:and]
        (for [term (str/split (str/trim search) #"\s+")
              :let [wildcard (h2x/like-substring term)]]
          ;; lowercased on both sides, so the match is case-insensitive on every app database rather than only on the
          ;; ones whose default collation ignores case
          [:or
           [:like [:lower client-name-expr] wildcard]
           [:like [:lower :c.client_id] wildcard]
           [:like [:lower :c.redirect_uris] wildcard]])))

(mu/defn client-where :- ::h2x/honeysql-expr
  "The `:where` for a client-management query: the registered clients of the `status` in `filters` (active by
  default) matching the rest of `filters`. Independent of the request being served, so that listing clients and
  revoking them stay in lockstep — whatever a filtered list shows is exactly what the same filters would revoke.

  Date ranges are half-open — `after` is inclusive, `before` exclusive — so adjacent ranges neither overlap nor leave
  a gap."
  [{:keys [status ids user-id query registered-before registered-after revoked-before revoked-after
           last-used-before last-used-after]}
   :- ::ocm.schema/client-filters]
  (let [clauses (cond-> (status-conditions status)
                  ;; an explicitly empty id list matches nothing; `IN ()` is not valid SQL anywhere
                  (some? ids)
                  (conj (if (seq ids) [:in :c.client_id ids] [:inline false]))

                  user-id
                  (conj (oauth-server/user-holds-token-expr user-id))

                  (not (str/blank? query))
                  (conj (client-search-where query))

                  registered-after  (conj [:>= :c.created_at registered-after])
                  registered-before (conj [:< :c.created_at registered-before])

                  ;; `revoked_at` is null for an active client and a comparison against null is never true, so these
                  ;; two narrow to revoked clients without having to say so
                  revoked-after     (conj [:>= :c.revoked_at revoked-after])
                  revoked-before    (conj [:< :c.revoked_at revoked-before])

                  ;; the stored column rather than [[last-used-expr]], so a client that has never been used matches
                  ;; neither bound: it was not used after the one, and it was not used before the other either.
                  ;; The sort coalesces only because every row has to land somewhere in an ordering
                  last-used-after   (conj [:>= :c.last_used_at last-used-after])
                  last-used-before  (conj [:< :c.last_used_at last-used-before]))]
    (if (seq clauses)
      (into [:and] clauses)
      ;; `status=all` with no other filter asks for every client, and `[:and]` alone is not valid SQL
      [:inline true])))

(mu/defn revoke-where :- ::h2x/honeysql-expr
  "The predicates an `oauth_client` row must satisfy to be revoked by these criteria: active (whatever `status` says —
  a revoked client has nothing left to revoke), matching `filters`, and — when `exclude-current?` — not the client
  `current-client-id` identifies. A nil `current-client-id` is every request that did not authenticate with a bearer
  token, and then the flag has nothing to hold back."
  [filters           :- ::ocm.schema/client-filters
   current-client-id :- [:maybe :string]
   exclude-current?  :- :boolean]
  ;; holding the current client back is what keeps an admin sweeping every client from cutting off the very request
  ;; they are sweeping with
  (let [active (client-where (assoc filters :status :active))]
    (if (and exclude-current? current-client-id)
      [:and active [:not= :c.client_id current-client-id]]
      active)))

(mu/defn client-order-by :- [:sequential :any]
  "The `:order-by` for the client list. `:live_tokens` and `:user_count` name the aliases the caller's `:select` gives
  the token aggregates, so a query ordering by them has to select them."
  [sort-column    :- ::ocm.schema/client-sort-column
   sort-direction :- [:enum :asc :desc]]
  [[(case sort-column
      ;; lowercased, so that H2 and Postgres, which compare byte by byte, agree with MySQL's case-insensitive default
      ;; collation on where `apple` sits relative to `Banana`
      :client_name  [:lower client-name-expr]
      ;; the output aliases rather than the correlated subqueries again: ordering by an output column name is standard
      ;; SQL, and repeating the subquery would have the database compute each client's token counts twice
      :live_tokens  :live_tokens
      :user_count   :user_count
      :revoked_at   :c.revoked_at
      ;; coalesced, so a client that has never been used sorts by when it registered rather than wherever each app
      ;; database chooses to put nulls
      :last_used_at oauth-server/client-last-used-expr
      :c.created_at)
    sort-direction]
   ;; a stable tiebreaker, so paging can't show or skip a row because two clients share a value
   [:c.id :desc]])
