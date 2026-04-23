(ns i18n.common
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabuild-common.core :as u])
  (:import
   (org.fedorahosted.tennera.jgettext Catalog HeaderFields Message PoParser)))

(set! *warn-on-reflection* true)

(defn locales
  "Set of all locales for which we have i18n bundles.

    (locales) ; -> #{\"nl\" \"pt\" \"zh\" \"tr\" \"it\" \"fa\" ...}"
  []
  (into
   (sorted-set)
   (for [^java.io.File file (.listFiles (io/file (u/filename u/project-root-directory "locales")))
         :let               [file-name (.getName file)]
         :when              (and (str/ends-with? file-name ".po")
                                 (not (str/starts-with? file-name "metabase")))]
     (str/replace file-name #"\.po$" ""))))

(defn locale-source-po-filename
  "E.g.

  (locale-source-po-filename \"fr\")
  ;; =>
  \"/home/cam/metabase/locales/fr.po\""
  [locale]
  (u/filename u/project-root-directory "locales" (format "%s.po" locale)))

;; see https://github.com/zanata/jgettext/tree/master/src/main/java/org/fedorahosted/tennera/jgettext

(defn- catalog ^Catalog [locale]
  (let [parser (PoParser.)]
    (.parseCatalog parser (io/file (locale-source-po-filename locale)))))

(defn- po-headers [locale]
  (when-let [^Message message (.locateHeader (catalog locale))]
    (let [header-fields (HeaderFields/wrap (.getMsgstr message))]
      (into {} (for [^String k (.getKeys header-fields)]
                 [k (if (= k "Language")
                      locale
                      (.getValue header-fields k))])))))

(defn- po-messages-seq [locale]
  (for [^Message message (iterator-seq (.iterator (catalog locale)))
        ;; remove any empty translations
        :when            (not (str/blank? (.getMsgid message)))]
    {:id                (.getMsgid message)
     :id-plural         (.getMsgidPlural message)
     :str               (.getMsgstr message)
     :str-plural        (seq (.getMsgstrPlural message))
     :fuzzy?            (.isFuzzy message)
     :plural?           (.isPlural message)
     :source-references (seq (remove str/blank? (.getSourceReferences message)))
     :comment           (.getMsgctxt message)}))

(defn po-contents
  "Contents of the PO file for a `locale`."
  [locale]
  {:headers  (po-headers locale)
   :messages (po-messages-seq locale)})

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
