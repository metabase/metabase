(ns metabase.tiles.settings
  (:require
   [clojure.string :as str]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]))

(defn- valid-map-tile-server-url?
  "Whether `s` works as a map tile template: an absolute `http(s)` URL, or a path served by this instance (tiles behind
  the same reverse proxy). The `{s}`/`{z}`/`{x}`/`{y}` placeholders are substituted before the check, since braces are
  not legal URL syntax on their own. A protocol-relative `//host/...` is refused: it names an external host while
  reading as a local path, so it would slip past the origin the CSP `img-src` is built from."
  [s]
  (let [template (str/replace s #"\{[a-z]\}" "x")]
    (cond
      (str/starts-with? template "//") false
      (str/starts-with? template "/")  (not (re-find #"\s" template))
      :else                            (boolean (u/url? template)))))

(defsetting map-tile-server-url
  (i18n/deferred-tru "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.")
  :encryption :when-encryption-key-set
  :default    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  :visibility :public
  :audit      :getter
  :schema     [:fn {:error/message "an http(s) URL or a path on this instance"}
               valid-map-tile-server-url?])
