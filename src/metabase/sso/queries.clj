(ns metabase.sso.queries
  "App-db queries for the SSO module. Reads are HugSQL statements in sso.sql executed through
  [[metabase.app-db.hugsql]]; writes stay on Toucan 2, deliberately.

  This ns replaces `metabase.sso.db`. The reads needed no `[:auto/param]` markers afterwards --
  the statement is fixed text in a file and every input is a `?` placeholder, so there is no value
  slot to mark.

  ## Why the two AuthIdentity writes are still Toucan calls

  `:model/AuthIdentity` declares `t2/define-before-insert` and `t2/define-before-update`, which
  hash `password` credentials and run `provider/validate`. [[metabase.app-db.hugsql/execute!]]
  applies a model's `:in` transforms but does NOT re-run those hooks -- a bare sqlvec never enters
  Toucan's write pipeline. Porting these writes would mean duplicating the hashing and validation
  at the call site, which is how the task_history PoC handled its `before-update` (with a \"keep
  the two in sync\" comment). That trade is fine for a status assertion and not fine for password
  hashing: a drift between the two copies writes an unhashed credential.

  So the module splits by hook, not by read/write: queries whose model has no write hooks port
  cleanly, and the rest wait for the write path the design doc describes (a schema-validated flat
  map that still runs hooks). Recorded as a finding rather than worked around."
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
  `excluded-group-ids`."
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

;;; Writes: still Toucan 2. See the ns docstring -- :model/AuthIdentity's before-insert/before-update
;;; hash password credentials and validate the provider, and app-db.hugsql/execute! does not re-run
;;; them. These keep their `(long ...)` coercions from the value-parameterization work.

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
