(ns metabase.models.dimensions
  (:require [toucan.models :as models]))

(def dimension-types
  "Possible values for `Dimensions.type`"
  #{:internal
    :external})

(models/defmodel Dimensions :dimensions)
