(ns metabase-enterprise.remote-sync.query-processor
  "Content branching: QP hook that installs the branch entity-remapping overlay.

   Runs at the very top of preprocess — before `prefetch-metadata` and
   `resolve-source-cards` — because that's where `:source-card` refs get resolved
   through the metadata provider. Once the overlay is installed, every later read
   of a card / measure / segment sees branch copies under main ids, and no other
   middleware needs to know branching exists.

   The branch context comes from [[branching/current-branch]] — the explicit
   binding when set, otherwise the current user's `core_user.branch`. No-op on
   main, so production queries pay one cheap user-column lookup at most."
  (:require
   [metabase-enterprise.remote-sync.branching :as branching]
   [metabase.premium-features.core :refer [defenterprise]]
   ^{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]))

(set! *warn-on-reflection* true)

(defn- install-overlay!
  "Swap the qp.store metadata provider for the branch overlay. The empty-body
   `with-metadata-provider` sets the provider without popping it — a deliberately
   loud mechanism so this stands out."
  [overlay]
  (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
    (qp.store/with-metadata-provider overlay)))

(defenterprise apply-branch-remapping
  "Install the branch entity-remapping metadata provider when the query runs on
   a branch ([[branching/current-branch]] non-nil). The overlay goes both into
   the qp.store (driver-side reads) and onto the query's `:lib/metadata` (lib
   reads like `resolve-source-cards` go through the query's own provider)."
  :feature :remote-sync
  [{mp :lib/metadata, :as query}]
  (if-let [branch (branching/current-branch)]
    (let [overlay (branching/remapping-metadata-provider branch mp)]
      (install-overlay! overlay)
      (assoc query :lib/metadata overlay))
    query))
