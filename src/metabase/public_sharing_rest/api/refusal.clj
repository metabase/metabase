(ns metabase.public-sharing-rest.api.refusal
  "`/api/public-link-refusal` endpoints, which say whether a new public link would be refused."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.public-sharing-rest.db :as public-sharing-rest.db]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.util.malli.schema :as ms]))

(def ^:private model->toucan-model
  {"card"      :model/Card
   "dashboard" :model/Dashboard
   "document"  :model/Document})

(api.macros/defendpoint :get "/:model/:id" :- [:map {:closed true}
                                               [:refusal [:maybe ::public-sharing.validation/public-link-refusal]]]
  "Why a new public link on this question, dashboard or document would be refused, or a null `refusal` when one may
  be created."
  [{:keys [model id]} :- [:map {:closed true}
                          [:model [:enum "card" "dashboard" "document"]]
                          [:id    ms/PositiveInt]]]
  (let [model (model->toucan-model model)]
    ;; as the endpoints that create a public link do
    (api/check-not-archived (public-sharing-rest.db/archivable-entity model id))
    {:refusal (public-sharing.validation/public-link-refusal model id)}))
