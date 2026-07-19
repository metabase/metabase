(ns metabase-enterprise.workspaces.schema
  "Malli schemas shared across the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::workspace-status
  "Lifecycle status of a `:model/Workspace`. Deliberately kept separate from
   `::workspace-database-status` — the workspace lifecycle spans more phases
   than a single database's.

   Provisioning path (databases, then the child instance):

     unprovisioned ──► database-provisioning ──► instance-provisioning ──► provisioned
                                │                          │
                       failure  ▼                 failure  ▼
              database-provisioning-failure   instance-provisioning-failure

   Deprovisioning path (the child instance, then databases):

     provisioned ──► instance-deprovisioning ──► database-deprovisioning ──► unprovisioned
                              │                            │
                     failure  ▼                   failure  ▼
             instance-deprovisioning-failure   database-deprovisioning-failure

   `/provision` and `/deprovision` may be retried from any status; at worst they
   are no-ops."
  [:enum
   :unprovisioned
   :database-provisioning
   :database-provisioning-failure
   :instance-provisioning
   :instance-provisioning-failure
   :provisioned
   :instance-deprovisioning
   :instance-deprovisioning-failure
   :database-deprovisioning
   :database-deprovisioning-failure])

(def in-flight-statuses
  "The workspace statuses that mark a provision or deprovision run as currently
   executing. All other statuses are settled — a new run may start from them."
  #{:database-provisioning :instance-provisioning
    :instance-deprovisioning :database-deprovisioning})

(mr/def ::instance-status
  "Provider-agnostic status of a workspace's child instance, reduced to what the
   provisioning flow needs to know: `:creating`/`:starting` — still coming up,
   keep polling; `:running` — up and usable; `:error` — terminal, stop waiting.
   Concrete provisioners map their own richer status sets onto these."
  [:enum :creating :starting :running :error])

(mr/def ::instance
  "A workspace's child instance as reported by an InstanceProvisioner."
  [:map
   [:id     :string]
   [:url    :string]
   [:status ::instance-status]])

(mr/def ::workspace-database-status
  "Lifecycle status of a `:model/WorkspaceDatabase`. The `*-failure` statuses are
   terminal until the next provision/deprovision retry."
  [:enum
   :unprovisioned
   :provisioning
   :provisioning-failure
   :provisioned
   :deprovisioning
   :deprovisioning-failure])

(mr/def ::workspace
  "A `:model/Workspace` row."
  [:map
   [:id   ms/PositiveInt]
   [:name ms/NonBlankString]
   [:status         {:optional true} ::workspace-status]
   [:status_details {:optional true} [:maybe :string]]
   [:instance_id    {:optional true} [:maybe :string]]
   [:instance_url   {:optional true} [:maybe :string]]])

(mr/def ::workspace-database
  "A `:model/WorkspaceDatabase` row."
  [:map
   [:id ms/PositiveInt]
   [:status {:optional true} ::workspace-database-status]])
