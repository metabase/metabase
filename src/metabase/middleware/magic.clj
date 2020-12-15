(ns metabase.middleware.magic
  (:require [metabase.util.magic-map :as magic-map]
            metabase.util.magic-map.hacks))

(comment metabase.util.magic-map.hacks/keep-me)

(defn convert-to-magic-maps
  "Convert all maps in `request` to magic maps."
  [handler]
  (fn [request respond raise]
    (handler (magic-map/magical-mappify request) respond raise)))
