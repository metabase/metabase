(ns i18n.common
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabuild-common.core :as u])
  (:import
   (org.fedorahosted.tennera.jgettext Catalog HeaderFields Message PoParser)))

(set! *warn-on-reflection* true)

(defn source-directory!
  "Return the supplied catalog directory, or fetch the pinned catalogs."
  []
  (let [directory (or (System/getenv "METABASE_I18N_SOURCE_DIR")
                      (first (u/sh {:dir u/project-root-directory, :quiet? true}
                                   "bash" "bin/i18n/fetch-translations")))]
    (u/assert-file-exists (str (io/file directory "metabase.po")))
    (u/assert-file-exists (str (io/file directory "en-ZZ.po")))
    directory))

(defn locales
  "Set of all locales for which we have i18n bundles.

    (locales) ; -> #{\"nl\" \"pt\" \"zh\" \"tr\" \"it\" \"fa\" ...}"
  ([]
   (locales (source-directory!)))
  ([directory]
   (into
    (sorted-set)
    (for [^java.io.File file (.listFiles (io/file directory))
          :let               [file-name (.getName file)]
          :when              (and (str/ends-with? file-name ".po")
                                  (not (str/starts-with? file-name "metabase")))]
      (str/replace file-name #"\.po$" "")))))

(defn locale-source-po-filename
  "Path to the catalog for `locale` in the current translation source directory."
  ([locale]
   (locale-source-po-filename locale (source-directory!)))
  ([locale directory]
   (str (io/file directory (format "%s.po" locale)))))

;; see https://github.com/zanata/jgettext/tree/master/src/main/java/org/fedorahosted/tennera/jgettext

(defn- catalog ^Catalog [locale directory]
  (let [parser (PoParser.)]
    (.parseCatalog parser (io/file (locale-source-po-filename locale directory)))))

(defn- po-headers [locale directory]
  (when-let [^Message message (.locateHeader (catalog locale directory))]
    (let [header-fields (HeaderFields/wrap (.getMsgstr message))]
      (into {} (for [^String k (.getKeys header-fields)]
                 [k (if (= k "Language")
                      locale
                      (.getValue header-fields k))])))))

(defn- po-messages-seq [locale directory]
  (for [^Message message (iterator-seq (.iterator (catalog locale directory)))
        ;; remove any empty translations
        :when            (not (str/blank? (.getMsgid message)))]
    {:id                (.getMsgid message)
     :id-plural         (.getMsgidPlural message)
     :str               (.getMsgstr message)
     :str-plural        (seq (.getMsgstrPlural message))
     :fuzzy?            (.isFuzzy message)
     :plural?           (.isPlural message)
     :source-references (seq (remove str/blank? (.getSourceReferences message)))
     ;; the `msgctxt` a message was extracted with (nil when it declares none). Part of a
     ;; message's identity: the same `msgid` can appear under several contexts.
     :context           (.getMsgctxt message)}))

(defn po-contents
  "Contents of the PO file for a `locale`."
  ([locale]
   (po-contents locale (source-directory!)))
  ([locale directory]
   {:headers  (po-headers locale directory)
    :messages (po-messages-seq locale directory)}))

(defn backend-message?
  "True if `message` (the shape returned by `po-messages-seq`) originates from a Clojure source file
  — i.e. one of its `:source-references` ends in `.clj` or `.cljc`. This is the same filter used by
  `i18n.create-artifacts.backend` when writing the backend `.edn` artifacts, and by `i18n.validation`
  when deciding which translations to sanity-check as `java.text.MessageFormat` patterns. Frontend
  strings use a different format system (`#, javascript-format` in the `.po`) and their own
  validation rules, so this scanner skips them."
  [{:keys [source-references]}]
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

(defn print-message-count-xform
  "Transducer that prints a count of how many translation strings we process/write."
  [rf]
  (let [num-messages (volatile! 0)]
    (fn
      ([]
       (rf))
      ([result]
       (u/announce "Wrote %d messages." @num-messages)
       (rf result))
      ([result message]
       (vswap! num-messages inc)
       (rf result message)))))
