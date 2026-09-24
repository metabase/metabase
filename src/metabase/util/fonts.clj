(ns metabase.util.fonts
  "font loading functionality."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Path)
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(def ^:private bundled-fonts-resource
  "Classpath directory the frontend build emits bundled fonts into. The build stamps a content hash
  into each filename, so files here are looked up by pattern rather than by exact name."
  "frontend_client/app/dist/fonts")

(defn- normalize-font-dirname
  "Use a font's directory to derive a Display Name by changing underscores to spaces."
  [dirname]
  (str/replace dirname #"_" " "))

(defn- contains-font-file?
  [path]
  ;; todo: expand this to allow other font formats?
  (boolean (some #(str/includes? % ".woff") (u.files/files-seq path))))

(defn- available-fonts*
  []
  (u.files/with-open-path-to-resource [font-path bundled-fonts-resource]
    (let [font-path-str (str font-path "/")]
      (log/info (str "Reading available fonts from " font-path))
      (->> font-path
           u.files/files-seq
           (filter contains-font-file?)
           (map #(str/replace (str %) font-path-str ""))
           (map normalize-font-dirname)
           (sort-by u/lower-case-en)))))

(let [fonts (delay (available-fonts*))]
  (defn available-fonts
    "Return an alphabetically sorted list of available fonts, as Strings."
    []
    @fonts))

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
      ;; A face the build splits by `unicode-range` emits its latin chunk under the name the
      ;; whole face would have had, so this matches it and never the `.rest.` chunk, which
      ;; carries no latin glyphs and would render nothing in a rule with no `unicode-range`.
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
