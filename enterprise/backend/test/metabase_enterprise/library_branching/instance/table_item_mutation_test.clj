(ns metabase-enterprise.library-branching.instance.table-item-mutation-test
  "Mutations of the rules of the instance side of segments and measures. Each mutation removes or weakens one rule,
  and a test of the rule must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.instance.lock-test :as lock-test]
   [metabase-enterprise.library-branching.instance.table-item-property-test :as property-test]
   [metabase-enterprise.library-branching.instance.table-item-test :as table-item-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(def mutations
  "Each mutation removes or weakens one rule of the instance side of segments and measures."
  [{:name   :archived-in-scope
    :doc    "Scope keeps an archived segment or measure, so a trashed one is still synced."
    :target `scope/table-item-query
    :edits  [[:replace '(unarchived :t.archived) true]]
    :tests  [#'table-item-test/scope-test #'table-item-test/local-changes-test]}
   {:name   :any-table-in-scope
    :doc    "Scope keeps the segments and measures of every table, also of one outside the Library or unpublished."
    :target `scope/table-item-query
    :edits  [[:replace '(in-scope roots :t.table_id :published-table) true]]
    :tests  [#'table-item-test/scope-test #'table-item-test/local-changes-test]}
   {:name   :place-is-not-the-table
    :doc    "A read gives no table as the place, so the item is at the root level, and the format refuses it."
    :target `table-item/read-items
    :edits  [[:replace '(serdes/*export-table-fk* (:table_id row)) nil]]
    :tests  [#'table-item-test/segment-content-test #'table-item-test/measure-content-test]}
   {:name   :every-attribute-written
    :doc    "A write writes every attribute, also one whose content did not change, so a write of the current content
            changes the row (the definition gets new uuids)."
    :target `table-item/write-item!
    :edits  [[:replace '(content/changed-attrs spec (:attrs old) attrs) '(keys (:attrs spec))]]
    :tests  [#'table-item-test/write-test #'property-test/segment-laws-test]}
   {:name   :no-restore
    :doc    "A write of a trashed segment or measure leaves it in the trash."
    :target `table-item/write-item!
    :edits  [[:replace '(:archived row) false]]
    :tests  [#'table-item-test/write-test #'table-item-test/trash-of-the-table-test]}
   {:name   :no-trash
    :doc    "trash! of a segment or a measure does nothing."
    :target `table-item/trash-item!
    :edits  [[:replace '(library-branching.db/update-table-item! model (:id row) {:archived true}) nil]]
    :tests  [#'table-item-test/write-test #'table-item-test/trash-keeps-outside-content-working-test]}
   {:name   :take-over-outside
    :doc    "A write or a trash matches an identity also on a table outside the Library tree, so a file takes over a
            person's segment or measure of an unpublished table."
    :target `table-item/table-in-tree?
    :edits  [[:replace '(tree/collection-id-in-tree? collection_id) true]]
    :tests  [#'table-item-test/refused-writes-write-nothing-test]}
   {:name   :place-not-in-scope
    :doc    "A write puts a segment on any table, also one that is not published into the Library."
    :target `table-item/place-table!
    :edits  [[:replace '(scope/in-scope? :published-table place) true]]
    :tests  [#'table-item-test/refused-writes-write-nothing-test]}
   {:name   :archive-not-closed
    :doc    "A trash of a published table or a collection leaves the segments and measures of its tables as they are,
            so a restore of the table brings them back without a write."
    :target `table-item/do-keeping-archive-closed
    :edits  [[:replace '(seq gone) false]]
    :tests  [#'table-item-test/trash-of-the-table-test]}
   {:name   :no-table-item-lock
    :doc    "current reads a segment or a measure with no row lock, so a save by another connection does not wait."
    :target `library-branching.db/lock-table-item
    :edits  [[:replace '[:update] nil]]
    :tests  [#'lock-test/current-locks-the-row-test]}])

(deftest table-item-mutations-test
  (mut/check mutations {:timeout-ms 300000}))
