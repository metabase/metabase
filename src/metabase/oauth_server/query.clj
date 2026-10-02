(ns metabase.oauth-server.query
  "The HoneySQL the OAuth server module owns but does not run: the `oauth_client` row with the admin who revoked it,
  a client's derived status, aggregates over the access tokens it still holds, and the users holding them. Anything
  that lists, counts, filters or opens a registered client composes on these, so no other module names an OAuth
  table itself."
  (:require
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(def client-from-and-joins
  "`oauth_client` as `c`, with the admin who revoked it as `revoker`. A left join, so an active client — or a revoked
  one whose admin has since been deleted, which nulls the FK — is still selected."
  {:from      [[:oauth_client :c]]
   :left-join [[:core_user :revoker] [:= :c.revoked_by_user_id :revoker.id]]})

(def client-last-used-expr
  "`last_used_at`, coalesced to `created_at` for a client that has never presented a token."
  [:coalesce :c.last_used_at :c.created_at])

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
(def ^:private last-approved-expr
  "When the `u` user last consented to the `c` client, or null if the client holds a token of theirs with no approval
  on record — a token inserted directly, or one from before the event log existed."
  ;; a correlated scalar subquery, deliberately: see [[metabase.app-db.honeysql-guard]]
  ^:allow-subquery {:select [[[:max :e.created_at]]]
                    :from   [[:oauth_client_event :e]]
                    :where  [:and
                             [:= :e.oauth_client_id :c.id]
                             [:= :e.user_id :u.id]
                             [:= :e.event_type "approved"]]})

(defn client-token-holders-query
  "A whole query — not a fragment — for the users holding an access token of the client registered under `client-id`
  that still works at `now-ms`: one row per user with how many such tokens they hold and when they last consented."
  [client-id now-ms]
  {:select   [[:u.id :id]
              [:u.email :email]
              [:u.first_name :first_name]
              [:u.last_name :last_name]
              [[:count [:inline 1]] :live_tokens]
              [last-approved-expr :last_approved_at]]
   :from     [[:oauth_access_token :t]]
   :join     [[:oauth_client :c] [:= :t.client_id :c.client_id]
              [:core_user :u]    [:= :t.user_id :u.id]]
   ;; the live tokens, not every unrevoked one, so these rows are the same users `live-token-user-count-expr`
   ;; counts: an admin reading the Users list against the Users column is reading one number
   :where    [:and
              [:= :c.client_id client-id]
              [:= :t.revoked_at nil]
              [:> :t.expiry now-ms]]
   :group-by [:u.id :u.email :u.first_name :u.last_name :c.id]
   :order-by [[:u.email :asc]]})
