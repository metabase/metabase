#!/usr/bin/env bb

(ns athena
  (:require
   [babashka.cli :as cli]
   [babashka.process :as p]
   [clojure.data.xml :as x]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.zip :as z]))

;; Since amazon is still not putting their athena jdbc on to maven, the easiest thing for us to do is setup a maven-y s3 repo and copy their jar into it.
;;
;; This script allows you to run:
;; ./bin/athena.bb <version> [--deploy]
;;
;; For example:
;; ./bin/athena.bb 2.0.35 --deploy
;;
;; Will download the 2.0.35 jar from amazon's release bucket, create and update the necessary maven repo files, then upload all those files to our maven repo.
;;
;; It publishes both the uber-jar (with-dependencies) as `athena-jdbc` and the thin jar as `athena-jdbc-thin`.
;;
;; You must have bb (babashka), aws (awscli), and shasum commands available. You must have aws credentials available, e.g. through aws configure

(def s3-bucket "s3://metabase-maven-downloads/")
(def maven-base-url "https://s3.amazonaws.com/metabase-maven-downloads/")
(def athena-downloads-url "https://s3.amazonaws.com/athena-downloads/")

(defn find-pred [z p?]
  (->> (iterate z/next z)
       (take-while (every-pred some? (complement z/end?)))
       (some #(when (-> % z/node p?) %))))

(defn tag= [tag]
  (fn [node]
    (= tag (:tag node))))

(defn content= [v]
  (cond
    (string? v) (fn [node]
                  (= v (str/join (:content node))))
    (fn? v)     (fn [node]
                  (v (str/join (:content node))))
    :else       (assert false "what did you pass")))

(defn topmost [z]
  (loop [z z]
    (if-let [parent (z/up z)]
      (recur parent)
      z)))

(defn jar-file-name [artifact-id version]
  (str artifact-id "-" version ".jar"))

(defn version-exists? [artifact-id version]
  (let [metadata-url (str maven-base-url "com/metabase/" artifact-id "/maven-metadata.xml")]
    (try
      (let [existing (x/parse (io/reader metadata-url))
            z        (z/xml-zip existing)]
        (boolean (find-pred z (every-pred (tag= :version)
                                          (content= version)))))
      (catch Exception _ false))))

(defn create-new-metadata [artifact-id version]
  (let [metadata-url (str maven-base-url "com/metabase/" artifact-id "/maven-metadata.xml")
        existing     (try
                       (x/parse (io/reader metadata-url))
                       (catch Exception _
                         ;; No existing metadata — create fresh
                         (x/element :metadata {}
                                    (x/element :groupId {} "com.metabase")
                                    (x/element :artifactId {} artifact-id)
                                    (x/element :versioning {}
                                               (x/element :release {} version)
                                               (x/element :versions {})))))
        z            (z/xml-zip existing)]
    (let [indent (-> z (find-pred (tag= :versions)) z/down first)
          indent (when (string? indent) indent)
          xml    (-> z
                     (find-pred (tag= :versions))
                     (z/insert-child (x/element :version {} version))
                     (z/insert-child indent)
                     topmost
                     (find-pred (tag= :release))
                     (z/down)
                     (z/replace version)
                     (z/root))]
      (println version "=> maven-metadata.xml (" artifact-id ")")
      (with-open [w (io/writer "maven-metadata.xml")]
        (x/emit xml w)))))

(defn download-uber-jar [version]
  (let [base-url  athena-downloads-url
        downloads (x/parse (io/reader base-url))
        z         (z/xml-zip downloads)
        jar-file  (-> z
                      (find-pred (every-pred
                                  (tag= (keyword "xmlns.http%3A%2F%2Fs3.amazonaws.com%2Fdoc%2F2006-03-01%2F" "Key"))
                                  (content= #(str/ends-with? % (str version "-with-dependencies.jar")))))
                      z/node
                      :content
                      str/join)
        local-name (jar-file-name "athena-jdbc" version)]
    (println jar-file "=>" local-name)
    (p/shell "curl --progress-bar -o " local-name (str base-url jar-file))
    local-name))

(defn pom-file-name [artifact-id version]
  (str artifact-id "-" version ".pom"))

(defn download-lean-zip
  "Downloads and extracts the lean zip, returning the zip-file path for cleanup."
  [version]
  (let [zip-url  (str athena-downloads-url "drivers/JDBC/" version
                      "/athena-jdbc-" version "-lean-jar-and-separate-dependencies-jars.zip")
        zip-file (str "athena-jdbc-thin-" version ".zip")]
    (println zip-url "=>" zip-file)
    (p/shell "curl --progress-bar -o" zip-file zip-url)
    zip-file))

(defn download-thin-jar [version]
  (let [zip-file   (download-lean-zip version)
        local-name (jar-file-name "athena-jdbc-thin" version)
        pom-name   (pom-file-name "athena-jdbc-thin" version)]
    ;; Extract the thin jar and pom.xml from the zip
    (p/shell "unzip" "-o" "-j" zip-file (str "athena-jdbc-" version ".jar") "pom.xml" "-d" ".")
    ;; Rename to our artifact names
    (let [extracted (str "athena-jdbc-" version ".jar")]
      (when (not= extracted local-name)
        (.renameTo (io/file extracted) (io/file local-name))))
    (.renameTo (io/file "pom.xml") (io/file pom-name))
    (.delete (io/file zip-file))
    local-name))

(def athena-streaming-version "2.0")

(defn download-athena-streaming [version]
  (let [zip-file   (download-lean-zip version)
        src-name   "AthenaStreamingJavaClient-2.0.jar"
        local-name (jar-file-name "athena-streaming" athena-streaming-version)]
    ;; Extract athena-streaming from runtime-dependencies/
    (p/shell "unzip" "-o" "-j" zip-file (str "runtime-dependencies/" src-name) "-d" ".")
    (.renameTo (io/file src-name) (io/file local-name))
    (.delete (io/file zip-file))
    local-name))

(defn create-sha1 [fname]
  (let [sha1 (-> (p/shell {:out :string} "shasum -a 1" fname)
                 :out
                 (str/split #"\s+")
                 first)]
    (println "sha1(jar) =>" (str fname ".sha1"))
    (with-open [w (io/writer (str fname ".sha1"))]
      (.write w sha1))))

(defn copy-to-s3 [artifact-id version jar-fname]
  (let [root-dir (str "com/metabase/" artifact-id "/")
        pom-name (pom-file-name artifact-id version)
        files    (cond-> [{:remote-dir (str version "/") :fname jar-fname}
                          {:remote-dir (str version "/") :fname (str jar-fname ".sha1")}]
                   (.exists (io/file "maven-metadata.xml"))
                   (conj {:remote-dir nil :fname "maven-metadata.xml"})
                   (.exists (io/file pom-name))
                   (conj {:remote-dir (str version "/") :fname pom-name}))]
    (doseq [{:keys [remote-dir fname]} files
            :let [target (str s3-bucket root-dir remote-dir fname)]]
      (println fname "=>" target)
      (p/shell "aws s3 cp" fname target))))

(defn deploy-artifact [artifact-id version download-fn deploy? force?]
  (if (and (not force?) (version-exists? artifact-id version))
    (println "Version" version "already exists for" artifact-id "— skipping (use --force to re-deploy)")
    (do
      (when-not (version-exists? artifact-id version)
        (create-new-metadata artifact-id version))
      (let [jar-fname (download-fn version)]
        (create-sha1 jar-fname)
        (when deploy?
          (copy-to-s3 artifact-id version jar-fname))))))

(defn deploy [version deploy? force?]
  (println "=== Publishing uber-jar (athena-jdbc) ===")
  (deploy-artifact "athena-jdbc" version download-uber-jar deploy? force?)
  (println)
  (println "=== Publishing thin jar (athena-jdbc-thin) ===")
  (deploy-artifact "athena-jdbc-thin" version download-thin-jar deploy? force?)
  (println)
  (println "=== Publishing athena-streaming ===")
  (deploy-artifact "athena-streaming" athena-streaming-version
                   (fn [_] (download-athena-streaming version))
                   deploy? force?))

(when (= *file* (System/getProperty "babashka.file"))
  (let [{:keys [args opts]} (cli/parse-args *command-line-args* {:coerce {:deploy :boolean :force :boolean}})]
    (when-let [version (first args)]
      (deploy version (:deploy opts) (:force opts)))))
