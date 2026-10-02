(ns metabase.oauth-server.query
  "The HoneySQL the OAuth server module owns but does not run: the `oauth_client` row with the admin who revoked it,
  a client's derived status, and aggregates over the access tokens it still holds. Anything that lists or counts
  registered clients composes on these, so no other module names an OAuth table itself."
  (:require
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(def client-from-and-joins
  "`oauth_client` as `c`, with the admin who revoked it as `revoker`. A left join, so an active client — or a revoked
  one whose admin has since been deleted, which nulls the FK — is still selected."
  {:from      [[:oauth_client :c]]
   :left-join [[:core_user :revoker] [:= :c.revoked_by_user_id :revoker.id]]})

(def client-status-expr
  "A client's status — `active` or `revoked` — derived in SQL from `revoked_at`, so what callers are shown and what
  they filter on cannot disagree."
  [:case [:= :c.revoked_at nil] (h2x/literal "active") :else (h2x/literal "revoked")])

(defn- live-token-aggregate-expr
  "A scalar subquery applying the HoneySQL `aggregate` to the access tokens of the `c` client row being selected that
  still work at `now-ms`: unrevoked and not yet expired. `expiry` is epoch milliseconds, so `now-ms` compares as a
  plain number and nothing needs database-specific date arithmetic."
  [aggregate now-ms]
  ;; a correlated scalar subquery, deliberately: see [[metabase.app-db.honeysql-guard]]
  ^:allow-subquery {:select [[aggregate]]
                    :from   [[:oauth_access_token :t]]
                    :where  [:and
                             [:= :t.client_id :c.client_id]
                             [:= :t.revoked_at nil]
                             [:> :t.expiry now-ms]]})

(defn live-token-count-expr
  "How many access tokens the `c` client row holds that still work at `now-ms` — whether revoking it cuts anyone off
  right now. Refresh tokens are not counted: a bearer is what a client acts with."
  [now-ms]
  (live-token-aggregate-expr [:count [:inline 1]] now-ms))

(defn live-token-user-count-expr
  "How many distinct users hold one of the `c` client row's access tokens that still work at `now-ms` — the blast
  radius of revoking it."
  [now-ms]
  (live-token-aggregate-expr [:count [:distinct :t.user_id]] now-ms))

(defn- unrevoked-token-exists-expr
  "Whether `user-id` holds an unrevoked row in `table` — an OAuth token table — for the `c` client row being selected."
  [table user-id]
  ;; a correlated EXISTS, deliberately: see [[metabase.app-db.honeysql-guard]]
  [:exists ^:allow-subquery {:select [[[:inline 1]]]
                             :from   [[table :ut]]
                             :where  [:and
                                      [:= :ut.client_id :c.client_id]
                                      [:= :ut.user_id user-id]
                                      [:= :ut.revoked_at nil]]}])

(defn user-holds-token-expr
  "Whether `user-id` still holds an unrevoked token on the `c` client row — access or refresh, so a grant counts while
  either survives. Wider than [[live-token-count-expr]], which counts only what would authenticate a request now."
  [user-id]
  ;; both tables, because an access token lives an hour and the nightly cleanup deletes it once expired, while the
  ;; thirty-day refresh token is what keeps the grant alive. It is the same span a revoke reports its `user-ids` over.
  [:or
   (unrevoked-token-exists-expr :oauth_access_token user-id)
   (unrevoked-token-exists-expr :oauth_refresh_token user-id)])
