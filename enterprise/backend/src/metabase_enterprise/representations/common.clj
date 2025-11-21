(ns metabase-enterprise.representations.common
  (:require
   [metabase-enterprise.representations.v0.core :as v0]))

(defn toucan-model
  "Given a representation, returns the internal Toucan model keyword we will use when importing to our app db."
  [& {:keys [version type]}]
  (case version
    :v0 (v0/toucan-model type)))
