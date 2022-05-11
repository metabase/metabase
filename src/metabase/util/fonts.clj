(ns metabase.util.fonts
  "font loading functionality."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util.files :as u.files]))

(def ^:private font-path "./resources/frontend_client/app/fonts/")

(defn- available-font-paths
  []
  (log/info (str "Reading available fonts from " font-path))
  (->> font-path
       u.files/get-path
       u.files/files-seq))

(defn- partial-file-name
  [parent-path path]
  (-> (str path)
      (str/replace (str parent-path "/") "")
      (str/split #"-")
      first))

(defn- font-dir->font-name
  "Compare the names of the actual font file with the directory to try determine the Display Name."
  [path]
  (let [potential-name (-> (str path)
                           (str/replace font-path "")
                           (str/replace #"_" " "))
        no-spaces-name (str/replace potential-name #" " "")
        font-files-partial-name (first (map #(partial-file-name path %) (u.files/files-seq path)))]
    (if (= (str/lower-case no-spaces-name)
           (str/lower-case font-files-partial-name))
      potential-name
      (str/capitalize font-files-partial-name))))

(defn- available-fonts*
  []
  (->> font-path
       u.files/get-path
       u.files/files-seq
       (map font-dir->font-name)
       (sort-by #(str/lower-case %))))

(def ^{:arglists '([])} available-fonts
  "Return sorted set of available fonts, as Strings."
  (let [fonts (delay (available-fonts*))]
    (fn [] @fonts)))
