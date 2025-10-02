(ns metabase.actions.types
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;; This covers some cases that we aren't yet landing support for, but the code is fairly benign and unlikely to change.

(mr/def ::missing-id
  [:int {:min -1, :max -1}])

(mr/def ::fk-or-missing-id [:or ::missing-id ms/PositiveInt])

(def ^:private raw-scope-types
  [[:map [:dashboard-id ms/PositiveInt]]
   [:map [:dashcard-id ms/PositiveInt]]
   [:map [:card-id ms/PositiveInt]]
   ;; We represent model-actions distinctly. Treated the same as card-id, mostly.
   [:map [:model-id ms/PositiveInt]]
   [:map [:table-id ms/PositiveInt]]
   [:map [:webhook-id ms/PositiveInt]]
   [:map [:unknown [:enum :model-action]]]])

;; Relaxed, as we support it being
(mr/def ::scope.raw
  (into [:or] raw-scope-types))

;; All derivable or unknown data removed, so that this is safe to use as a key.
(mr/def ::scope.normalized
  (into [:or] (for [s raw-scope-types]
                (vec (concat (subvec s 0 1)
                             [{:closed true}
                              [:type :keyword]]
                             (subvec s 1))))))

;; All derivable data included.
(mr/def ::scope.hydrated
  [:multi {:dispatch :type}
   ;; dashboard
   [:dashboard
    [:map {:closed true}
     [:type          [:enum :dashboard]]
     [:dashboard-id  ms/PositiveInt]
     [:collection-id ::fk-or-missing-id]]]
   ;; table - unified type that handles both regular and CRUD cases
   [:table
    [:map {:closed true}
     [:type                         [:enum :table]]
     [:table-id                     ms/PositiveInt]
     [:database-id                  ::fk-or-missing-id]]]
   ;; card - unified type that handles both with and without table cases
   [:card
    [:map {:closed true}
     [:type                           [:enum :card]]
     [:card-id                        ms/PositiveInt]
     [:collection-id {:optional true} ::fk-or-missing-id]
     [:table-id      {:optional true} ::fk-or-missing-id]
     [:database-id                    ::fk-or-missing-id]]]
   ;; model - unified type that handles both with and without table cases
   [:model
    [:map {:closed true}
     [:type                           [:enum :model]]
     [:model-id                       ms/PositiveInt]
     [:collection-id {:optional true} ::fk-or-missing-id]
     [:table-id      {:optional true} ::fk-or-missing-id]
     [:database-id                    ::fk-or-missing-id]]]
   ;; dashcard - unified type that handles all cases:
   ;; 1. dashcard with both card and table (has card-id, table-id, database-id)
   ;; 2. dashcard with card but no table (has card-id, no table-id)
   ;; 3. non-card dashcard (no card-id, no table-id)
   [:dashcard
    [:map {:closed true}
     [:type                           [:enum :dashcard]]
     [:dashcard-id                    ms/PositiveInt]
     [:dashboard-id                   ::fk-or-missing-id]
     [:collection-id                  ::fk-or-missing-id]]]
   [:unknown any?]])
