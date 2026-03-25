(ns metabase.metabot.scope
  "Scope-based authorization for Metabot tools.

  Each tool declares a required scope string (e.g. `\"agent:sql:create\"`).
  The `*current-user-scope*` dynamic var holds the set of scopes granted to
  the current user. `scope-matches?` checks whether a required scope is
  satisfied by the granted set, supporting hierarchical wildcards on the
  grant side (e.g. `\"agent:sql:*\"` covers `\"agent:sql:create\"`)."
  (:require
   [clojure.string :as str]
   [metabase.metabot.models.metabot-permissions :as metabot-permissions]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def unrestricted
  "A scope set that satisfies any required scope. Use only when explicitly
  granting full access (e.g. superuser context). This is distinct from
  category wildcards like `\"agent:*\"`, which only cover scopes under
  the `agent` prefix."
  #{"*"})

(def ^:dynamic *current-user-scope*
  "Set of scope strings granted to the current user. Defaults to `#{}` (no
  permissions granted). Bind this in the request path once scope resolution
  is wired up."
  #{})

(defn scope-matches?
  "Check if `granted-scopes` (a set of strings) satisfies `required-scope`
  (a string). Supports hierarchical wildcards on the grant side:
  `\"agent:sql:*\"` covers `\"agent:sql:create\"`.

  Returns true when:
  - `granted-scopes` contains `required-scope` exactly, or
  - `granted-scopes` contains `\"*\"` (unrestricted), or
  - `granted-scopes` contains a wildcard prefix that covers `required-scope`."
  [granted-scopes required-scope]
  (boolean
   (or (contains? granted-scopes required-scope)
       (contains? granted-scopes "*")
       (some (fn [scope]
               (and (str/ends-with? scope ":*")
                    (str/starts-with? required-scope
                                      (subs scope 0 (dec (count scope))))))
             granted-scopes))))

(def ^:dynamic *current-user-metabot-permissions*
  "Map of metabot permission type to value for the current user.
  e.g. `{:permission/metabot-sql-generation :yes, :permission/metabot-nql :no, ...}`.
  Bind in the request path alongside `*current-user-scope*`. When nil,
  consumers should fall back to `metabot-permissions/perm-type-defaults`."
  nil)

;;; ──────────────────────────────────────────────────────────────────
;;; Permission → Scope mapping
;;; ──────────────────────────────────────────────────────────────────

(def ^:private perm-type->scopes
  "Map from metabot permission type to the wildcard scope strings granted when
  that permission is `:yes`."
  {:permission/metabot-sql-generation #{"agent:sql:*" "agent:transforms:*" "agent:snippets:*"}
   :permission/metabot-nql            #{"agent:notebook:*" "agent:query:*" "agent:table:*" "agent:metric:*"}
   :permission/metabot-other-tools    #{"agent:viz:*" "agent:dashboard:*" "agent:document:*" "agent:alert:*"}})

(def always-granted-scopes
  "Scopes granted to every user regardless of permissions."
  #{"agent:search" "agent:resource:*" "agent:todo:*" "agent:metadata:*"})

(def all-yes-permissions
  "Permissions map granting all permissions. Used for superuser context."
  {:permission/metabot-sql-generation :yes
   :permission/metabot-nql            :yes
   :permission/metabot-other-tools    :yes
   :permission/metabot-model          :large})

;;; ──────────────────────────────────────────────────────────────────
;;; Permission resolution
;;; ──────────────────────────────────────────────────────────────────

(defn- most-permissive-value
  "Given a perm type and a collection of values from different groups,
  return the most permissive value. Values are ordered most→least permissive
  in `metabot-permissions`."
  [perm-type values]
  (let [ordering (get-in metabot-permissions/metabot-permissions [perm-type :values])
        rank     (into {} (map-indexed (fn [i v] [v i]) ordering))]
    ;; Lowest index = most permissive
    (first (sort-by #(get rank % Integer/MAX_VALUE) values))))

(defn resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most
  permissive value across all their groups. Returns a map of perm-type → value,
  with defaults filled in for any unset permission types."
  [user-id]
  (if-not user-id
    metabot-permissions/perm-type-defaults
    (let [group-ids (user/group-ids user-id)
          stored    (when (seq group-ids)
                      (t2/select :model/MetabotPermissions
                                 :group_id [:in group-ids]))
          by-type   (group-by :perm_type stored)]
      (reduce-kv
       (fn [acc perm-type default-value]
         (let [values (map :perm_value (get by-type perm-type))]
           (assoc acc perm-type
                  (if (seq values)
                    (most-permissive-value perm-type values)
                    default-value))))
       {}
       metabot-permissions/perm-type-defaults))))

(defn user-metabot-perms->scopes
  "Convert a resolved metabot permissions map into a set of scope strings.
  Maps `:yes` permissions to the corresponding wildcard scope sets and always
  includes `always-granted-scopes`."
  [perms]
  (reduce-kv
   (fn [acc perm-type perm-value]
     (if (and (= :yes perm-value) (contains? perm-type->scopes perm-type))
       (into acc (get perm-type->scopes perm-type))
       acc))
   always-granted-scopes
   (or perms metabot-permissions/perm-type-defaults)))
