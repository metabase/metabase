(ns i18n.create-artifacts.frontend
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [i18n.common :as i18n]
   [metabuild-common.core :as u])
  (:import
   (java.io FileOutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- frontend-message?
  "Whether this i18n `message` comes from a frontend source file."
  [{:keys [source-references]}]
  (some #(re-find #"frontend|cljs|cljc" %) source-references))

(defn- ->ttag-reference
  "Replace an xgettext `{0}` style reference with a ttag `${ 0 }` style reference."
  [message-id]
  (str/replace message-id #"\{\s*(\d+)\s*\}" "\\${ $1 }"))

(defn- ->translations-map [messages]
  {"" (into {}
            (comp
             ;; filter out i18n messages that aren't used on the FE client
             (filter frontend-message?)
             i18n/print-message-count-xform
             (map (fn [message]
                    [(->ttag-reference (:id message))
                     (if (:plural? message)
                       {:msgid_plural (:id-plural message)
                        :msgstr       (map ->ttag-reference (:str-plural message))}
                       {:msgstr [(->ttag-reference (:str message))]})])))
            messages)})

(defn- ->i18n-map
  "Convert the contents of a `.po` file to map format used in the frontend client."
  [po-contents]
  {:charset      "utf-8"
   :headers      (into {} (for [[k v] (:headers po-contents)]
                            [(str/lower-case k) v]))
   :translations (->translations-map (:messages po-contents))})

(defn- i18n-map [locale]
  (->i18n-map (i18n/po-contents locale)))

(def target-directory
  "Target directory for frontend i18n resources."
  (u/filename u/project-root-directory "resources" "frontend_client" "app" "locales"))

(defn- target-filename [locale]
  (u/filename target-directory (format "%s.json" (str/replace locale #"-" "_"))))

(defn create-artifact-for-locale!
  "Create an artifact with translated strings for `locale` for frontend (JS) usage."
  [locale]
  (let [target-file (target-filename locale)]
    (u/step (format "Create frontend artifact %s from %s" target-file (i18n/locale-source-po-filename locale))
      (u/create-directory-unless-exists! target-directory)
      (u/delete-file-if-exists! target-file)
      (u/step "Write JSON"
        (with-open [os (FileOutputStream. (io/file target-file))
                    w  (OutputStreamWriter. os StandardCharsets/UTF_8)]
          (json/generate-stream (i18n-map locale) w)))
      (u/assert-file-exists target-file))))
