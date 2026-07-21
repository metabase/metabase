(ns metabase.typed-schemas.schema
  "Top-level typed schema helpers."
  (:require
   [metabase.system.core :as system]
   [metabase.typed-schemas.common :as common])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(defn base-schema
  "Returns the top-level typed schema map."
  [questions models tables metrics]
  (array-map
   :schemaVersion 2
   :generatedAt   (str (Instant/now))
   :metabase      {:instanceUrl (system/site-url)}
   :questions     (common/keyed-map questions)
   :models        (common/keyed-model-map models)
   :tables        (common/keyed-map tables)
   :metrics       (common/keyed-map metrics)))
