(ns metabase.public-sharing-rest.api.refusal
  "`/api/public-link-refusal` endpoints."
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
  "Why a new public link on a question, dashboard or document would be refused; `refusal` is null if it would not be refused."
  [{:keys [model id]} :- [:map {:closed true}
                          [:model [:enum "card" "dashboard" "document"]]
                          [:id    ms/PositiveInt]]]
  (let [model (model->toucan-model model)]
    (api/check-not-archived (public-sharing-rest.db/archivable-entity model id))
    {:refusal (public-sharing.validation/public-link-refusal model id)}))
