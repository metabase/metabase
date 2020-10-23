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
  (u/step (format "Validate GitHub release on %s" (c/metabase-repo))
    (u/step (format "Validate release %s" (c/version))
      (let [{:keys [status body]} (http/get (str (github/github-api-base) "/releases")
                                            {:headers (github/github-api-request-headers)})
            _                     (assert (= status 200))
            release               (some
                                   (fn [release]
                                     (when (= (:tag_name release) (str "v" (c/version)))
                                       release))
                                   (json/parse-string body true))]
        (u/step (format "Check that GitHub release v%s exists" (c/version))
          (assert release (format "No release with version v%s found." (c/version))))
        (u/step "Validate JAR checksum in GitHub release"
          (assert (string? (:body release)))
          (let [[_ release-hash] (re-find #"```\s*([0-9a-f]{64})\s*```" (:body release))]
            (when-not release-hash
              (throw (ex-info "Error parsing release hash" {:body body})))
            (u/announce "Release has JAR hash %s" release-hash)
            (u/announce "The correct JAR hash is %s" (hash/sha-256-sum c/uberjar-path))
            (assert (= (hash/sha-256-sum c/uberjar-path) release-hash) "Incorrect hash on GitHub release")))))))

(defn create-draft-release! []
  (u/step "Create draft release"
    (let [changelog (generate-draft-changelog)]
      (upload-draft-changelog! changelog)
      (u/announce "GitHub draft release for %s created." (c/version))))
  (validate-github-release))
