(ns metabase-enterprise.remote-sync.source.git-credentials-test
  "Tests of the git credentials provider. No app DB."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git])
  (:import
   (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider)))

(set! *warn-on-reflection* true)

(deftest ^:parallel credentials-provider-test
  (testing "GitHub URL uses x-access-token"
    (let [provider (git/credentials-provider "https://github.com/org/repo.git" "my-token")]
      (is (instance? UsernamePasswordCredentialsProvider provider))))
  (testing "Bitbucket URL uses x-token-auth"
    (let [provider (#'git/credentials-provider "https://bitbucket.org/org/repo" "my-token")]
      (is (instance? UsernamePasswordCredentialsProvider provider)))))
