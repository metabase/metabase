(ns metabase.api.fingerprint
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models
             [field :as field :refer [Field]]
             [field-values :refer [create-field-values-if-needed! field-should-have-field-values? FieldValues]]]))


(api/defendpoint GET "/field/:id"
  "Get fingerprint for a `Field` with ID."
  [id]
  (api/read-check Field id)
  {:min 1 :max 10})


(api/define-routes)