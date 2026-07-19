(ns metabase-enterprise.workspaces.provisioning.instance
  "Child-instance provisioning for a workspace: creating/destroying the
   developer Metabase instance a workspace's users work in, and persisting its
   identifiers (`instance_id`/`instance_url`) on the `:model/Workspace` row.

   The default [[instance-provisioner]] is a stub — the real (Harbormaster)
   implementation comes later."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.execute :as ws.execute]
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
    "Start creating a child instance for `workspace`, booted from the
     config-file map `config` (see
     [[metabase-enterprise.workspaces.config/build-workspace-config]]).
     Creation is asynchronous: returns `::ws.schema/instance` whose `:status`
     may still be `:creating`/`:starting` — the instance is not usable until
     [[instance]] reports `:running`.")
  (instance [this workspace instance-id]
    "Fetch `workspace`'s child instance by id. Returns `::ws.schema/instance`.")
  (delete! [this workspace]
    "Delete `workspace`'s child instance (`:instance_id` carries its id).
     Should be idempotent."))

(def instance-provisioner
  "Default InstanceProvisioner. Stub implementation for now: pretends a child
   instance was created by returning a random id and a placeholder url."
  (reify InstanceProvisioner
    (create! [_ _workspace _config]
      {:id (str (random-uuid)), :url "https://example.com", :status :running})
    (instance [_ _workspace instance-id]
      {:id instance-id, :url "https://example.com", :status :running})
    (delete! [_ _workspace]
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
   the instance. Throws when it lands anywhere but `:running`, or when
   [[instance-poll-timeout-ms]] elapses first."
  [provisioner workspace instance-id :- :string]
  (let [{:keys [status] :as inst}
        (ws.execute/poll-until
         {:thunk       #(instance provisioner workspace instance-id)
          :done?       #(contains? #{:running :error} (:status %))
          :interval-ms instance-poll-interval-ms
          :timeout-ms  instance-poll-timeout-ms})]
    (when-not (= :running status)
      (throw (ex-info "Workspace instance failed to start"
                      {:instance_id instance-id, :status status})))
    inst))

(mu/defn provision-instance! :- ::ws.schema/workspace
  "Provision a child instance for `workspace` (blocking), booted from the
   workspace's config. Persists `:instance_id`/`:instance_url` as soon as the
   provisioner accepts the creation, then polls until the instance is
   `:running`. Always creates a fresh instance — callers deprovision any
   existing one first. Throws on failure or startup timeout — the caller
   records the failure on the workspace status. Returns `workspace` with the
   new instance fields assoc'ed."
  ([workspace]
   (provision-instance! workspace instance-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (let [config           (-> workspace
                              (t2/hydrate :databases)
                              ws.config/build-workspace-config)
         {:keys [id url]} (create! provisioner workspace config)]
     (t2/update! :model/Workspace (:id workspace) {:instance_id id, :instance_url url})
     (wait-for-instance provisioner workspace id)
     (assoc workspace :instance_id id, :instance_url url))))

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
     workspace
     (do
       (delete! provisioner workspace)
       (t2/update! :model/Workspace (:id workspace) {:instance_id nil, :instance_url nil})
       (assoc workspace :instance_id nil, :instance_url nil)))))
