(ns metabase.api.fingerprint
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.fingerprinting :as fingerprinting]
            [metabase.models
             [field :as field :refer [Field]]
             [field-values :refer [create-field-values-if-needed! field-should-have-field-values? FieldValues]]]))


(api/defendpoint GET "/field/:id"
  "Get fingerprint for a `Field` with ID."
  [id]
  (->> id
       (api/read-check Field)
       fingerprinting/field-fingerprint))


(api/define-routes)
