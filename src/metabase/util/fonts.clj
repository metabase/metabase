(ns metabase.util.fonts
  "font loading functionality."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.files :as u.files])
  (:import
   (java.nio.file Path)
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(def ^:private bundled-fonts-resource
  "Classpath directory the frontend build emits bundled fonts into. The build stamps a content hash
  into each filename, so files here are looked up by pattern rather than by exact name."
  "frontend_client/app/dist/fonts")

(defn bundled-fonts-available?
  "Whether the frontend build output the bundled font files come from is on the classpath. A packaged
  Metabase always carries it; a backend-only checkout does not."
  []
  (some? (io/resource bundled-fonts-resource)))

(def ^:private bundled-font-families
  "The font families Metabase ships, one per directory under `frontend/fonts`. The names live here
  rather than being read back from the build output so that the whitelabel setting validates the
  same way with or without a frontend build. `frontend/src/metabase/utils/fonts.ts` holds the
  matching front-end map, and [[metabase.util.fonts-test]] checks both against the build output."
  (sort-by u/lower-case-en
           ["Inter"
            "JetBrains Mono"
            "Lato"
            "Lora"
            "Merriweather"
            "Montserrat"
            "Noto Sans"
            "Open Sans"
            "Oswald"
            "PT Sans"
            "PT Serif"
            "Playfair Display"
            "Poppins"
            "Raleway"
            "Roboto"
            "Roboto Condensed"
            "Roboto Mono"
            "Roboto Slab"
            "Slabo 27px"
            "Source Sans Pro"
            "Ubuntu"]))

(defn available-fonts
  "Return an alphabetically sorted list of available fonts, as Strings."
  []
  bundled-font-families)

(defn available-font?
  "True if a font's 'Display String', `font`, is a valid font available on this system."
  [font]
  (boolean
   ((set (available-fonts)) font)))

(defn- font-dirname
  "Directory the build emits `font-name` into, e.g. \"PT Serif\" -> \"PT_Serif\"."
  [font-name]
  (str/replace font-name " " "_"))

(defn- find-hashed-file*
  [font-name stem ext]
  (let [dir (str bundled-fonts-resource "/" (font-dirname font-name))]
    (when (io/resource dir)
      (let [pattern (re-pattern (str (Pattern/quote stem) "\\.[a-f0-9]+\\." ext))]
        (u.files/with-open-path-to-resource [path dir]
          (some (fn [^Path p]
                  (let [filename (str (.getFileName p))]
                    (when (re-matches pattern filename) filename)))
                (u.files/files-seq path)))))))

(def ^{:arglists '([font-name stem ext])} find-hashed-file
  "Filename the build emitted for `stem`.`ext` of `font-name`, content hash included, or nil when the
  frontend has not been built. For example `(find-hashed-file \"Lato\" \"lato-v16-latin-700\" \"woff2\")`
  returns `\"lato-v16-latin-700.a1b2c3d4.woff2\"`."
  (memoize find-hashed-file*))

(defn hashed-font-url-path
  "Web path of a bundled font file, or nil when the frontend has not been built."
  [font-name stem ext]
  (when-let [filename (find-hashed-file font-name stem ext)]
    (str "/app/dist/fonts/" (font-dirname font-name) "/" filename)))
