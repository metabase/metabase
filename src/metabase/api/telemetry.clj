(ns metabase.api.telemetry
  "Utilities for adding telemetry to our API endpoints."
  (:require
    [metabase.models.interface :as mi]
    [steffan-westcott.clj-otel.api.trace.span :as span]
    [toucan2.core :as t2]))

(defmacro hydrate
  "A telemetry-wrapped version of hydrate. Simply replace t2/hydrate with te/hydrate."
  [entity & args]
  `(let [entity# ~entity
         model#  (mi/model entity#)]
     (span/with-span!
       {:name       "hydrate"
        :attributes {:model model#
                     (keyword (name model#) "id")
                     (:id entity#)}}
       (t2/hydrate entity# ~@args))))
