(ns release.draft-release
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.cache :as cache]
            [clojure.java.io :as io]
            [release.common :as c]
            [release.common.github :as github]
            [stencil loader
             [core :as stencil]])
  (:import org.apache.commons.codec.digest.DigestUtils))

;; Disable caching of our template files for easier REPL debugging, we're only rendering them once anyways
(stencil.loader/set-cache (cache/ttl-cache-factory {} :ttl 0))

(defn- sha-256-sum [filename]
  (with-open [is (io/input-stream (c/assert-file-exists filename))]
    (DigestUtils/sha256Hex is)))

(defn- generate-draft-changelog []
  (c/step "Generate draft changelog"
    (let [pre-release?                           (c/pre-release-version?)
          {bugs :bug, enhancements :enhancement} (group-by github/issue-type (github/milestone-issues))]
      (stencil/render-file (c/assert-file-exists "release-template.md")
                           {:enhancements enhancements
                            :bug-fixes    bugs
                            :docker-tag   (c/docker-tag)
                            :download-url (c/artifact-download-url "metabase.jar")
                            :version      (c/version)
                            :checksum     (sha-256-sum c/uberjar-path)}))))



(defn- upload-draft-changelog! [changelog]
  (c/step "Upload draft changelog (create draft release)"
    (let [body (json/generate-string {:tag_name         (format "v%s" (c/version))
                                      :target_commitish (c/branch)
                                      :name             (format "Metabase v%s" (c/version))
                                      :draft            true
                                      :prerelease       (c/pre-release-version?)
                                      :body             changelog})]
      (http/post (str (github/github-api-base) "/releases")
                 {:headers (github/github-api-request-headers)
                  :body    body}))))

(defn create-draft-release! []
  (c/step "Create draft release"
    (let [changelog (generate-draft-changelog)]
      (upload-draft-changelog! changelog)
      (c/announce "GitHub draft release for %s created." (c/version)))))
