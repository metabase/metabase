(ns metabase-enterprise.library-branching.instance.mutation-test
  "Mutations of the rules of the instance read side. Each mutation removes or weakens one rule, and one of the tests
  that it names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.app-db-test :as app-db-test]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.golden-test :as golden-test]
   [metabase-enterprise.library-branching.instance.kinds-test :as kinds-test]
   [metabase-enterprise.library-branching.instance.kinds.card :as kinds.card]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private read-point-tests
  [#'app-db-test/read-snapshot-needs-its-own-transaction-test
   #'app-db-test/save-during-read-is-not-in-snapshot-test])

;; Each mutation names the tests of the rule that it removes. The property test of the read is in no list: it kills no
;; mutation that these tests miss, and it takes most of the time of a run.
(def mutations
  "Each mutation removes or weakens one rule of the read side."
  [{:name   :no-repeatable-read
    :doc    "The read point keeps the isolation of the pool (READ COMMITTED), so a later query of one read sees a save
            that committed after the first query."
    :target `library-branching.db/do-with-read-point
    :edits  [[:remove '(.setTransactionIsolation conn Connection/TRANSACTION_REPEATABLE_READ)]]
    :tests  read-point-tests}
   {:name   :no-read-transaction
    :doc    "The read runs its queries with autocommit, one transaction per query."
    :target `library-branching.db/do-with-read-point
    :edits  [[:replace '(t2/with-transaction [_ conn] (run! touch-table (into (sorted-set) (map t2/table-name) models)) (f))
              '(f)]]
    :tests  read-point-tests}
   {:name   :no-table-touch
    :doc    "The read point reads no table before the read. On H2 the snapshot of a table starts at its first read in the
            transaction, so a table that the read reads after a save sees the save. The other app DBs start the
            snapshot of every table at the first read of the transaction."
    :target `library-branching.db/do-with-read-point
    :edits  [[:remove '(run! touch-table (into (sorted-set) (map t2/table-name) models))]]
    :expect (if (= :h2 (mdb/db-type)) :killed :survived)
    :tests  read-point-tests}
   {:name   :read-in-open-transaction
    :doc    "The read point runs inside an open transaction of the caller, whose isolation it cannot set."
    :target `library-branching.db/do-with-read-point
    :edits  [[:replace '(mdb/in-transaction?) false]]
    :tests  read-point-tests}
   {:name   :every-column-is-content
    :doc    "A card's attributes are all the columns that the read selects, not the closed list of the format: ids,
            the card schema and derived metadata become content."
    :target `kinds.card/attrs
    :edits  [[:replace '(keys (:attrs spec)) '(keys card)]]
    :tests  [#'kinds-test/metric-content-test
             #'kinds-test/items-fit-the-format-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :parent-dropped
    :doc    "A collection's place is not its parent: every collection is at the root level."
    :target `kinds.collection/portable-content
    :edits  [[:replace '(serdes/*export-fk* (parent-id location) :model/Collection) nil]]
    :tests  [#'kinds-test/collection-content-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :no-prefetch
    :doc    "The batched export answers no lookup from the prefetched rows, so each reference costs its own query."
    :target `portable/export-batch
    :edits  [[:replace '(fetch @requests) {}]]
    :tests  [#'kinds-test/batched-read-test]}
   {:name   :no-refs
    :doc    "An item holds no references."
    :target `content/item
    :edits  [[:replace '(format.kinds/refs kind id attrs) #{}]]
    :tests  [#'kinds-test/metric-content-test
             #'kinds-test/snippet-content-test
             #'kinds-test/published-table-content-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :defaults-kept
    :doc    "An attribute that is nil or at its default stays in the attributes."
    :target `content/attrs
    :edits  [[:replace '(format.common/drop-defaults spec (into {} (remove (comp nil? val)) m)) 'm]]
    :tests  [#'kinds-test/collection-content-test
             #'kinds-test/snippet-content-test
             #'kinds-test/metric-content-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :tags-not-portable
    :doc    "A snippet's template tags keep the database id of the snippet that they name."
    :target `kinds.snippet/attrs
    :edits  [[:replace '(serdes/export-mbql (:template_tags snippet)) '(:template_tags snippet)]]
    :tests  [#'kinds-test/snippet-content-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :field-names-with-table
    :doc    "A field entry of a published table is keyed by its whole natural key, not by its name."
    :target `kinds.published-table/fields
    :edits  [[:replace '(drop 3 (serdes/*export-field-fk* (:field_id row)))
              '(serdes/*export-field-fk* (:field_id row))]]
    :tests  [#'kinds-test/published-table-content-test
             #'golden-test/read-gives-golden-items-test]}
   {:name   :no-remappings
    :doc    "A read gives no remapping of a field."
    :target `kinds.published-table/field-values
    :edits  [[:replace '(assoc :remapping (remapping (:dimension row))) '(identity)]]
    :tests  [#'kinds-test/published-table-remapping-content-test]}
   {:name   :no-labels
    :doc    "An internal remapping holds none of its labels."
    :target `kinds.published-table/remapping
    :edits  [[:replace '(seq ls) false]]
    :tests  [#'kinds-test/published-table-remapping-content-test]}
   {:name   :sync-values-in-content
    :doc    "An internal remapping holds every value that warehouse sync found, with its label, so a scan that adds or
            drops a value is a local change."
    :target `kinds.published-table/labels-of
    :edits  [[:replace '(remove (fn [[v l]] (format.published-table/default-label? v l))) '(identity)]]
    :tests  [#'kinds-test/published-table-rescan-keeps-remapping-test]}
   {:name   :remapping-needs-user-settings
    :doc    "A remapping of a field with no user settings row is not read."
    :target `kinds.published-table/field-settings-rows
    :edits  [[:replace '(not (contains? with-row field-id)) false]]
    :tests  [#'kinds-test/published-table-remapping-content-test]}])

(deftest read-side-mutations-test
  (mut/check mutations {}))
