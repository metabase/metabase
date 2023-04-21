(ns metabase.util.fonts
  "font loading functionality."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]))

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
  (u.files/with-open-path-to-resource [font-path "frontend_client/app/fonts"]
    (let [font-path-str (str font-path "/")]
      (log/info (str "Reading available fonts from " font-path))
      (->> font-path
           u.files/files-seq
           (filter contains-font-file?)
           (map #(str/replace (str %) font-path-str ""))
           (map normalize-font-dirname)
           (sort-by u/lower-case-en)))))

(def ^{:arglists '([])} available-fonts
  "Return an alphabetically sorted list of available fonts, as Strings."
  (let [fonts (delay (available-fonts*))]
    (fn [] @fonts)))

(defn available-font?
  "True if a font's 'Display String', `font`, is a valid font available on this system."
  [font]
  (boolean
   ((set (available-fonts)) font)))
