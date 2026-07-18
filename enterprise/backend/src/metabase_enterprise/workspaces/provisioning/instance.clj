(ns metabase-enterprise.workspaces.provisioning.instance
  "Child-instance provisioning for a workspace: creating/destroying the
   developer Metabase instance a workspace's users work in, and persisting its
   identifiers (`instance_id`/`instance_url`) on the `:model/Workspace` row.

   The default [[instance-provisioner]] is a stub — the real (Harbormaster)
   implementation comes later."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.malli :as mu]
   [potemkin.types :as p]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/defprotocol+ InstanceProvisioner
  "Provisioning operations for a workspace's child Metabase instance.
   The default [[instance-provisioner]] is a stub; tests reify custom
   implementations that fail on demand, count calls, etc."
  (create! [this workspace config]
    "Create a child instance for `workspace`, booted from the config-file map
     `config` (see [[metabase-enterprise.workspaces.config/build-workspace-config]]).
     Returns `{:id <string>, :url <string>}`.")
  (delete! [this workspace]
    "Delete `workspace`'s child instance (`:instance_id` carries its id).
     Should be idempotent."))

(def instance-provisioner
  "Default InstanceProvisioner. Stub implementation for now: pretends a child
   instance was created by returning a random id and a placeholder url."
  (reify InstanceProvisioner
    (create! [_ _workspace _config]
      {:id (str (random-uuid)), :url "https://example.com"})
    (delete! [_ _workspace]
      nil)))

(mu/defn provision-instance! :- :nil
  "Provision a child instance for `workspace` (blocking), booted from the
   workspace's config, and persist its `:instance_id`/`:instance_url` on the
   row. Always creates a fresh instance — callers deprovision any existing one
   first. Throws on failure — the caller records the failure on the workspace
   status."
  ([workspace]
   (provision-instance! workspace instance-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (let [config           (ws.config/build-workspace-config (:id workspace))
         {:keys [id url]} (create! provisioner workspace config)]
     (t2/update! :model/Workspace (:id workspace) {:instance_id id, :instance_url url}))
   nil))

(mu/defn deprovision-instance! :- :nil
  "Delete `workspace`'s child instance (blocking) and clear its
   `:instance_id`/`:instance_url`. No-op when the workspace has no instance, so
   retries are safe. Throws on failure — the caller records the failure on the
   workspace status."
  ([workspace]
   (deprovision-instance! workspace instance-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (when (:instance_id workspace)
     (delete! provisioner workspace)
     (t2/update! :model/Workspace (:id workspace) {:instance_id nil, :instance_url nil}))
   nil))
