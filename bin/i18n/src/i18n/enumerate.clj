(ns i18n.enumerate
  "Enumerate and create pot file from the backend worktree of metabase."
  (:require
   [clojure.java.io :as io]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [grasp.api :as g]
   [metabuild-common.core :as u])
  (:import [org.fedorahosted.tennera.jgettext
            Catalog HeaderFields HeaderUtil HeaderFields Message PoWriter]))

(set! *warn-on-reflection* true)

(def ^:private roots (into [] (map (partial str u/project-root-directory))
                           ["/src" "/shared/src" "/enterprise/backend/src"]))

(defn- strip-roots
  [path]
  (str/replace path
               (re-pattern (str/join "|" (map #(str "file:" % "/") roots)))
               ""))

(s/def ::translate (s/and
                     (complement vector?)
                     (s/cat :translate-symbol (fn [x]
                                               (and (symbol? x)
                                                    (#{"trs" "deferred-trs"
                                                       "tru" "deferred-tru"}
                                                      (name x))))
                            :args (s/+ any?))))

(defn- form->string-for-translation
  "Function that turns a form into the translation string. At the moment
  it is just the second arg of the form. Afterwards it will need to
  concat string literals in a `(str \"foo\" \"bar\")` situation. "
  [form]
  (second form))

(defn- analyze-translations
  [roots]
  (map (fn [result]
         (let [{:keys [line _col uri]} (meta result)]
           {:file (strip-roots uri)
            :line line
            :message (form->string-for-translation result)}))
       (g/grasp roots ::translate)))

(defn- group-results-by-filename
  "Want all filenames collapsed into a list for each form"
  [results]
  (->> results
       (sort-by :file)
       (group-by :message)
       (sort-by (comp :file first val))
       (map (fn [[string originals]]
              {:message string :files (map #(select-keys % [:file :line]) originals)}))))

(defn- usage->Message
  ^Message [{:keys [message files]}]
  (let [msg (Message.)]
    (.setMsgid msg message)
    (doseq [file files]
      (if-let [line (:line file)]
        (.addSourceReference msg (:file file) line)
        (.addSourceReference msg (:file file))))
    msg))

(defn- header
  "Headers are just another message. Create one with our info."
  ^Message []
  (let [hv (HeaderFields.)
        now (.format (java.text.SimpleDateFormat. "yyyy-MM-dd HH:mmZ")
                     (java.util.Date.))]
    (doseq [[prop value] [[HeaderFields/KEY_ProjectIdVersion "1.0"]
                          [HeaderFields/KEY_ReportMsgidBugsTo "docs@metabase.com"]
                          [HeaderFields/KEY_PotCreationDate now]
                          [HeaderFields/KEY_MimeVersion "1.0"]
                          [HeaderFields/KEY_ContentType "text/plain; charset=UTF-8"]
                          [HeaderFields/KEY_ContentTransferEncoding "8bit"]]]
      (.setValue hv prop value))
    (let [message (.unwrap hv)]
      (doseq [comment ["Copyright (C) 2022 Metabase <docs@metabase.com>"
                       "This file is distributed under the same license as the Metabase package"]]
        (.addComment message comment))
      message)))

(defn processed->catalog
  "Takes the grouped usages and returns a catalog."
  ^Catalog [usages]
  (let [header (header)
        catalog (Catalog. true #_is-pot)]
    (.addMessage catalog header)
    (doseq [usage usages]
      (.addMessage catalog (usage->Message usage)))
    catalog))

(defn- create-pot-file!
  [sources filename]
  (let [analyzed-usages (group-results-by-filename (analyze-translations sources))]
    (when-let [not-strings (seq (remove (comp string? :message) analyzed-usages))]
      (println "Bad analysis: ")
      (run! (comp println pr-str) not-strings))
    (with-open [writer (io/writer filename)]
      (let [po-writer (PoWriter.)
            catalog   (processed->catalog (filter (comp string? :message) analyzed-usages))]
        (.write po-writer catalog writer)))
    (println "Created pot file at " filename)))

(defn -main
  "Entrypoint for creating a backend pot file."
  [& [filename]]
  (when (str/blank? filename)
    (println "Please provide a filename argument. Eg: ")
    (println "  clj -M -m i18n.enumerate \"$POT_BACKEND_NAME\"")
    (println "  clj -M -m i18n.enumerate metabase.pot")
    (System/exit 1))
  (create-pot-file! roots filename))

(comment

  (take 4 (analyze-translations roots))
  (def single-file (str u/project-root-directory "/src/metabase/driver.clj"))
  (preprocess-results (analyze-translations single-file))
  (create-pot-file! single-file "pot.pot")
  (map (juxt meta identity)
       (g/grasp single-file ::translate))
  )
