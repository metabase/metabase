(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase.api.macros :as api.macros]))

(defn change-event [payload])

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {:keys [event payload]}]
  (case event
    "change" (change-event payload)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
