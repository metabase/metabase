(ns metabase-enterprise.uploads.api
  (:require
   [compojure.core :refer [DELETE]]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.upload :as upload]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint DELETE "/table/:id"
  "Delete the given uploaded table from the database."
  [id :as {_raw-params :params}]
  {id ms/PositiveInt}
  (try
    (let [table  (api/check-404 (t2/select-one :model/Table :id id))
          result (upload/delete-upload! table)]
      {:status 200
       :body   (= :done result)})
    (catch Throwable e
      {:status (or (-> e ex-data :status-code)
                   500)
       :body   {:message (or (ex-message e)
                             (tru "There was an error deleting the table"))}})))

(api/define-routes +auth)
