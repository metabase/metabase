(ns metabase.eastwood
  (:require [eastwood.lint :as eastwood]))

(defn eastwood []
  (eastwood/-main))
