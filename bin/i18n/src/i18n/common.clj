(ns i18n.common
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabuild-common.core :as u])
  (:import [org.fedorahosted.tennera.jgettext Catalog HeaderFields Message PoParser]))

(defn locales
  "Set of all locales for which we have i18n bundles.

    (locales) ; -> #{\"nl\" \"pt\" \"zh\" \"tr\" \"it\" \"fa\" ...}"
  []
  (set (for [^java.io.File file (.listFiles (io/file (u/filename u/project-root-directory "locales")))
             :let               [file-name (.getName file)]
             :when              (str/ends-with? file-name ".po")]
         (str/replace file-name #"\.po$" ""))))

(defn locale-source-po-filename [locale]
  (u/filename u/project-root-directory "locales" (format "%s.po" locale)))

;; see https://github.com/zanata/jgettext/tree/master/src/main/java/org/fedorahosted/tennera/jgettext

(defn- catalog ^Catalog [locale]
  (let [parser (PoParser.)]
    (.parseCatalog parser (io/file (locale-source-po-filename locale)))))

(defn po-headers [locale]
  (when-let [^Message message (.locateHeader (catalog locale))]
    (let [header-fields (HeaderFields/wrap (.getMsgstr message))]
      (into {} (for [^String k (.getKeys header-fields)]
                 [k (.getValue header-fields k)])))))

(defn po-messages-seq [locale]
  (for [^Message message (iterator-seq (.iterator (catalog locale)))
        ;; remove any empty translations
        :when            (not (str/blank? (.getMsgid message)))]
    {:id                (.getMsgid message)
     :id-plural         (.getMsgidPlural message)
     :str               (.getMsgstr message)
     :str-plural        (seq (remove str/blank? (.getMsgstrPlural message)))
     :fuzzy?            (.isFuzzy message)
     :plural?           (.isPlural message)
     :source-references (seq (remove str/blank? (.getSourceReferences message)))
     :comment           (.getMsgctxt message)}))

(defn po-contents [locale]
  {:headers  (po-headers locale)
   :messages (po-messages-seq locale)})

(defn print-message-count-xform [rf]
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
