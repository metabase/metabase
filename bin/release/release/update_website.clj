(ns release.update-website
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [metabuild-common.core :as u]
            [net.cgrand.tagsoup :as tagsoup]
            [release.common :as c]))

(def ^:private website-git-repo
  "git@github.com:metabase/metabase.github.io.git")

(def ^:private website-branch "master")

(defn- update-website!* []
  (let [dir (u/filename c/root-directory "target" "website")
        tag (str \v (c/version))]
    (u/create-directory-unless-exists! (u/filename c/root-directory "target"))
    (u/delete-file! dir)
    (u/step "Checkout website git repo"
      (u/sh "git" "checkout" website-git-repo dir)
      (u/sh {:dir dir} "git" "checkout" website-branch))
    (u/step "Install yarn dependencies"
      (u/sh {:dir dir} "yarn" "install"))
    (u/step "Run docs script"
      (u/sh {:dir dir} "./script/docs" tag "$*"))
    (u/step "Commit updated docs"
      (u/sh {:dir dir} "git" "add" ".")
      (u/sh* {:dir dir} "git" "commit" "-m" "v$VERSION"))
    (u/step "delete old tags"
      (u/sh* {:dir dir} "git" "push" "--delete" "origin" tag)
      (u/sh* {:dir dir} "git" "tag" "--delete" "origin" tag))
    (u/step "tag it"
      (u/sh {:dir dir} "git" "tag" "-a" tag "-m" tag)
      (u/sh {:dir dir} "git" "push" "--follow-tags" "-u" "origin" website-branch))))

(defn- parse-html-from-url [url]
  (let [{:keys [status ^String body]} (http/get url)]
    (assert (= status 200))
    (assert (string? body))
    (with-open [is (java.io.ByteArrayInputStream. (.getBytes body "UTF-8"))]
      (second (tagsoup/parser is)))))

(defn- find-node [node pred]
  (if (pred node)
    node
    (some
     (fn [child]
       (find-node child pred))
     (when (map? node)
       (:content node)))))

(defn- check-docs-version []
  (u/step "Check docs version on website"
    (let [doc  (parse-html-from-url "https://www.metabase.com/docs/latest")
          node (find-node doc #(and (map? %)
                                    (let [{:keys [tag], {:keys [href]} :attrs} %]
                                         (and (= tag :a)
                                              (= href (format "/docs/v%s/" (c/version)))))))]
      (when-not node
        (throw (ex-info (format "No link to /docs/v%s/ found" (c/version)) {})))
      (u/announce "Found link to /docs/v%s/" (c/version))
      (u/step "Make sure link text contains '(Latest)'"
        (let [content (find-node node (fn [child]
                                        (when (string? child)
                                          (str/includes? child "(Latest)"))))]
          (assert content)
          (u/announce "Found content %s" (pr-str content)))))))

(defn- check-jar-version []
  (u/step "Check JAR version on website"
    (let [doc  (parse-html-from-url "https://metabase.com/start/oss/jar")
          node (find-node doc #(and (map? %)
                                    (let [{:keys [tag], {:keys [href]} :attrs} %]
                                      (and (= tag :a)
                                           (= href (c/artifact-download-url "metabase.jar"))))))]
      (when-not node
        (throw (ex-info (format "No link to %s found" (c/artifact-download-url "metabase.jar"))
                        {}))))))

(defn- validate-website []
  (u/step "Validate website updated"
    (check-docs-version)
    (check-jar-version)))

(defn update-website! []
  (u/step "Update Metabase.com with latest docs"
    (cond
      (c/pre-release-version?)
      (u/announce "Pre-release version -- not updating Metabase docs")

      (= (c/edition) :ee)
      (u/announce "EE build -- not updating Metabase docs")

      :else
      (do
        (update-website!*)
        (validate-website)))))
