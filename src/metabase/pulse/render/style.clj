(ns metabase.pulse.render.style
  "CSS styles and related helper code for Pulse rendering."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.awt Font GraphicsEnvironment)))

(set! *warn-on-reflection* true)

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

(def ^:const color-gold
  "Used as color for 'We were unable to display this Pulse' messages."
  "#F9D45C")

(def ^:const color-error
  "Color for error messages."
  "#EF8C8C")

(def ^:const color-gray-2
  "~75% gray."
  "#BDC1BF")

(def ^:const color-gray-3
  "~50% gray."
  "#7C8381")

(def ^:const color-gray-4
  "~25% gray."
  "#394340")

(def ^:const color-text-light
  "Color for light text."
  "#B8BBC3")

(def ^:const color-text-medium
  "Color for medium text."
  "#949AAB")

(def ^:const color-text-dark
  "Color for dark text."
  "#4C5773")

(def ^:const color-border
  "Used as color for the border of table, table header, and table body rows for charts with `:table` vizualization."
  "#F0F0F0")

;; don't try to improve the code and make this a plain variable, in EE it's customizable which is why it's a function.
;; Too much of a hassle to have it be a fn in one version of the code an a constant in another
(defn primary-color
  "Primary color to use in Pulses; normally 'classic' MB blue, but customizable when whitelabeling is enabled."
  []
  (public-settings/application-color))

(defn secondary-color
  "Secondary color to use in Pulse charts; normally red, but customizable when whitelabeling is enabled."
  []
  (public-settings/secondary-chart-color))

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
   {:font-size       :18px
    :font-weight     700
    :color           (primary-color)
    :text-decoration :none}))

(defn scalar-style
  "Style for a scalar display-type 'chart' in a Pulse."
  []
  (merge
   (font-style)
   {:font-size   :24px
    :font-weight 700
    :color       color-text-dark}))

(defn- register-font! [filename]
  (with-open [is (io/input-stream (io/resource filename))]
    (.registerFont (GraphicsEnvironment/getLocalGraphicsEnvironment)
                   (Font/createFont java.awt.Font/TRUETYPE_FONT is))))

(defn- register-fonts! []
  (try
    (register-font! "frontend_client/app/fonts/Lato/Lato-Regular.ttf")
    (doseq [weight ["700" "900"]]
      (register-font! (format "frontend_client/app/fonts/Lato/lato-v16-latin-%s.ttf" weight)))
    (catch Throwable e
      (let [message (str (trs "Error registering fonts: Metabase will not be able to send Pulses.")
                         " "
                         (trs "This is a known issue with certain JVMs. See {0} and for more details."
                              "https://github.com/metabase/metabase/issues/7986"))]
        (log/error e message)
        (throw (ex-info message {} e))))))

(defonce ^{:doc      "Makes custom fonts available to Java so that CSSBox can render them."
           :arglists '([])} register-fonts-if-needed!
  (let [register!* (delay (register-fonts!))]
    (fn []
      @register!*)))
