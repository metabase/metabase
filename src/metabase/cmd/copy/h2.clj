(ns metabase.cmd.copy.h2
  "Functions for working with H2 databases shared between the `load-from-h2` and `dump-to-h2` commands."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- add-file-prefix-if-needed [h2-filename]
  (letfn [(prepend-protocol [s]
            (str "file:" (.getAbsolutePath (io/file s))))
          (remove-extension [s]
            (str/replace s #"\.mv\.db$" ""))]
    (cond-> h2-filename
      (not (str/starts-with? h2-filename "file:"))
      prepend-protocol

      (str/ends-with? h2-filename ".mv.db")
      remove-extension)))

(defn h2-data-source
  "Create a [[javax.sql.DataSource]] for the H2 database with `h2-filename`."
  ^javax.sql.DataSource [h2-filename]
  (let [h2-filename (add-file-prefix-if-needed h2-filename)]
    (mdb.data-source/broken-out-details->DataSource :h2 {:db h2-filename})))

(defn delete-existing-h2-database-files!
  "Delete existing h2 database files."
  [h2-filename]
  (doseq [filename [h2-filename
                    (str h2-filename ".mv.db")]]
    (when (.exists (io/file filename))
      (io/delete-file filename)
      (log/warn (u/format-color 'red (trs "Output H2 database already exists: %s, removing.") filename)))))
