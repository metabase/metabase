(ns mage.papercuts.git-test
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.git :as papercut-git])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(defn- git! [dir env & args]
  (-> (apply p/shell {:dir dir :out :string :err :string :extra-env env}
             "git" "-c" "user.name=t" "-c" "user.email=t@example.com" "-c" "commit.gpgsign=false" args)
      :out
      str/trim))

(defn- commit! [dir date]
  (git! dir {"GIT_AUTHOR_DATE" date "GIT_COMMITTER_DATE" date} "commit" "-q" "--allow-empty" "-m" date)
  (git! dir {} "rev-parse" "HEAD"))

(defn- with-repo!
  "Run `f` with a throwaway repository on branch `work` holding commits dated 2020-01-01 and 2020-06-01."
  [f]
  (let [root (fs/create-temp-dir {:prefix "papercut-git"})
        dir  (str (fs/path root "repo"))]
    (try
      (fs/create-dirs dir)
      (git! dir {} "init" "-q" "-b" "work")
      (git! dir {} "remote" "add" "origin" "git@example.com:org/repo.git")
      (f dir (commit! dir "2020-01-01T00:00:00Z") (commit! dir "2020-06-01T00:00:00Z"))
      (finally
        (fs/delete-tree root)))))

(deftest repo-dir-test
  (with-repo!
    (fn [dir _ _]
      (is (= dir (papercut-git/repo-dir dir)))
      (testing "a deleted `<repo>.<branch>` worktree falls back to the checkout it was made from"
        (is (= dir (papercut-git/repo-dir (str dir ".some-branch")))))
      (is (nil? (papercut-git/repo-dir "/no/such/dir")))
      (is (nil? (papercut-git/repo-dir nil))))))

(deftest context-test
  (with-repo!
    (fn [dir first-commit second-commit]
      (testing "the reflog answers for times it covers"
        (is (= {:branch "work" :commit_sha second-commit :commit_source "reflog"
                :repository_url "git@example.com:org/repo.git"}
               (papercut-git/context {:cwd dir :branch "work" :ts (str (Instant/now))})))
        (is (= first-commit (:commit_sha (papercut-git/context {:cwd dir :branch "work" :ts "2020-03-01T00:00:00Z"})))))
      (testing "before the reflog starts, git's oldest-entry answer is not trusted"
        (is (= {:branch "work" :repository_url "git@example.com:org/repo.git"}
               (papercut-git/context {:cwd dir :branch "work" :ts "2019-06-01T00:00:00Z"}))))
      (testing "the session's starting commit beats a reconstruction from rewritable history"
        (is (= {:branch "work" :commit_sha (apply str (repeat 40 "a")) :commit_source "session-start"
                :repository_url "git@github.com:metabase/metabase.git"}
               (papercut-git/context {:cwd         dir
                                      :ts          "2019-06-01T00:00:00Z"
                                      :session-git {:branch         "work"
                                                    :sha            (apply str (repeat 40 "a"))
                                                    :repository-url "git@github.com:metabase/metabase.git"}}))))
      (testing "without a reflog, the last commit before the time is used"
        (git! dir {} "reflog" "expire" "--expire=all" "--all")
        (is (= {:commit_sha first-commit :commit_source "before-timestamp"}
               (select-keys (papercut-git/context {:cwd dir :branch "work" :ts "2020-03-01T00:00:00Z"})
                            [:commit_sha :commit_source]))))
      (testing "without a repository only the branch is known"
        (is (= {:branch "gone"} (papercut-git/context {:cwd "/no/such/dir" :branch "gone" :ts "2020-03-01T00:00:00Z"})))))))

(deftest public-url-test
  (testing "credentials and query parameters are dropped from URL remotes"
    (is (= "https://github.com/org/repo.git"
           (papercut-git/public-url "https://user:ghp_secret@github.com/org/repo.git?token=x#frag")))
    (is (= "https://github.com/org/repo.git" (papercut-git/public-url "https://ghp_secret@github.com/org/repo.git"))))
  (testing "an @ in the query or fragment is not user info"
    (is (= "https://host" (papercut-git/public-url "https://host?token=user@secret")))
    (is (= "https://host/repo" (papercut-git/public-url "https://host/repo#user@secret"))))
  (testing "scp-style remotes name only a login user, and pass through"
    (is (= "git@github.com:org/repo.git" (papercut-git/public-url "git@github.com:org/repo.git")))))

(deftest context-without-an-origin-remote-test
  (with-repo!
    (fn [dir _ _]
      (git! dir {} "remote" "rename" "origin" "fork")
      (testing "a checkout whose remote isn't called origin still names it"
        (is (= "git@example.com:org/repo.git" (:repository_url (papercut-git/context {:cwd dir}))))))))
