(ns metabase-enterprise.workspaces.provisioning.instance
  "Child-instance provisioning for a workspace: creating/destroying the
   developer Metabase instance a workspace's users work in, and persisting its
   identifiers (`instance_id`/`instance_url`) on the `:model/Workspace` row.

   The default [[instance-provisioner]] is a stub — the real (Harbormaster)
   implementation comes later."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.malli :as mu]
   [potemkin.types :as p]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/defprotocol+ InstanceProvisioner
  "Provisioning operations for a workspace's child Metabase instance.
   The default [[instance-provisioner]] is a stub; tests reify custom
   implementations that fail on demand, count calls, etc."
  (create! [this workspace config]
    "Start creating a child instance for `workspace`, booted from the
     config-file map `config` (see
     [[metabase-enterprise.workspaces.config/build-workspace-config]]).
     Creation is asynchronous: returns `::ws.schema/instance` whose `:status`
     may still be `:creating` — the instance is not usable until [[fetch]]
     reports `:active`.")
  (fetch [this instance-id]
    "Fetch a child instance by id. Returns `::ws.schema/instance`.")
  (delete! [this instance-id]
    "Delete the child instance with `instance-id`. Should be idempotent."))

(def instance-provisioner
  "Default InstanceProvisioner. Stub implementation for now: pretends a child
   instance was created by returning a random id and a placeholder url that
   are immediately `:active`."
  (reify InstanceProvisioner
    (create! [_ _workspace _config]
      {:id (str (random-uuid)), :url "https://example.com", :status :active})
    (fetch [_ instance-id]
      {:id instance-id, :url "https://example.com", :status :active})
    (delete! [_ _instance-id]
      nil)))

(def instance-poll-interval-ms
  "How often [[provision-instance!]] polls the provisioner while the child
   instance is still coming up."
  5000)

(def instance-poll-timeout-ms
  "How long [[provision-instance!]] waits for the child instance to reach a
   terminal status before giving up."
  (* 10 60 1000))

(mu/defn- wait-for-instance :- ::ws.schema/instance
  "Poll `provisioner` until `instance-id` reaches a terminal status and return
   the instance. Throws when it lands anywhere but `:active`, or when
   [[instance-poll-timeout-ms]] elapses first."
  [provisioner instance-id :- :string]
  (let [{:keys [status] :as instance}
        (u.jvm/poll {:thunk       #(fetch provisioner instance-id)
                     :done?       #(contains? #{:active :error} (:status %))
                     :interval-ms instance-poll-interval-ms
                     :timeout-ms  instance-poll-timeout-ms})]
    (when-not instance
      (throw (ex-info "Timed out waiting for the workspace instance to start"
                      {:instance_id instance-id, :timeout-ms instance-poll-timeout-ms})))
    (when-not (= :active status)
      (throw (ex-info "Workspace instance failed to start"
                      {:instance_id instance-id, :status status})))
    instance))

(mu/defn- create-instance! :- ::ws.schema/workspace
  "Create a fresh child instance for `workspace` (blocking). Persists
   `:instance_id` (clearing any stale url) as soon as the provisioner accepts
   the creation, then polls until the instance is `:active` and persists the
   url the active instance reports. Throws when the instance lands in `:error`
   or the startup times out. Returns `workspace` with the new instance fields
   assoc'ed."
  [workspace :- ::ws.schema/workspace
   provisioner]
  (let [config       (-> workspace
                         (t2/hydrate :databases)
                         ws.config/build-workspace-config)
        {:keys [id]} (create! provisioner workspace config)]
    (t2/update! :model/Workspace (:id workspace) {:instance_id id, :instance_url nil})
    (let [url (:url (wait-for-instance provisioner id))]
      (t2/update! :model/Workspace (:id workspace) {:instance_url url})
      (assoc workspace :instance_id id, :instance_url url))))

(mu/defn- delete-instance! :- ::ws.schema/workspace
  "Delete `workspace`'s child instance (blocking) and clear its
   `:instance_id`/`:instance_url`. Throws on failure — the caller records the
   failure on the workspace status. Returns `workspace` with the instance
   fields cleared."
  [workspace :- ::ws.schema/workspace
   provisioner]
  (delete! provisioner (:instance_id workspace))
  (t2/update! :model/Workspace (:id workspace) {:instance_id nil, :instance_url nil})
  (assoc workspace :instance_id nil, :instance_url nil))

(mu/defn provision-instance! :- ::ws.schema/workspace
  "Provision a fresh child instance for `workspace` (blocking) — callers
   deprovision any existing one first, so every run starts from a clean state.
   Throws on failure or startup timeout — the caller records the failure on
   the workspace status. Returns `workspace` with the new instance fields
   assoc'ed."
  ([workspace]
   (provision-instance! workspace instance-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (create-instance! workspace provisioner)))

(mu/defn deprovision-instance! :- ::ws.schema/workspace
  "Delete `workspace`'s child instance (blocking) and clear its
   `:instance_id`/`:instance_url`. No-op when the workspace has no instance, so
   retries are safe. Throws on failure — the caller records the failure on the
   workspace status. Returns `workspace` with the instance fields cleared."
  ([workspace]
   (deprovision-instance! workspace instance-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (if-not (:instance_id workspace)
     (do
       (t2/update! :model/Workspace (:id workspace) {:instance_url nil})
       (assoc workspace :instance_url nil))
     (delete-instance! workspace provisioner))))
