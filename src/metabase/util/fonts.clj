(ns metabase.util.fonts
  "font loading functionality."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util.files :as u.files]))

(def font-path
  "font resources path as a String."
  "./resources/frontend_client/app/fonts/")

(defn- normalize-font-dirname
  "Use a font's directory to derive a Display Name.

  Underscores become spaces, and then split on dashes and take the first word.
  This is done because of the Lato-v16-latin directory name."
  [dirname]
  (-> dirname
      (str/split #"-")
      first
      (str/replace #"_" " ")))

(defn- contains-font-file?
  [path]
  ;; todo: expand this to allow other font formats?
  (some #(str/includes? % ".woff") (u.files/files-seq path)))

(defn- available-fonts*
  []
  (log/info (str "Reading available fonts from " font-path))
  (->> font-path
       u.files/get-path
       u.files/files-seq
       (filter contains-font-file?)
       (map #(str/replace (str %) font-path ""))
       (map normalize-font-dirname)
       (sort-by #(str/lower-case %))))

(def ^{:arglists '([])} available-fonts
  "Return an alphabetically sorted list of available fonts, as Strings."
  (let [fonts (delay (available-fonts*))]
    (fn [] @fonts)))

(defn available-font?
  "True if a font's 'Display String', `font`, is a valid font available on this system."
  [font]
  (boolean
   ((set (available-fonts)) font)))
