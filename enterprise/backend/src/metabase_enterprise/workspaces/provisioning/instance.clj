(ns metabase-enterprise.workspaces.provisioning.instance
  "Child-instance provisioning for a workspace: creating/destroying the
   developer Metabase instance a workspace's users work in, and persisting its
   identifiers (`instance_id`/`instance_url`) on the `:model/Workspace` row.

   The default [[instance-provisioner]] talks to Harbormaster; tests reify
   their own [[InstanceProvisioner]]."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.config.core :as config]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [potemkin.types :as p]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/defprotocol+ InstanceProvisioner
  "Provisioning operations for a workspace's child Metabase instance.
   The default [[instance-provisioner]] talks to Harbormaster; tests reify
   custom implementations that fail on demand, count calls, etc."
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

;;; ---------------------------------------- Harbormaster ----------------------------------------

(mu/defn- hm-status :- [:maybe :int]
  "HTTP status of an HM reply. On non-2xx responses clj-http throws and the
   client wraps the exception, so the status lives under `:ex-data`."
  [response :- :map]
  (or (:status response) (get-in response [:ex-data :status])))

(mu/defn- ->instance :- ::ws.schema/instance
  "Convert an HM instance body into the `::ws.schema/instance` shape."
  [body :- :map]
  {:id     (str (:id body))
   :url    (:url body)
   :status (some-> (:status body) keyword)})

(mu/defn- hm-create-instance! :- ::ws.schema/instance
  "Start creating the child instance for a workspace. Creation is asynchronous —
   the returned instance is usually still `:creating`. Throws when HM refuses
   or is unreachable."
  [{workspace-id :id, workspace-name :name} :- ::ws.schema/workspace
   config                                   :- :map]
  (let [[ok? response] (hm.client/make-request :post "/api/v2/mb/workspaces/instances"
                                               {:name       workspace-name
                                                :metadata   {:parent-instance (str (system/site-uuid))
                                                             :workspace-id    workspace-id}
                                                :mb-version (:tag config/mb-version-info)
                                                :config-yml (ws.config/config->yaml config)})]
    (when-not (= ok? :ok)
      (throw (ex-info (tru "Harbormaster failed to create the workspace instance.")
                      {:workspace_id workspace-id})))
    (->instance (:body response))))

(mu/defn- hm-fetch-instance :- ::ws.schema/instance
  "Fetch the child instance with `instance-id` from HM. Throws when HM refuses
   or is unreachable."
  [instance-id :- :string]
  (let [[ok? response] (hm.client/make-request :get (str "/api/v2/mb/workspaces/instances/" instance-id))]
    (when-not (= ok? :ok)
      (throw (ex-info (tru "Harbormaster failed to fetch the workspace instance.")
                      {:instance_id instance-id})))
    (->instance (:body response))))

(mu/defn- hm-delete-instance! :- :nil
  "Delete the child instance with `instance-id`. Idempotent: 404 means it is
   already gone and counts as success. Throws on any other failure — HM's
   backstop reaper eventually collects the instance if the caller gives up."
  [instance-id :- :string]
  (let [[ok? response] (hm.client/make-request :delete (str "/api/v2/mb/workspaces/instances/" instance-id))]
    (when-not (or (= ok? :ok)
                  (= 404 (hm-status response)))
      (throw (ex-info (tru "Harbormaster failed to delete the workspace instance.")
                      {:instance_id instance-id})))
    nil))

(def instance-provisioner
  "The default InstanceProvisioner: provisions workspace child instances via
   Harbormaster."
  (reify InstanceProvisioner
    (create! [_ workspace config]
      (hm-create-instance! workspace config))
    (fetch [_ instance-id]
      (hm-fetch-instance instance-id))
    (delete! [_ instance-id]
      (hm-delete-instance! instance-id))))

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
        (ws.execute/poll-until
         {:thunk       #(fetch provisioner instance-id)
          :done?       #(contains? #{:active :error} (:status %))
          :interval-ms instance-poll-interval-ms
          :timeout-ms  instance-poll-timeout-ms})]
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
     ;; nothing to delete, but never keep a url without an instance
     (do
       (t2/update! :model/Workspace (:id workspace) {:instance_url nil})
       (assoc workspace :instance_url nil))
     (delete-instance! workspace provisioner))))
