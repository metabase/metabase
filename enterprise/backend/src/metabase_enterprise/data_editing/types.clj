(ns metabase-enterprise.data-editing.types
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
   [:map [:webhook-id pos-int?]]])

;; Relaxed, as we support it being
(mr/def ::scope.raw
  (into [:or] raw-scope-types))

;; All derivable or unknown data removed, so that this is safe to use as a key.
(mr/def ::scope.normalized
  (into [:or] (for [s raw-scope-types]
                (vec (concat (subvec s 0 1)
                             [{:closed true}]
                             (subvec s 1))))))

;; All derivable data included.
(mr/def ::scope.hydrated
  [:or
   ;; dashboard
   [:map {:closed true}
    [:dashboard-id pos-int?]
    [:collection-id pos-int?]]
   ;; table
   [:map {:closed true}
    [:table-id pos-int?]
    [:database-id pos-int?]]
   ;; card with table (e.g., mbql with no join)
   [:map {:closed true}
    [:card-id pos-int?]
    [:collection-id pos-int?]
    [:table-id pos-int?]
    [:database-id pos-int?]]
   ;; card without table (e.g., native)
   [:map {:closed true}
    [:card-id pos-int?]
    [:collection-id pos-int?]
    [:database-id pos-int?]]
   ;; model with a table (e.g., mbql) - if there are joins we take the initial source table.
   [:map {:closed true}
    [:model-id pos-int?]
    [:collection-id pos-int?]
    [:table-id pos-int?]
    [:database-id pos-int?]]
   ;; model without a table
   [:map {:closed true}
    [:model-id pos-int?]
    [:collection-id pos-int?]
    [:database-id pos-int?]]
   ;; dashcard with both card and table
   [:map {:closed true}
    [:dashcard-id pos-int?]
    [:dashboard-id pos-int?]
    [:collection-id pos-int?]
    [:card-id pos-int?]
    [:table-id pos-int?]
    [:database-id pos-int?]]
   ;; dashcard with card but no table
   [:map {:closed true}
    [:dashcard-id pos-int?]
    [:dashboard-id pos-int?]
    [:collection-id pos-int?]
    [:card-id pos-int?]
    [:database-id pos-int?]]
   ;; non-card dashcard
   [:map {:closed true}
    [:dashcard-id pos-int?]
    [:dashboard-id pos-int?]
    [:collection-id pos-int?]]
   ;; table crud
   [:map {:closed true}
    [:rest-api [:enum :table]]
    [:table-id pos-int?]
    [:database-id pos-int?]]
   ;; for now, webhooks can only point at tables, not editables
   [:map {:closed false}
    [:webhook-id pos-int?]
    [:table-id pos-int?]
    [:database-id pos-int?]]])
