(ns metabase.models.permissions.delete-sandboxes
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [potemkin :as p]
            [pretty.core :as pretty]))

(p/defprotocol+ DeleteSandboxes
  "Protocol for Sandbox deletion behavior when permissions are granted or revoked."
  (delete-gtaps-if-needed-after-permissions-change!* [this changes]
    "For use only inside `metabase.models.permissions`; don't call this elsewhere. Delete GTAPs that are no longer
needed after the permissions graph is updated. See docstring for `delete-gtaps-if-needed-after-permissions-change!` for
 more information."))

(def oss-default-impl
  "OSS no-op impl for Sandbox (GTAP) deletion behavior. Don't use this directly."
  (reify
    DeleteSandboxes
    (delete-gtaps-if-needed-after-permissions-change!* [_ _] nil)

    pretty/PrettyPrintable
    (pretty [_]
      `oss-default-impl)))

(def ^:private impl
  (delay
    (or (u/ignore-exceptions
          (classloader/require 'metabase-enterprise.sandbox.models.permissions.delete-sandboxes)
          (var-get (resolve 'metabase-enterprise.sandbox.models.permissions.delete-sandboxes/ee-strategy-impl)))
        oss-default-impl)))

(defn delete-gtaps-if-needed-after-permissions-change!
  "For use only inside `metabase.models.permissions`; don't call this elsewhere. Delete GTAPs (sandboxes) that are no
  longer needed after the permissions graph is updated. This is EE-specific -- OSS impl is a no-op, since sandboxes
  are an EE-only feature. `changes` are the parts of the graph that have changed, i.e. the `things-only-in-new`
  returned by `clojure.data/diff`."
  [changes]
  (delete-gtaps-if-needed-after-permissions-change!* @impl changes))
