(ns metabase.util.fonts
  "font loading functionality."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util.files :as u.files]))

(def ^:private font-path "./resources/frontend_client/app/fonts/")

(defn- normalize-font-dir
  [path-or-string]
  (let [s (-> path-or-string
              str
              (str/split #"[-_\s]"))]
      (first (remove #{""} s))))

(defn- available-fonts*
  []
  (log/info (str "Reading available fonts from " font-path))
  (->> font-path
       u.files/get-path
       u.files/files-seq
       (map #(str/replace (str %) font-path ""))
       set))

(def ^{:arglists '([])} available-fonts
  "Return sorted set of available fonts, as Strings."
  (let [fonts (delay (available-fonts*))]
    (fn [] @fonts)))

(defn available-fonts-with-names
  "Returns all font directory names and their display names"
  []
  (sort-by first (map (juxt identity normalize-font-dir) (available-fonts))))
