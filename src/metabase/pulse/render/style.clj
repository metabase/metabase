(ns metabase.pulse.render.style
  "CSS styles and related helper code for Pulse rendering."
  (:require [clojure.string :as str]))

(defn style
  "Compile one or more CSS style maps into a string.

     (style {:font-weight 400, :color \"white\"}) -> \"font-weight: 400; color: white;\""
  [& style-maps]
  (str/join " " (for [[k v] (into {} style-maps)
                      :let  [v (if (keyword? v) (name v) v)]]
                  (str (name k) ": " v ";"))))

(def ^:const color-brand      "rgb(45,134,212)")
(def ^:const color-purple     "rgb(135,93,175)")
(def ^:const color-gold       "#F9D45C")
(def ^:const color-error      "#EF8C8C")
(def ^:const color-gray-1     "rgb(248,248,248)")
(def ^:const color-gray-2     "rgb(189,193,191)")
(def ^:const color-gray-3     "rgb(124,131,129)")
(def ^:const color-gray-4 "A ~25% Gray color." "rgb(57,67,64)")
(def ^:const color-dark-gray  "#616D75")
(def ^:const color-row-border "#EDF0F1")


(defn- primary-color []
  color-brand)

(defn font-style []
  {:font-family "Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif"})

(defn section-style
  "CSS style for a Pulse section."
  []
  (font-style))

(defn header-style []
  (merge
   (font-style)
   {:font-size       :16px
    :font-weight     700
    :color           color-gray-4
    :text-decoration :none}))

(defn scalar-style []
  (merge
   (font-style)
   {:font-size   :24px
    :font-weight 700
    :color       (primary-color)}))
