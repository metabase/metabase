(ns metabase.models.permissions.delete-sandboxes
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [potemkin :as p]
            [pretty.core :as pretty]))

(p/defprotocol+ DeleteSandboxes
  (revoke-perms-delete-sandboxes-if-needed!* [this group-or-id path]
    "Only for internal use in `metabase.models.permissions`; don't invoke this method elsewhere. Delete any
sandboxes (GTAPs) for when PermissionsGroup `group-or-id` has their permissions for object `path` revoked, if
applicable (e.g. getting all perms for a Database or Table should delete any associated sandboxes.)")

  (grant-perms-delete-sandboxes-if-needed!* [this group-or-id path]
    "Only for internal use in `metabase.models.permissions`; don't invoke this method elsewhere. Delete any
sandboxes (GTAPs) for when PermissionsGroup `group-or-id` is granted permissions for object `path`, if
applicable (e.g. getting full unrestricted perms for a Database or Table should delete any associated sandboxes.)"))

(def oss-default-impl
  "OSS no-op impl for Sandbox (GTAP) deletion behavior. Don't use this directly."
  (reify
    DeleteSandboxes
    (revoke-perms-delete-sandboxes-if-needed!* [_ _ _] nil)
    (grant-perms-delete-sandboxes-if-needed!* [_ _ _] nil)

    pretty/PrettyPrintable
    (pretty [_]
      `oss-default-impl)))

(def ^:private impl
  (delay
    (or (u/ignore-exceptions
          (classloader/require 'metabase-enterprise.sandbox.models.permissions.delete-sandboxes)
          (var-get (resolve 'metabase-enterprise.sandbox.models.permissions.delete-sandboxes/ee-strategy-impl)))
        oss-default-impl)))

(defn revoke-perms-delete-sandboxes-if-needed!
  "Only for internal use in `metabase.models.permissions`; don't invoke this function elsewhere. Delete any
  sandboxes (GTAPs) for when PermissionsGroup `group-or-id` has their permissions for object `path` revoked, if
  applicable (e.g. getting all perms for a Database or Table should delete any associated sandboxes.) OSS impl is a
  no-op, since Sandboxes are EE-only."
  [group-or-id path]
  (revoke-perms-delete-sandboxes-if-needed!* @impl group-or-id path))

(defn grant-perms-delete-sandboxes-if-needed!
  "Only for internal use in `metabase.models.permissions`; don't invoke this function elsewhere. Delete any
  sandboxes (GTAPs) for when PermissionsGroup `group-or-id` is granted permissions for object `path`, if
  applicable (e.g. getting full unrestricted perms for a Database or Table should delete any associated sandboxes.)
  OSS impl is a no-op, since Sandboxes are EE-only."
  [group-or-id path]
  (grant-perms-delete-sandboxes-if-needed!* @impl group-or-id path))
