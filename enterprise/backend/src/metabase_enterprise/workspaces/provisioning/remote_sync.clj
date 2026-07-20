(ns metabase-enterprise.workspaces.provisioning.remote-sync
  "Git-branch provisioning for workspaces. A workspace with a `:target_branch`
   owns a branch on the remote-sync repo: provisioning creates it (idempotent —
   an existing branch is fine), deprovisioning deletes it. `:target_branch`
   itself never changes. Both phases are no-ops when remote sync is disabled
   or the workspace has no branch."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- workspace-branch [workspace]
  (let [branch (:target_branch workspace)]
    (when-not (str/blank? branch)
      branch)))

(mu/defn provision-branch! :- ::ws.schema/workspace
  "Create the workspace's `:target_branch` on the remote-sync repo. A no-op
   when remote sync is disabled, the workspace has no branch, or the branch
   already exists. Returns `workspace` unchanged."
  [workspace :- ::ws.schema/workspace]
  (when-let [branch (workspace-branch workspace)]
    (when (and (remote-sync/remote-sync-enabled)
               (not (remote-sync/branch-exists? branch)))
      (remote-sync/create-branch! branch)))
  workspace)

(mu/defn deprovision-branch! :- ::ws.schema/workspace
  "Delete the workspace's `:target_branch` from the remote-sync repo. A no-op
   when remote sync is disabled at this point or the workspace has no branch.
   `:target_branch` itself is kept as is — a later provision recreates the
   branch. Returns `workspace` unchanged."
  [workspace :- ::ws.schema/workspace]
  (when-let [branch (workspace-branch workspace)]
    (when (remote-sync/remote-sync-enabled)
      (remote-sync/delete-branch! branch)))
  workspace)
