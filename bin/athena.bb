#!/usr/bin/env bb

(ns athena
  (:require
    [babashka.cli :as cli]
    [babashka.curl :as curl]
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

(defn topmost [z]
  (loop [z z]
    (if-let [parent (z/up z)]
      (recur parent)
      z)))

(defn jar-file-name [version]
   (str "athena-jdbc-" version ".jar"))

(defn create-new-metadata [version]
  (let [existing (x/parse (io/reader "https://s3.amazonaws.com/maven-athena/com/metabase/athena-jdbc/maven-metadata.xml"))
        z (z/xml-zip existing)]
    (when (find-pred z (every-pred (comp #(= :version %) :tag)
                                   (comp #(= version %) str/join :content)))
      (throw (Exception. "Version already exists in maven-metadata.xml")))
    (with-open [w (io/writer "maven-metadata.xml")]
      (-> z
          (find-pred (comp #(= :versions %) :tag))
          (z/insert-child (x/element :version {} version))
          topmost
          (find-pred (comp #(= :release %) :tag))
          (z/down)
          (z/replace version)
          (z/root)
          (x/emit w)))))

(defn download-latest [version]
  (let [base-url "https://s3.amazonaws.com/athena-downloads/"
        downloads (x/parse (io/reader base-url))
        z (z/xml-zip downloads)
        jar-file (-> z
                     (find-pred (every-pred
                                  (comp #(= (keyword "xmlns.http%3A%2F%2Fs3.amazonaws.com%2Fdoc%2F2006-03-01%2F" "Key") %) :tag)
                                  (comp #(str/ends-with? % (str version ".1001.jar")) str/join :content)))
                     z/node
                     :content
                     str/join)]
    (println jar-file)
    (io/copy (:body (curl/get (str base-url jar-file) {:as :bytes}))
             (io/file (jar-file-name version)))))

(defn create-sha1 [version]
  (let [jar (jar-file-name version)
        sha1 (-> (p/shell {:out :string} (str "shasum -a 1 " jar))
                 :out
                 (str/split #"\s+")
                 first)]
    (with-open [w (io/writer (str jar ".sha1"))]
      (.write w sha1))))

(defn copy-to-s3 [version]
  (let [root-dir "com/metabase/athena-jdbc/"
        files [{:remote-dir (str version "/") :fname (jar-file-name version)}
               {:remote-dir (str version "/") :fname (str (jar-file-name version) ".sha1")}
               {:remote-dir nil :fname "maven-metadata.xml"}]]
    (doseq [{:keys [remote-dir fname]} files]
      (p/shell "aws s3 cp" fname (str "s3://maven-athena/" root-dir remote-dir fname)))))

(defn deploy [version deploy?]
  (create-new-metadata version)
  (download-latest version)
  (create-sha1 version)
  (when deploy?
    (copy-to-s3 version)))

(let [{:keys [args opts]} (cli/parse-args *command-line-args* {:coerce {:deploy :boolean}})]
  (when-let [version (first args)]
    (deploy version (:deploy opts))))
