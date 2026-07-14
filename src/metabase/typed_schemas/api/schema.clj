(ns metabase.typed-schemas.api.schema
  "Top-level typed-schema assembly helpers."
  (:require
   [metabase.system.core :as system]
   [metabase.typed-schemas.api.common :as common])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(defn base-schema
  "Returns the top-level typed-schema map shared by every endpoint scope.

  The coordinator keeps this shape outside `api.clj` so endpoint code can focus
  on request validation/routing, while schema namespaces decide which generated
  sections are present. Empty sections stay present because SDK consumers expect
  stable top-level keys."
  [questions models tables metrics]
  (array-map
   :schemaVersion 2
   :generatedAt   (str (Instant/now))
   :metabase      {:instanceUrl (system/site-url)}
   :questions     (common/keyed-map questions)
   :models        (common/keyed-model-map models)
   :tables        (common/keyed-map tables)
   :metrics       (common/keyed-map metrics)))
