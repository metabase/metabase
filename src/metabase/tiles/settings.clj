(ns metabase.tiles.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting map-tile-server-url
  (i18n/deferred-tru "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.")
  :encryption :no
  :default    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  :visibility :public
  :audit      :getter)
