(ns metabase-enterprise.workspaces.query-processor
  "Workspaces v2 PoC: QP hook that installs the workspace entity-remapping overlay.

   Runs at the very top of preprocess — before `prefetch-metadata` and
   `resolve-source-cards` — because that's where `:source-card` refs get resolved
   through the metadata provider. Once the overlay is installed, every later read
   of a card / transform / table (source-card resolution, field resolution,
   HoneySQL table emission) sees workspace copies under production ids, and no
   other middleware needs to know workspaces exist.

   No-op when [[entity/*workspace-id*]] is unbound, so production queries pay
   nothing."
  (:require
   [metabase-enterprise.workspaces.remapping :as ws.entity]
   [metabase.premium-features.core :refer [defenterprise]]
   ^{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]))

(set! *warn-on-reflection* true)

(defn- install-overlay!
  "Swap the qp.store metadata provider for the workspace overlay. The empty-body
   `with-metadata-provider` sets the provider without popping it — a deliberately
   loud mechanism so this stands out."
  [overlay]
  (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
    (qp.store/with-metadata-provider overlay)))

(defenterprise apply-workspace-entity-remapping
  "Install the workspace entity-remapping metadata provider when the query runs
   in a workspace context ([[ws.entity/*workspace-id*]] bound). The overlay goes
   both into the qp.store (driver-side reads) and onto the query's `:lib/metadata`
   (lib reads like `resolve-source-cards` go through the query's own provider).
   See the namespace docstring."
  :feature :workspaces
  [{mp :lib/metadata, :as query}]
  (if-let [workspace-id ws.entity/*workspace-id*]
    (let [overlay (ws.entity/remapping-metadata-provider workspace-id mp)]
      (install-overlay! overlay)
      (assoc query :lib/metadata overlay))
    query))
