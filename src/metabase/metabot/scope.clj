(ns metabase.metabot.scope
  "Scope-based authorization for Metabot tools.

  Each tool declares a required scope string (e.g. `\"agent:sql:create\"`).
  The `*current-user-scope*` dynamic var holds the set of scopes granted to
  the current user. `scope-matches?` checks whether a required scope is
  satisfied by the granted set, supporting hierarchical wildcards on the
  grant side (e.g. `\"agent:sql:*\"` covers `\"agent:sql:create\"`)."
  (:require
   [clojure.string :as str]))

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

(defn user-metabot-perms->scopes
  "Convert a user's metabot permissions into a set of scope strings.
  Stub — returns `#{}` until the permissions data model lands in phase 2."
  [_perms]
  #{})
