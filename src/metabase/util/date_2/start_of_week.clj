(ns metabase.util.date-2.start-of-week
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]))

(defn start-of-week
  "Fetch the value of the `:start-of-week` setting from external sources. This lives in its own namespace to avoid
  circular deps."
  []
  (keyword
   (or
    (when (qp.store/initialized?)
      (lib.metadata.protocols/setting (qp.store/metadata-provider) :start-of-week))
    (public-settings/start-of-week))))
