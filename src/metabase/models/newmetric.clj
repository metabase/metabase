(ns metabase.models.newmetric
  (:require [metabase.mbql.normalize :as mbql.normalize]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel Newmetric :newmetric)

(models/add-type! ::measure
  :in mi/json-in
  :out (comp mbql.normalize/normalize-tokens mi/json-out-with-keywordization))

(models/add-type! ::dimensions
  :in mi/json-in
  :out (comp #(into [] (map (fn [[name form]]
                              [name (mbql.normalize/normalize-tokens form)])
                            %))
             mi/json-out-with-keywordization))

(u/strict-extend (class Newmetric)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:measure             ::measure
                              :dimensions          ::dimensions
                              :granularities       :keyword-set
                              :default_granularity :keyword})
          ;; todo: pre-insert/pre-update with verifications: should
          ;; check that metrics/dimensions seem to be in the metadata
          ;; of the source card_id

          ;; todo: serialization
          :properties (constantly {:timestamped? true})})

  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
