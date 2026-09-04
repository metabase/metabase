(ns i18n.create-artifacts.frontend
  (:require
   ;; build tooling never loads app namespaces, so the metabase.util.json facade isn't usable here
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [i18n.common :as i18n]
   [metabuild-common.core :as u])
  (:import
   (java.io ByteArrayOutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(defn- frontend-message?
  "Whether this i18n `message` comes from a frontend source file."
  [{:keys [source-references]}]
  (some #(re-find #"frontend|cljs|cljc" %) source-references))

(defn- ->ttag-reference
  "Replace an xgettext `{0}` style reference with a ttag `${ 0 }` style reference."
  [message-id]
  (str/replace message-id #"\{\s*(\d+)\s*\}" "\\${ $1 }"))

(defn- ->translation-entry [message]
  [(->ttag-reference (:id message))
   (if (:plural? message)
     {:msgid_plural (:id-plural message)
      :msgstr       (map ->ttag-reference (:str-plural message))}
     {:msgstr [(->ttag-reference (:str message))]})])

(defn- ->translations-map
  "ttag looks a translation up by (context, msgid), so the top level of the map is keyed by the
  message's `msgctxt` — `\"\"` for the messages that declare none.

  Two messages may share a `msgid` as long as their contexts differ, e.g. `Year` exists both as a
  pluralized unit (`ngettext(\"Year\", \"Years\", n)`) and as a granularity option
  (``c(\"Date granularity option\").t`Year` ``). Keying by `msgid` alone collapsed them onto one
  entry, so the last one won and the other's translation was lost — including, for the pair above,
  the plural form that `ngettext` then failed to find."
  [messages drop-msgids]
  (let [frontend-messages (into []
                                (comp
                                 ;; filter out i18n messages that aren't used on the FE client
                                 (filter frontend-message?)
                                 (remove (fn [{:keys [id]}] (contains? drop-msgids id)))
                                 i18n/print-message-count-xform)
                                messages)]
    (into {}
          (map (fn [[context messages]]
                 [context (into {} (map ->translation-entry) messages)]))
          (group-by #(or (:context %) "") frontend-messages))))

(defn- ->i18n-map
  "Convert the contents of a `.po` file to map format used in the frontend client."
  [po-contents drop-msgids]
  {:charset      "utf-8"
   :headers      (into {} (for [[k v] (:headers po-contents)]
                            [(str/lower-case k) v]))
   :translations (->translations-map (:messages po-contents) drop-msgids)})

(def target-directory
  "Target directory for frontend i18n resources."
  (u/filename u/project-root-directory "resources" "frontend_client" "app" "locales"))

(defn locale-key
  "The name a locale is filed under, with dashes normalised the way the server normalises them."
  [locale]
  (str/replace locale #"-" "_"))

(defn- content-hash
  "First 10 hex characters of the SHA-256 of `bytes`. Long enough that a collision is not a
  practical concern, short enough to keep the filename readable."
  ^String [^bytes bytes]
  (->> (.digest (MessageDigest/getInstance "SHA-256") bytes)
       (take 5)
       (map #(format "%02x" %))
       (apply str)))

(defn- target-filename [locale content]
  (u/filename target-directory (format "%s.%s.json" (locale-key locale) (content-hash content))))

(defn create-artifact-for-locale!
  "Create an artifact with translated strings for `locale` for frontend (JS) usage.

  `drop-msgids` is a set of English source strings to exclude from the output (typically those
  whose translations had fatal validation errors).

  `po-contents` is the parsed + autofixed `.po` content from
  `(i18n.autofix/autofix-po-contents (i18n.common/po-contents locale))`. Passed by the caller
  rather than re-parsed here so scanner and writer stay in sync.

  Returns the artifact's file name, for the manifest that maps a locale to it.

  The name carries a hash of the contents so the file can be served with far-future cache
  headers. The server resolves a locale through the manifest rather than by building the name,
  since it cannot know the hash."
  [locale drop-msgids po-contents]
  (let [content     (with-open [os (ByteArrayOutputStream.)
                                w  (OutputStreamWriter. os StandardCharsets/UTF_8)]
                      (json/generate-stream (->i18n-map po-contents drop-msgids) w)
                      (.flush w)
                      (.toByteArray os))
        target-file (target-filename locale content)]
    (u/step (format "Create frontend artifact %s from %s" target-file (i18n/locale-source-po-filename locale))
      (u/create-directory-unless-exists! target-directory)
      (u/delete-file-if-exists! target-file)
      (u/step "Write JSON"
        (io/copy content (io/file target-file)))
      (u/assert-file-exists target-file))
    (.getName (io/file target-file))))
