(ns release.elastic-beanstalk
  "Code related to building and publishing Elastic Beanstalk artifacts."
  (:require [cheshire.core :as json]
            [clojure.core.cache :as cache]
            [clojure.java.io :as io]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common
             [http :as common.http]
             [upload :as upload]]
            [stencil loader
             [core :as stencil]]))

;; Disable caching of our template files for easier REPL debugging, we're only rendering them once anyways
(stencil.loader/set-cache (cache/ttl-cache-factory {} :ttl 0))

;; create a ZIP file with the contents
;; metabase-aws-eb.zip
;; ├─ Dockerrun.aws.json
;; ├─ .ebextensions/
;;    ├─ 01_metabase.config
;;    ├─ metabase_config/
;;       ├─ (a bunch of other stuff)

(def ^:private eb-extensions-source
  "Source location of the .ebextensions directory"
  (u/assert-file-exists (u/filename c/root-directory "bin" "release" "src" "release" "elastic_beanstalk" ".ebextensions")))

(def ^:private archive-temp-dir
  "Path where we'll put the contents of the ZIP file before we create it."
  "/tmp/metabase-aws-eb")

(def ^:private archive-path   "/tmp/metabase-aws-eb.zip")
(def ^:private html-file-path "/tmp/launch-aws-eb.html")

(defn- validate-json-docker-tag []
  (u/step (format "Check that Dockerrun.aws.json Docker tag is %s" (c/docker-tag))
    (u/step "Download archive"
      (u/download-file! (c/artifact-download-url "metabase-aws-eb.zip") archive-path))
    (u/step "Unzip archive"
      (u/delete-file-if-exists! archive-temp-dir)
      (u/sh "unzip" (u/assert-file-exists archive-path) "-d" archive-temp-dir))
    (u/step "Validate JSON file"
      (let [json (-> (u/assert-file-exists (u/filename (u/assert-file-exists archive-temp-dir) "Dockerrun.aws.json"))
                     slurp
                     (json/parse-string true))
            tag  (get-in json [:Image :Name])]
        (u/announce "Docker tag is %s" tag)
        (when-not (= tag (c/docker-tag))
          (throw (ex-info "Incorrect Docker tag." {:expected (c/docker-tag)
                                                   :actual   tag
                                                   :json     json})))))))

(defn- validate-elastic-beanstalk-artifacts []
  (u/step "Validate Elastic Beanstalk artifacts"
    (common.http/check-url-exists (c/artifact-download-url "launch-aws-eb.html"))
    (common.http/check-url-exists (c/artifact-download-url "metabase-aws-eb.zip"))
    (validate-json-docker-tag)
    (u/announce "Artifacts validated.")))

(defn- dockerrun-json-content []
  {:AWSEBDockerrunVersion "1"
   :Image                 {:Name   (c/docker-tag)
                           :Update "true"}
   :Ports                 [{:ContainerPort "3000"}]
   :Logging               "/var/log/metabase"})

(defn- create-archive! []
  (u/step (format "Create metabase-aws-eb.zip for Docker image %s" (c/docker-tag))
    (u/step "Create temp dir"
      (u/delete-file-if-exists! archive-temp-dir)
      (u/create-directory-unless-exists! archive-temp-dir))
    (u/step "Generate Dockerrun.aws.json"
      (spit (u/filename archive-temp-dir "Dockerrun.aws.json")
            (json/generate-string (dockerrun-json-content) {:pretty true})))
    (u/step "Copy .ebextensions"
      (u/copy-file! eb-extensions-source (u/filename archive-temp-dir ".ebextensions")))
    (u/step "Create metabase-aws-eb.zip"
      (u/delete-file-if-exists! archive-path)
      (u/sh {:dir archive-temp-dir} "zip" "--recurse-paths" archive-path ".")
      (u/assert-file-exists archive-path))))

(def ^:private launch-template-filename
  "release/elastic_beanstalk/launch-aws-eb.html.template")

(u/assert-file-exists (.getPath (io/resource launch-template-filename)))

(defn- create-html-file! []
  (u/step (format "Create launch-aws-eb.html for Docker image %s" (c/docker-tag))
    (u/delete-file-if-exists! html-file-path)
    (spit html-file-path
          (stencil/render-file launch-template-filename
                               {:url (java.net.URLEncoder/encode (c/artifact-download-url "metabase-aws-eb.zip")
                                                                 "UTF-8")}))
    (u/assert-file-exists html-file-path)))

(defn- upload-artifacts! []
  (u/step "Upload Elastic Beanstalk artifacts"
    (u/step "Upload metabase-aws-eb.zip"
      (upload/upload-artifact! archive-path "metabase-aws-eb.zip"))
    (u/step "Upload launch-aws-eb.html"
      (upload/upload-artifact! html-file-path "launch-aws-eb.html"))))

;; TODO -- we should merge the EB build logic into this script, it's still an ancient bash script
(defn publish-elastic-beanstalk-artifacts! []
  (u/step "Create and publish Elastic Beanstalk artifacts"
    (create-archive!)
    (create-html-file!)
    (upload-artifacts!))
  (validate-elastic-beanstalk-artifacts))
