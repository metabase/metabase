(ns metabase.models.dimensions
  (:require [toucan.models :as models]
            [metabase.util :as u]))

(def dimension-types
  "Possible values for `Dimensions.type`"
  #{:internal
    :external})

(models/defmodel Dimensions :dimensions)

(u/strict-extend (class Dimensions)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true})}))
