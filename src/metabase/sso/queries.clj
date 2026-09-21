(ns metabase.sso.queries
  "App-db access for the SSO module, and the only namespace in it that queries the app-db.

  Reads are named statements in sso.sql, executed through [[metabase.app-db.hugsql]]. Writes are
  Toucan 2 calls whose values carry `[:auto/param]` markers.

  Replaces `metabase.sso.db`."
  (:require
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private membership-model :model/PermissionsGroupMembership)
(def ^:private auth-identity-model :model/AuthIdentity)

;; Private sqlvec builders (`<name>-sqlvec`), one per `-- :name-` in sso.sql. The declare doubles
;; as the file's table of contents (clj-kondo can't see vars interned by def-sqlvec-fns).
(declare user-group-ids-excluding-sqlvec user-group-ids-among-sqlvec auth-identity-exists-sqlvec)

(hugsql/def-sqlvec-fns "metabase/sso/sso.sql")

;;; Reads: HugSQL statements. Callers never touch a queryable.

(mu/defn user-group-ids-excluding :- [:set ms/PositiveInt]
  "The ids of the PermissionsGroups the User with `user-id` belongs to, other than
  `excluded-group-ids`.

  Returns `#{}` when nothing matches, not `nil` -- the `t2/select-fn-set` this replaced wrapped its
  result in `not-empty`."
  [user-id            :- ::lib.schema.id/user
   excluded-group-ids :- [:set ms/PositiveInt]]
  (into #{}
        (map :group_id)
        (app-db.hugsql/rows membership-model user-group-ids-excluding-sqlvec
                            {:user-id            user-id
                             :excluded-group-ids (app-db.hugsql/non-empty-ids excluded-group-ids)})))

(mu/defn user-group-ids-among :- [:set ms/PositiveInt]
  "The ids among `group-ids` of the PermissionsGroups the User with `user-id` belongs to, other than
  `excluded-group-ids`.

  Returns `#{}` for an empty `group-ids` without querying -- there are no candidates to match. The
  excluded set instead goes through `non-empty-ids`, because an empty exclusion list still has to
  run and exclude nothing."
  [user-id            :- ::lib.schema.id/user
   group-ids          :- [:set ms/PositiveInt]
   excluded-group-ids :- [:set ms/PositiveInt]]
  (if (empty? group-ids)
    #{}
    (into #{}
          (map :group_id)
          (app-db.hugsql/rows membership-model user-group-ids-among-sqlvec
                              {:user-id            user-id
                               :group-ids          group-ids
                               :excluded-group-ids (app-db.hugsql/non-empty-ids excluded-group-ids)}))))

(mu/defn auth-identity-exists? :- :boolean
  "Whether the User with `user-id` has an AuthIdentity for `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (some? (app-db.hugsql/scalar auth-identity-model auth-identity-exists-sqlvec
                               {:user-id user-id :provider provider})))

;;; Writes stay on Toucan 2. A bare sqlvec never enters Toucan's write pipeline, so it would skip
;;; `:model/AuthIdentity`'s before-insert/before-update -- `provider/validate` for both writes here,
;;; and password hashing for the `:credentials` neither of these two passes but a sibling write
;;; would -- as well as the `metabase.app-db.dml-capture` seam that feeds search-index change
;;; capture. Re-implementing a hook at the call site is not a fix: a second copy of password hashing
;;; that drifts from the first writes an unhashed credential.

(mu/defn insert-auth-identity!
  "Insert an AuthIdentity linking the User with `user-id` to `provider-id` at `provider`."
  [user-id     :- ::lib.schema.id/user
   provider    :- :string
   provider-id :- :string]
  ;; No marker: the row is validated against `::auth-identity` before insert, so a value here is
  ;; already constrained to a string and a marker would fail that validation.
  (t2/insert! :model/AuthIdentity {:user_id user-id, :provider provider, :provider_id provider-id}))

(mu/defn set-auth-identity-metadata!
  "Set the `metadata` of the AuthIdentity of the User with `user-id` at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string
   metadata :- [:maybe ::auth-identity.schema/auth-identity.metadata]]
  ;; No marker here. `t2/update!` takes its conditions as column/value pairs rather than a query
  ;; map, so a marker is folded into the pair and never reaches a value slot; and the changes map is
  ;; validated against the model's schema, which a marker would fail.
  (t2/update! :model/AuthIdentity {:user_id user-id, :provider provider} {:metadata metadata}))
