(ns metabase-enterprise.uploads.api
  (:require
   [compojure.core :refer [DELETE]]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.upload :as upload]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint DELETE "/"
  "Delete the uploaded table(s) from the database."
  [id archive-cards :as {_raw-params :params}]
  {id            (ms/QueryVectorOf ms/PositiveInt)
   archive-cards [:maybe {:default false} ms/BooleanValue]}
  (let [deleted-ids (atom [])]
    (try
      (let [ids           id
            tables        (t2/select :model/Table :id [:in ids])
            not-found-ids (remove (into #{} (map :id) tables) ids)]

        ;; Delete the tables one by one so that each is atomic.
        (doseq [t tables]
          (when (= :done (upload/delete-upload! t :archive-cards? archive-cards))
            (swap! deleted-ids conj (:id t))))

        {:status 200
         :body   {:deleted   @deleted-ids
                  :not-found not-found-ids}})
      (catch Throwable e
        {:status (or (-> e ex-data :status-code)
                     500)
         :body   {:deleted @deleted-ids
                  :message (or (ex-message e)
                               (tru "There was an error deleting the table{0}" (when (>= (count id) 2) "s")))}}))))

(api/define-routes +auth)
