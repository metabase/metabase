(ns metabase.pulse.render.style
  "CSS styles and related helper code for Pulse rendering."
  (:require [clojure.string :as str]))

;; TODO - we should move other CSS definitions from `metabase.pulse.render` namespaces into this one, so they're all
;; in one place.

(defn style
  "Compile one or more CSS style maps into a string.

     (style {:font-weight 400, :color \"white\"}) -> \"font-weight: 400; color: white;\""
  [& style-maps]
  (str/join " " (for [[k v] (into {} style-maps)
                      :let  [v (if (keyword? v) (name v) (str v))]
                      :when (seq v)]
                  (str (name k) ": " v ";"))))

(def ^:const color-brand
  "Classic Metabase blue."
  "#2D86D4")

(def ^:const color-purple
  "Used as background color for cells in bar chart tables."
  "#875DAF")

(def ^:const color-gold
  "Used as color for 'We were unable to display this Pulse' messages."
  "#F9D45C")

(def ^:const color-error
  "Color for error messages."
  "#EF8C8C")

(def ^:const color-gray-1
  "~97% gray."
  "#F8F8F8")

(def ^:const color-gray-2
  "~75% gray."
  "#BDC1BF")

(def ^:const color-gray-3
  "~50% gray."
  "#7C8381")

(def ^:const color-gray-4
  "~25% gray."
  "#394340")

(def ^:const color-text-medium
  "Color for medium text."
  "#74838f")

(def ^:const color-text-dark
  "Color for dark text."
  "#2E353B")

(def ^:const color-header-row-border
  "Used as color for the bottom border of table headers for charts with `:table` vizualization."
  "#EDF0F1")

(def ^:const color-body-row-border
  "Used as color for the bottom border of table body rows for charts with `:table` vizualization."
  "#F0F0F04D")

;; don't try to improve the code and make this a plain variable, in EE it's customizable which is why it's a function.
;; Too much of a hassle to have it be a fn in one version of the code an a constant in another
(defn primary-color
  "Primary color to use in Pulses. For CE, this is always the classic Metabase blue."
  []
  color-brand)

(defn font-style
  "Font family to use in rendered Pulses."
  []
  {:font-family "Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif"})

(defn section-style
  "CSS style for a Pulse section."
  []
  (font-style))

(defn header-style
  "Style for a header of a pulse section."
  []
  (merge
   (font-style)
   {:font-size       :16px
    :font-weight     700
    :color           color-gray-4
    :text-decoration :none}))

(defn scalar-style
  "Style for a scalar display-type 'chart' in a Pulse."
  []
  (merge
   (font-style)
   {:font-size   :24px
    :font-weight 700
    :color       (primary-color)}))
