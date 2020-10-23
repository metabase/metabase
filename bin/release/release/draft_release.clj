(ns release.draft-release
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.cache :as cache]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common
             [github :as github]
             [hash :as hash]]
            [stencil loader
             [core :as stencil]]))

;; Disable caching of our template files for easier REPL debugging, we're only rendering them once anyways
(stencil.loader/set-cache (cache/ttl-cache-factory {} :ttl 0))

(defn- generate-draft-changelog []
  (u/step "Generate draft changelog"
    (let [pre-release?                           (c/pre-release-version?)
          {bugs :bug, enhancements :enhancement} (group-by github/issue-type (github/milestone-issues))]
      (stencil/render-file (u/assert-file-exists "release-template.md")
                           {:enhancements enhancements
                            :bug-fixes    bugs
                            :docker-tag   (c/docker-tag)
                            :download-url (c/artifact-download-url "metabase.jar")
                            :version      (c/version)
                            :checksum     (hash/sha-256-sum c/uberjar-path)}))))

(defn- upload-draft-changelog! [changelog]
  (u/step "Upload draft changelog (create draft release)"
    (let [body (json/generate-string {:tag_name         (format "v%s" (c/version))
                                      :target_commitish (c/branch)
                                      :name             (format "Metabase v%s" (c/version))
                                      :draft            true
                                      :prerelease       (c/pre-release-version?)
                                      :body             changelog})]
      (http/post (str (github/github-api-base) "/releases")
                 {:headers (github/github-api-request-headers)
                  :body    body}))))

(defn- validate-github-release []
  (u/step "Validate GitHub release"
    (throw (ex-info "TODO" {}))
    #_(u/step (format "Validate latest release version is %s" (c/version))
        ;;   latest_release=$(github-api "releases/latest" | jq -r '.tag_name')
        ;;   check-equals "github: latest release" "v$VERSION" "$latest_release"
        (throw (ex-info "TODO" {})))
    #_(u/step (format "Validate release note JAR checksum matches checksum of %s" (c/artifact-download-url "metabase.jar"))
      ;;   download-jar

      ;;   jar_checksum=$(shasum -a 256 "$jar_file" | cut -d " " -f 1)
      ;;   release_checksum=$(github-api "releases/tags/v$VERSION" | jq -r '.body' | grep -Eo '[a-f0-9]{64}' || true)
      ;;   check-equals "github: release checksum" "$jar_checksum" "$release_checksum"
      (throw (ex-info "TODO" {})))))

(defn create-draft-release! []
  (u/step "Create draft release"
    (let [changelog (generate-draft-changelog)]
      (upload-draft-changelog! changelog)
      (u/announce "GitHub draft release for %s created." (c/version))))
  (validate-github-release))
