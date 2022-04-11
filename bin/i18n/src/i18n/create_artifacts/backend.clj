(ns i18n.create-artifacts.backend
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [i18n.common :as i18n]
            [metabuild-common.core :as u])
  (:import [java.io FileOutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defn- backend-message? [{:keys [source-references]}]
  (some (fn [path]
          (some
           (fn [dir]
             (str/starts-with? path dir))
           ["src" "backend" "enterprise/backend" "shared"]))
        source-references))

(defn- ->edn [{:keys [messages]}]
  (eduction
   (filter backend-message?)
   (remove :plural?)
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
