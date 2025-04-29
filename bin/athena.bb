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
;; It uses the jar build WITHOUT the AWS SDK.
;;
;; You must have bb (babashka), aws (awscli), and shasum commands available. You must have aws credentials available, e.g. through aws configure

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

(defn jar-file-name [version]
  (str "athena-jdbc-" version ".jar"))

(defn create-new-metadata [version]
  (let [existing (x/parse (io/reader "https://s3.amazonaws.com/metabase-maven-downloads/com/metabase/athena-jdbc/maven-metadata.xml"))
        z        (z/xml-zip existing)]
    (when (find-pred z (every-pred (tag= :version)
                                   (content= version)))
      (throw (Exception. "Version already exists in maven-metadata.xml")))
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
      (println version "=> maven-metadata.xml")
      (with-open [w (io/writer "maven-metadata.xml")]
        (x/emit xml w)))))

(defn download-latest [version]
  (let [base-url  "https://s3.amazonaws.com/athena-downloads/"
        downloads (x/parse (io/reader base-url))
        z         (z/xml-zip downloads)
        jar-file  (-> z
                      (find-pred (every-pred
                                  (tag= (keyword "xmlns.http%3A%2F%2Fs3.amazonaws.com%2Fdoc%2F2006-03-01%2F" "Key"))
                                  (content= #(str/ends-with? % (str version "-with-dependencies.jar")))))
                      z/node
                      :content
                      str/join)]
    (println jar-file "=>" (jar-file-name version))
    (p/shell "curl --progress-bar -o " (jar-file-name version) (str base-url jar-file))))

(defn create-sha1 [version]
  (let [jar  (jar-file-name version)
        sha1 (-> (p/shell {:out :string} "shasum -a 1" jar)
                 :out
                 (str/split #"\s+")
                 first)]
    (println "sha1(jar) =>" (str jar ".sha1"))
    (with-open [w (io/writer (str jar ".sha1"))]
      (.write w sha1))))

(defn copy-to-s3 [version]
  (let [root-dir "com/metabase/athena-jdbc/"
        files [{:remote-dir (str version "/") :fname (jar-file-name version)}
               {:remote-dir (str version "/") :fname (str (jar-file-name version) ".sha1")}
               {:remote-dir nil :fname "maven-metadata.xml"}]]
    (doseq [{:keys [remote-dir fname]} files
            :let [target (str "s3://metabase-maven-downloads/" root-dir remote-dir fname)]]
      (println fname "=>" target)
      (p/shell "aws s3 cp" fname target))))

(defn deploy [version deploy?]
  (create-new-metadata version)
  (download-latest version)
  (create-sha1 version)
  (when deploy?
    (copy-to-s3 version)))

(when (= *file* (System/getProperty "babashka.file"))
  (let [{:keys [args opts]} (cli/parse-args *command-line-args* {:coerce {:deploy :boolean}})]
    (when-let [version (first args)]
      (deploy version (:deploy opts)))))
