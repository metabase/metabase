(ns ^:deprecated metabase.api.label
  "`/api/label` endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST DELETE PUT]]
            [schema.core :as s]
            [metabase.api.common :refer [defendpoint define-routes write-check], :as api]
            [toucan.db :as db]
            [metabase.models.label :refer [Label]]
            [metabase.util :as u]
            [metabase.util.schema :as su]))

(defn warn-about-labels-being-deprecated
  "Print a warning message about Labels-related endpoints being deprecated."
  []
  (log/warn (u/format-color 'yellow "Labels are deprecated, and this API endpoint will be removed in a future version of Metabase.")))

(defendpoint GET "/"
  "[DEPRECATED] List all `Labels`. :label:"
  []
  (warn-about-labels-being-deprecated)
  (db/select Label {:order-by [:%lower.name]}))

(defendpoint POST "/"
  "[DEPRECATED] Create a new `Label`. :label:"
  [:as {{:keys [name icon]} :body}]
  {name su/NonBlankString
   icon (s/maybe su/NonBlankString)}
  (warn-about-labels-being-deprecated)
  (db/insert! Label, :name name, :icon icon))

(defendpoint PUT "/:id"
  "[DEPRECATED] Update a `Label`. :label:"
  [id :as {{:keys [name icon], :as body} :body}]
  {name (s/maybe su/NonBlankString)
   icon (s/maybe su/NonBlankString)}
  (warn-about-labels-being-deprecated)
  (write-check Label id)
  (db/update! Label id body)
  (Label id)) ; return the updated Label

(defendpoint DELETE "/:id"
  "[DEPRECATED] Delete a `Label`. :label:"
  [id]
  (warn-about-labels-being-deprecated)
  (write-check Label id)
  (db/delete! Label :id id)
  api/generic-204-no-content)


(define-routes)
