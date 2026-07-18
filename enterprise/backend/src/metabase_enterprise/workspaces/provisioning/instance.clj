(ns metabase-enterprise.workspaces.provisioning.instance
  "Provisioning of workspace child Metabase instances. An [[InstanceProvisioner]]
  provisions a workspace's child instance in some target environment; the only
  real implementation today talks to Harbormaster."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.config.core :as config]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private create-timeouts {:connection-timeout 10000, :socket-timeout 60000})
(def ^:private delete-timeouts {:connection-timeout 10000, :socket-timeout 10000})

(defprotocol InstanceProvisioner
  (create! [this workspace config]
    "Create the workspace's child instance in the target environment.")
  (delete! [this workspace]
    "Delete the workspace's child instance from the target environment."))

;;;; ---------------------------------------- Harbormaster ----------------------------------------

(mu/defn- hm-status :- [:maybe :int]
  "HTTP status of an HM reply. On non-2xx responses clj-http throws and the
  client wraps the exception, so the status lives under `:ex-data`."
  [response :- :map]
  (or (:status response) (get-in response [:ex-data :status])))

(mu/defn- hm-error
  "502 `ex-info` for a failed HM call, carrying the HM status and body so
  operators can see why HM refused."
  [message      :- :string
   workspace-id :- :int
   response     :- :map]
  (ex-info message
           {:status-code  502
            :workspace_id workspace-id
            :hm-status    (hm-status response)
            :hm-body      (or (:body response) (get-in response [:ex-data :body]))}))

(mu/defn- hm-provision-instance! :- [:map [:id :string] [:url [:maybe :string]]]
  "Create the child instance for a workspace (blocking; returns once the child is
  active with `config` applied). Returns `{:id .. :url ..}`.
  Throws a 502 `ex-info` when HM refuses or is unreachable — the workspace and its
  warehouse resources are left in place so the caller can retry or delete."
  [{workspace-id :id, workspace-name :name} :- ::ws.schema/workspace
   config                                   :- :map]
  (let [[ok? response] (hm.client/make-request :post "/api/v2/mb/workspaces/instances"
                                               {:name       workspace-name
                                                :blocking   true
                                                :metadata   {:parent-instance (str (system/site-uuid))
                                                             :workspace-id    workspace-id}
                                                :mb-version (:tag config/mb-version-info)
                                                :config-yml (yaml/generate-string config :dumper-options {:flow-style :block})}
                                               create-timeouts)]
    (when-not (= ok? :ok)
      (throw (hm-error (tru "Harbormaster failed to create the workspace instance.")
                       workspace-id response)))
    (let [{:keys [id url]} (:body response)]
      (when-not id
        (throw (hm-error (tru "Harbormaster returned no id for the workspace instance.")
                         workspace-id response)))
      {:id (str id), :url url})))

(mu/defn- hm-deprovision-instance!
  "Delete the child instance. Idempotent: 404 means it is already gone and counts as
  success. Throws a 502 `ex-info` on any other failure — HM's backstop reaper
  eventually collects the instance if the caller gives up."
  [{workspace-id :id, instance-id :instance_id} :- ::ws.schema/workspace]
  (let [[ok? response] (hm.client/make-request :delete (str "/api/v2/mb/workspaces/instances/" instance-id)
                                               nil delete-timeouts)]
    (when-not (or (= ok? :ok)
                  (= 404 (hm-status response)))
      (throw (hm-error (tru "Harbormaster failed to delete the workspace instance.")
                       workspace-id response)))))

(def hm-provisioner
  "An [[InstanceProvisioner]] that provisions workspace child instances via
  Harbormaster. The default for [[provision-instance!]]/[[deprovision-instance!]];
  public so tests can `with-redefs` it."
  (reify InstanceProvisioner
    (create! [_this workspace config]
      (hm-provision-instance! workspace config))
    (delete! [_this workspace]
      (hm-deprovision-instance! workspace))))

;;;; ------------------------------------------ Entry points ------------------------------------------

(mu/defn provision-instance! :- [:maybe ::ws.schema/workspace]
  "Provision the child instance for `workspace` (blocking; returns once the child
  is active with `config` applied) and persist its id and url on the Workspace
  row. Returns the updated Workspace row."
  ([workspace :- ::ws.schema/workspace
    config    :- :map]
   (provision-instance! workspace config hm-provisioner))
  ([workspace :- ::ws.schema/workspace
    config    :- :map
    provisioner]
   (let [{:keys [id url]} (create! provisioner workspace config)]
     (try
       (t2/update! :model/Workspace (:id workspace) {:instance_id id, :instance_url url})
       (catch Throwable t
         ;; the instance exists but we could not record it — delete it, or it
         ;; would keep running with no row pointing at it
         (try
           (delete! provisioner (assoc workspace :instance_id id))
           (catch Throwable delete-error
             (.addSuppressed t delete-error)))
         (throw t)))
     (t2/select-one :model/Workspace :id (:id workspace)))))

(mu/defn deprovision-instance! :- [:maybe ::ws.schema/workspace]
  "Delete the child instance of `workspace` and clear `instance_id`/`instance_url`
  on the Workspace row. Throws when the provisioner fails to delete the instance;
  the row is left untouched then, so the delete can be retried. Returns the
  updated Workspace row."
  ([workspace :- ::ws.schema/workspace]
   (deprovision-instance! workspace hm-provisioner))
  ([workspace :- ::ws.schema/workspace
    provisioner]
   (delete! provisioner workspace)
   (t2/update! :model/Workspace (:id workspace) {:instance_id nil, :instance_url nil})
   (t2/select-one :model/Workspace :id (:id workspace))))
