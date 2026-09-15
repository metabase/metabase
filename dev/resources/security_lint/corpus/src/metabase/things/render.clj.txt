(ns metabase.things.render
  "Security-lint test example: markup built with hiccup 1, which does not escape, and by concatenation."
  (:require
   [hiccup.core :refer [h html]]))

(defn heading [title] (html [:h1 title]))
(defn safe-heading [title] (html [:h1 (h title)]))
(defn icon [color] (str "<svg fill=\"" color "\"></svg>"))
