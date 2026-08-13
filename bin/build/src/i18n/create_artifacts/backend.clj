(ns i18n.create-artifacts.backend
  (:require
   [clojure.java.io :as io]
   [i18n.common :as i18n]
   [metabuild-common.core :as u])
  (:import
   (java.io FileOutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- messages->edn
  [messages drop-msgids]
  (eduction
   (filter i18n/backend-message?)
   (remove (fn [{:keys [id]}] (contains? drop-msgids id)))
   i18n/print-message-count-xform
   messages))

(def target-directory
  "Target directory for backend i18n resources."
  (u/filename u/project-root-directory "resources" "i18n"))

(defn- target-filename [locale]
  (u/filename target-directory (format "%s.edn" locale)))

(defn- write-edn-file! [po-contents drop-msgids target-file]
  (u/step "Write EDN file"
    (with-open [os (FileOutputStream. (io/file target-file))
                w  (OutputStreamWriter. os StandardCharsets/UTF_8)]
      (.write w "{\n")
      (.write w ":headers\n")
      (.write w (pr-str (:headers po-contents)))
      (.write w "\n\n")
      (.write w ":messages\n")
      (.write w "{\n")
      (doseq [{msg-id :id, msg-str :str, msg-str-plural :str-plural}
              (messages->edn (:messages po-contents) drop-msgids)
              :let [msg-strs (or msg-str-plural [msg-str])]]
        (.write w (pr-str msg-id))
        (.write w "\n")
        (when msg-str-plural (.write w "["))
        (doseq [msg (butlast msg-strs)]
          (.write w (pr-str msg))
          (.write w " "))
        (.write w (pr-str (last msg-strs)))
        (when msg-str-plural (.write w "]"))
        (.write w "\n\n"))
      (.write w "}\n")
      (.write w "}\n"))))

(defn create-artifact-for-locale!
  "Create an artifact with translated strings for `locale` for backend (Clojure) usage.

  `drop-msgids` is a set of English source strings to exclude from the output (typically those
  whose translations had fatal validation errors); they fall back to English at runtime.

  `po-contents` is the parsed + autofixed `.po` content from
  `(i18n.autofix/autofix-po-contents (i18n.common/po-contents locale))`. Passed by the caller
  rather than re-parsed here so scanner and writer stay in sync."
  [locale drop-msgids po-contents]
  (let [target-file (target-filename locale)]
    (u/step (format "Create backend artifact %s from %s" target-file (i18n/locale-source-po-filename locale))
      (u/create-directory-unless-exists! target-directory)
      (u/delete-file-if-exists! target-file)
      (write-edn-file! po-contents drop-msgids target-file)
      (u/assert-file-exists target-file)
      (when (seq drop-msgids)
        (u/announce "Filtered %d invalid backend translations from %s" (count drop-msgids) locale)))))
