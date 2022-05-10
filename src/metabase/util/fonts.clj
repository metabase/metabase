(ns metabase.util.fonts
  "font loading functionality."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util.files :as u.files]))

(def ^:private font-path "./resources/frontend_client/app/fonts/")

(defn- normalize-font-path
  [path]
  (-> path
      str
      (str/replace font-path "")
      (str/split #"-")
      first))

(defn- available-fonts*
  []
  (log/info (str "Reading available fonts from " font-path))
  (->> font-path
       u.files/get-path
       u.files/files-seq
       (map normalize-font-path)
       set))

(def ^{:arglists '([])} available-fonts
  "Return sorted set of available fonts, as Strings."
  (let [fonts (delay (available-fonts*))]
    (fn [] @fonts)))

(def ^:private font-dir->font-name
  {"lato" "Lato"})

(defn available-fonts-with-names
  "Returns all font directory names and their full names"
  []
  (sort-by first (for [font-dir (available-fonts)]
                   [font-dir (font-dir->font-name font-dir)])))
