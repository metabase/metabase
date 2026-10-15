(ns metabase-enterprise.library-branching.instance.glossary-mutation-test
  "Mutations of the rules of the app DB side of glossary terms. Each mutation removes or weakens one rule, and a test
  that it names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.glossary-test :as glossary-test]
   [metabase-enterprise.library-branching.instance.kinds.glossary :as kinds.glossary]
   [metabase-enterprise.library-branching.instance.lock-test :as lock-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the glossary kind store."
  [{:name   :no-lock
    :doc    "current reads a glossary term with no row lock, so a save of the term by another connection does not wait."
    :target `library-branching.db/lock-glossary-term
    :edits  [[:replace '[:update] nil]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :definition-not-written
    :doc    "A write of a changed definition leaves the old one, so a pull of a new definition shows as a conflict."
    :target `kinds.glossary/write-glossary-term!
    :edits  [[:remove '(not= definition (:definition row))] [:remove '(assoc :definition definition)]]
    :tests  [#'glossary-test/write-test #'glossary-test/glossary-laws-test]}
   {:name   :term-not-written
    :doc    "A write of a renamed term leaves the old term."
    :target `kinds.glossary/write-glossary-term!
    :edits  [[:remove '(not= term (:term row))] [:remove '(assoc :term term)]]
    :tests  [#'glossary-test/write-test #'glossary-test/glossary-laws-test]}
   {:name   :name-clash-unchecked
    :doc    "A write with a term that another glossary term has is not refused, so the apply fails on the unique key of
            the app DB, with no reason."
    :target `kinds.glossary/check-term-free!
    :edits  [[:replace '(not= id (:entity_id other)) false]]
    :tests  [#'glossary-test/name-taken-test]}
   {:name   :own-term-is-a-clash
    :doc    "A write refuses the term that the same identity has, so no write of an existing term applies."
    :target `kinds.glossary/check-term-free!
    :edits  [[:replace '(not= id (:entity_id other)) true]]
    :tests  [#'glossary-test/write-of-current-content-changes-no-row-test #'glossary-test/name-taken-test]}
   {:name   :creator-is-the-writer
    :doc    "A write makes the user who writes the creator of the term, so a pull changes an instance-local value."
    :target `kinds.glossary/write-glossary-term!
    :edits  [[:replace '(cond-> {} (not= term (:term row)) (assoc :term term) (not= definition (:definition row))
                                (assoc :definition definition))
              '(cond-> {:creator_id (or api/*current-user-id* config/internal-mb-user-id)}
                 (not= term (:term row)) (assoc :term term)
                 (not= definition (:definition row)) (assoc :definition definition))]]
    :tests  [#'glossary-test/write-keeps-instance-local-attributes-test]}
   {:name   :every-column-written
    :doc    "A write sends every content column, also those that did not change. `t2/update!` of a model skips a row
            whose values do not change, so GetPut still holds: the mutation survives, and shows that second guard."
    :target `kinds.glossary/write-glossary-term!
    :edits  [[:replace '(seq changes) true]
             [:replace '(cond-> {} (not= term (:term row)) (assoc :term term) (not= definition (:definition row))
                                (assoc :definition definition))
              '{:term term :definition definition}]]
    :expect :survived
    :tests  [#'glossary-test/write-of-current-content-changes-no-row-test]}
   {:name   :no-delete
    :doc    "trash! of a glossary term does nothing, so a pull that removes a term leaves it on the instance."
    :target `kinds.glossary/trash-glossary-term!
    :edits  [[:remove '(library-branching.db/delete-glossary-term! (:id row))]]
    :tests  [#'glossary-test/trash-test]}
   {:name   :content-unchecked
    :doc    "A write takes content that is not a glossary term, for example one with a place or a term too long for
            the app DB."
    :target `kinds.glossary/write-glossary-term!
    :edits  [[:remove '(content/check-item! :glossary-term id item)]]
    :tests  [#'glossary-test/refused-writes-write-nothing-test]}])

(deftest glossary-mutations-test
  (mut/check mutations {:timeout-ms 300000}))
