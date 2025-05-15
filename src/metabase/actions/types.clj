(ns metabase.actions.types
  (:require
   [metabase.util.malli.registry :as mr]))

;; Maybe we want to add an origin? e.g., CRUD API versus action execute API versus v2 API. YAGNI for now.

(def ^:private raw-scope-types
  [[:map [:dashboard-id pos-int?]]
   [:map [:dashcard-id pos-int?]]
   [:map [:card-id pos-int?]]
  ;; We represent legacy-actions, which get called against a model, distinctly.
  ;; Treated the same as card-id, mostly.
  ;; Might end up always assigning the key according to the card type, or always use card-id, but either way we would
  ;; then need some way to tell legacy-action invocations apart.
   [:map [:model-id pos-int?]]
   [:map [:table-id pos-int?]]
   [:map [:webhook-id pos-int?]]
   [:map [:unknown [:enum :legacy-action]]]])

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
     [:dashboard-id  pos-int?]
     [:collection-id pos-int?]]]
   ;; table - unified type that handles both regular and CRUD cases
   [:table
    [:map {:closed true}
     [:type                         [:enum :table]]
     [:table-id                     pos-int?]
     [:database-id                  pos-int?]
     [:rest-api    {:optional true} [:enum :table]]]]
   ;; card - unified type that handles both with and without table cases
   [:card
    [:map {:closed true}
     [:type                           [:enum :card]]
     [:card-id                        pos-int?]
     [:collection-id {:optional true} pos-int?]
     [:table-id      {:optional true} pos-int?]
     [:database-id                    pos-int?]]]
   ;; model - unified type that handles both with and without table cases
   [:model
    [:map {:closed true}
     [:type                           [:enum :model]]
     [:model-id                       pos-int?]
     [:collection-id {:optional true} pos-int?]
     [:table-id      {:optional true} pos-int?]
     [:database-id                    pos-int?]]]
   ;; dashcard - unified type that handles all cases:
   ;; 1. dashcard with both card and table (has card-id, table-id, database-id)
   ;; 2. dashcard with card but no table (has card-id, no table-id)
   ;; 3. non-card dashcard (no card-id, no table-id)
   [:dashcard
    [:map {:closed true}
     [:type                           [:enum :dashcard]]
     [:dashcard-id                    pos-int?]
     [:dashboard-id                   pos-int?]
     [:collection-id                  pos-int?]
     [:card-id       {:optional true} pos-int?]
     [:table-id      {:optional true} pos-int?]
     [:database-id   {:optional true} pos-int?]]]
   ;; for now, webhooks can only point at tables, not editables
   [:webhook
    [:map {:closed false}
     [:type        [:enum :webhook]]
     [:webhook-id  pos-int?]
     [:table-id    pos-int?]
     [:database-id pos-int?]]]
   [:unknown any?]])
