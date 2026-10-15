(ns metabase-enterprise.library-branching.status-mutation-test
  "Mutations of the rules of the status. Each mutation removes or weakens one rule, and a test of the status must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.status-property-test :as status-property-test]
   [metabase-enterprise.library-branching.status-test :as status-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the status."
  [{:name   :remote-changes-by-commit-id
    :doc    "A head that is not the base has remote changes, also when its content equals the content of the base."
    :target `status/check-remote-changes
    :edits  [[:replace '(or (nil? changes) (changed? changes)) true]]
    :tests  [#'status-test/check-remote-changes-test]}
   {:name   :local-changes-from-nothing
    :doc    "The local changes do not compare with the base: every item is created."
    :target `status/local-changes
    :edits  [[:replace '(diff/diff digests (writer/item-digests codecs l)) '(diff/diff {} (writer/item-digests codecs l))]]
    :tests  [#'status-test/no-local-change-test #'status-test/local-change-list-test]}
   {:name   :fast-path-with-system-items
    :doc    "The fast path decodes a changed file of a system item, although the decode of the whole tree completes a
            system item that the head lacks."
    :target `status/fast-remote-changes
    :edits  [[:replace '(some system-related (concat (keys at-b) (keys at-h))) false]]
    :tests  [#'status-test/remote-change-of-a-section-file-test]}
   {:name   :fast-path-with-a-second-file
    :doc    "The fast path takes a new file that holds an item of an unchanged file as an update, not as two files with
            one identity."
    :target `status/fast-remote-changes
    :edits  [[:replace '(some (fn [id] (and (not (contains? at-b id)) (contains? base-ids id))) (keys at-h)) false]]
    :tests  [#'status-test/new-file-with-an-item-of-the-base-test]}
   {:name   :fast-path-skips-broken-item-files
    :doc    "The fast path ignores an item file that does not decode."
    :target `status/changed-items
    :edits  [[:replace '(or (nil? id) (contains? acc id)) '(contains? acc id)]]
    :tests  [#'status-test/remote-changes-with-a-head-that-does-not-decode-test]}
   {:name   :fast-path-as-the-truth
    :doc    "The remote changes come from the changed paths alone, with no fall back to a full decode."
    :target `status/remote-changes
    :edits  [[:replace '(and fast (map? fast)) 'fast]]
    :tests  [#'status-test/remote-change-of-a-section-file-test #'status-test/new-file-with-an-item-of-the-base-test]}
   {:name   :held-only-by-the-branch
    :doc    "A base is held only by the configured branch: after a switch of branch, the base is lost."
    :target `status/base-held?
    :edits  [[:replace '(some (fn [other]
                                (when-let [x (and (not= other branch) (store/head store other))]
                                  (store/ancestor? store b x)))
                              (store/branches store))
              false]]
    :tests  [#'status-test/base-held-test]}
   {:name   :held-when-not-fetched
    :doc    "The held check asks about a base that is not in the local object store."
    :target `status/base-held?
    :edits  [[:replace '(readable? store b) true]]
    :tests  [#'status-test/base-held-test]}
   {:name   :status-never-lost
    :doc    "The status never says that the base is lost."
    :target `status/status
    :edits  [[:replace '(boolean (and b (not (base-held? store b branch h)))) false]]
    :tests  [#'status-test/status-test]}
   {:name   :preview-merges-with-a-lost-base
    :doc    "The push preview merges against a base that no branch holds, so a difference of the head shows as a remote
            change, not as a conflict."
    :target `status/push-preview
    :edits  [[:replace '(base-held? store b branch h) true]]
    :tests  [#'status-test/push-preview-with-a-lost-base-test]}
   {:name   :preview-reads-at-the-base
    :doc    "The push preview reads and merges the instance when the head is the base."
    :target `status/push-preview
    :edits  [[:replace '(or (= b h) (nil? h)) '(nil? h)]]
    :tests  [#'status-test/push-preview-not-diverged-test]}
   {:name   :summary-of-local-changes
    :doc    "The summary also counts an item that changed locally."
    :target `status/summary
    :edits  [[:replace '(= li bi) true]]
    :tests  [#'status-test/push-preview-clean-test #'status-test/push-preview-conflict-test]}
   {:name   :cache-without-the-base
    :doc    "The cache key has no base: an answer from before a push or a pull is given after it."
    :target `status/has-remote-changes!
    :edits  [[:replace '[url branch (instance/base inst)] '[url branch]]]
    :tests  [#'status-test/has-remote-changes-cache-test]}
   {:name   :cache-of-a-missing-branch
    :doc    "The answer for a branch that does not exist is cached."
    :target `status/has-remote-changes!
    :edits  [[:replace '(:branch-missing answer) false]]
    :tests  [#'status-test/has-remote-changes-of-a-missing-branch-is-not-cached-test]}
   {:name   :cache-with-no-time-to-live
    :doc    "A cached answer never gets old."
    :target `status/cached-answer
    :edits  [[:replace '(< (- now-ms (:at entry)) ttl-ms) true]]
    :tests  [#'status-test/cached-answer-test #'status-property-test/cached-answer-law-property-test]}])

(deftest status-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
