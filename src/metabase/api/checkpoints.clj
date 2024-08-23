(ns metabase.api.checkpoints
  "/api/checkpoints endpoints."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint GET "/"
  "Get all rows from the `postcheckpoints` table."
  []
  (->> (t2/select :postcheckpoints)  ;; Correctly reference the table directly
       (into [])))

(api/defendpoint GET "/:id"
  "Get a single row from the `postcheckpoints` table by ID."
  [id]
  {id ms/PositiveInt}
  (let [result (t2/select-one :postcheckpoints :id id)]
    ;; Ensure hydration only happens if needed
    (if result
      (t2/hydrate result :db)
      result)))

  
(api/define-routes)