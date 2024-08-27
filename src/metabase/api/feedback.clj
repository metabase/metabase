(ns metabase.api.feedback
  "/api/feedback endpoints."
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint POST "/"
  "Submit feedback to the `feedback` table."
  [body]
  ;; Define the schema for incoming feedback
  {body [:map
         [:submitted_by [:maybe :string]]
         [:task [:maybe :string]]
         [:chat_history [:maybe :string]]
         [:description [:maybe :string]]
         [:subject [:maybe :string]]]}
  ;; Insert feedback into the table
  (t2/insert! :feedback body))

(api/define-routes)
