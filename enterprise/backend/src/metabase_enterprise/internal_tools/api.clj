(ns metabase-enterprise.internal-tools.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [data]}]
  ;; validate that we didn't receive auto-incrementing pks
  ;; insert!
  {:status 501
   :body   {:message (tru "Not implemented yet")}})

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [data]}]
  ;; validate that we got all the pks, and at least one other field
  ;; update!
  {:status 501
   :body   {:message (tru "Not implemented yet")}})

(api.macros/defendpoint :delete "/tables/:id"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [data]}]
  ;; validate that we receive all the pks, and nothing else
  ;; delete!
  {:status 501
   :body   {:message (tru "Not implemented yet")}})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/internal-tools routes."
  (api.macros/ns-handler *ns* +auth))

