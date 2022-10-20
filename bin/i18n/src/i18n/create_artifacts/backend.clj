(ns i18n.create-artifacts.backend
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [i18n.common :as i18n]
            [metabuild-common.core :as u])
  (:import [java.io FileOutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defn- backend-message? [{:keys [source-references]}]
  (boolean
   (let [paths (eduction
                ;; Sometimes 2 paths exist in a single string, space separated
                (mapcat #(str/split % #" "))
                ;; Strip off the line number at the end of some paths
                (map #(str/split % #":"))
                (map first)
                source-references)]
     (some (fn [path]
             (some
              (fn [suffix]
                (str/ends-with? path suffix))
              [".clj" ".cljc"]))
           paths))))

(defn- plural->singular [{:keys [str-plural] :as message}]
  (merge message
         (when str-plural {:str (first str-plural)
                           :id-plural nil
                           :str-plural nil
                           :plural? false})))

(def ^:private apostrophe-regex
  "Regex that matches incorrectly escaped apostrophe characters.
  Matches on a single apostrophe surrounded by any letter, number, space, or diacritical character (chars with accents like é) and is case-insensitive"
  #"(?<![^a-zA-Z0-9\s\u00C0-\u017F])'(?![^a-zA-Z0-9\s\u00C0-\u017F])")

(defn- fix-unescaped-apostrophes [message]
  (update message :str str/replace apostrophe-regex "''"))

(defn- ->edn [{:keys [messages]}]
  (eduction
   (filter backend-message?)
   (map plural->singular)
   (map fix-unescaped-apostrophes)
   i18n/print-message-count-xform
   messages))

(def target-directory
  (u/filename u/project-root-directory "resources" "i18n"))

(defn- target-filename [locale]
  (u/filename target-directory (format "%s.edn" locale)))

(defn- write-edn-file! [po-contents target-file]
  (u/step "Write EDN file"
    (with-open [os (FileOutputStream. (io/file target-file))
                w  (OutputStreamWriter. os StandardCharsets/UTF_8)]
      (.write w "{\n")
      (doseq [{msg-id :id, msg-str :str} (->edn po-contents)]
        (.write w (pr-str msg-id))
        (.write w "\n")
        (.write w (pr-str msg-str))
        (.write w "\n\n"))
      (.write w "}\n"))))

(defn create-artifact-for-locale! [locale]
  (let [target-file (target-filename locale)]
    (u/step (format "Create backend artifact %s from %s" target-file (i18n/locale-source-po-filename locale))
      (u/create-directory-unless-exists! target-directory)
      (u/delete-file-if-exists! target-file)
      (write-edn-file! (i18n/po-contents locale) target-file)
      (u/assert-file-exists target-file))))
