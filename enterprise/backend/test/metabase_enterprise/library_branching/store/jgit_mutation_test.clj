(ns metabase-enterprise.library-branching.store.jgit-mutation-test
  "Mutations of the connection rules of the JGit store. Each mutation removes or weakens one rule, and a test of that
  rule must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase-enterprise.library-branching.store.jgit-test :as jgit-test]))

(set! *warn-on-reflection* true)

(def mutations
  "Each mutation removes or weakens one connection rule of the store."
  [{:name   :no-timeout
    :doc    "A remote call has no network timeout, so a stalled connection hangs the task."
    :target `store.jgit/open-transport
    :edits  [[:remove '(.setTimeout (int timeout-seconds))]]
    :tests  [#'jgit-test/every-remote-call-has-the-timeout-and-the-credentials-test]}
   {:name   :no-credentials
    :doc    "A remote call does not send the token."
    :target `store.jgit/open-transport
    :edits  [[:remove '(.setCredentialsProvider (credentials-provider url token))]]
    :tests  [#'jgit-test/every-remote-call-has-the-timeout-and-the-credentials-test]}
   {:name   :one-user-for-every-host
    :doc    "Bitbucket gets the user name of GitHub with the token."
    :target `store.jgit/token-user
    :edits  [[:replace "x-token-auth" "x-access-token"]]
    :tests  [#'jgit-test/token-user-test #'jgit-test/credentials-provider-test]}
   {:name   :any-url
    :doc    "Every URL is accepted, also git:// and ssh://."
    :target `store.jgit/url-error
    :edits  [[:replace '(not (str/includes? url ":")) true]]
    :tests  [#'jgit-test/url-error-test #'jgit-test/url-error-law-test]}
   {:name   :open-store-takes-any-url
    :doc    "open-store does not check the URL rule."
    :target `store.jgit/open-store
    :edits  [[:remove '(when-let [message (url-error url)] (throw (ex-info message {:url url})))]]
    :tests  [#'jgit-test/open-store-refuses-a-bad-url-test]}
   {:name   :every-ref-is-a-branch
    :doc    "branches lists every advertised ref, HEAD and tags included."
    :target `store.jgit/branches*
    :edits  [[:replace '(keep branch-name) '(map identity)]]
    :tests  [#'jgit-test/branches-test #'jgit-test/branches-and-default-branch-law-test]}
   {:name   :default-branch-is-any-ref
    :doc    "default-branch takes the advertised HEAD whether it is symbolic or not."
    :target `store.jgit/default-branch*
    :edits  [[:replace '(and head (.isSymbolic head)) 'head]
             [:replace '(branch-name (.getName (.getTarget head))) '(branch-name (.getName head))]]
    :tests  [#'jgit-test/default-branch-test #'jgit-test/branches-and-default-branch-law-test]}
   {:name   :no-reason
    :doc    "A failed remote call does not say the kind of its failure, so the person gets no clear message."
    :target `store.jgit/remote-op
    :edits  [[:replace '(cond-> {:operation op :url url} reason (assoc :reason reason)) '{:operation op :url url}]]
    :tests  [#'jgit-test/failure-reason-test]}])

(deftest jgit-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
