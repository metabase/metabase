(ns metabase-enterprise.workspaces.schema
  "Malli schemas shared across the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::workspace-status
  "Lifecycle status of a `:model/Workspace`. Deliberately kept separate from
   `::workspace-database-status` even though the values currently coincide —
   the workspace lifecycle will grow more statuses (e.g. instance provisioning).

    unprovisioned ──► provisioning ──► provisioned ──► deprovisioning
          ▲                │                                 │
          │                ▼                        failure  ▼
          │        provisioning-failure           deprovisioning-failure
          └───────────────◄──────────────────────────────────┘

   `/provision` and `/deprovision` may be retried from any status; at worst they
   are no-ops."
  [:enum
   :unprovisioned
   :provisioning
   :provisioning-failure
   :provisioned
   :deprovisioning
   :deprovisioning-failure])

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
   [:status_details {:optional true} [:maybe :string]]])

(mr/def ::workspace-database
  "A `:model/WorkspaceDatabase` row."
  [:map
   [:id ms/PositiveInt]
   [:status {:optional true} ::workspace-database-status]])
