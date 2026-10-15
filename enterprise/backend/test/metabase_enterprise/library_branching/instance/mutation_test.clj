(ns metabase-enterprise.library-branching.instance.mutation-test
  "Mutations of the rules of the instance read side. Each mutation removes or weakens one rule, and a test of the read
  side must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.app-db-test]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.golden-test]
   [metabase-enterprise.library-branching.instance.kinds-test]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.read-property-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(def mutations
  "Each mutation removes or weakens one rule of the read side."
  [{:name   :no-repeatable-read
    :doc    "The read point keeps the isolation of the pool (READ COMMITTED), so a later query of one read sees a save
            that committed after the first query."
    :target `library-branching.db/do-with-read-point
    :edits  [[:remove '(.setTransactionIsolation conn Connection/TRANSACTION_REPEATABLE_READ)]]}
   {:name   :no-read-transaction
    :doc    "The read runs its queries with autocommit, one transaction per query."
    :target `library-branching.db/do-with-read-point
    :edits  [[:replace '(t2/with-transaction [_ conn] (f)) '(f)]]}
   {:name   :read-in-open-transaction
    :doc    "The read point runs inside an open transaction of the caller, whose isolation it cannot set."
    :target `library-branching.db/do-with-read-point
    :edits  [[:replace '(mdb/in-transaction?) false]]}
   {:name   :every-column-is-content
    :doc    "A metric's attributes are all the columns that the read selects, not the closed list of the format: ids,
            the card schema and derived metadata become content."
    :target `kinds.metric/attrs
    :edits  [[:replace '(keys (:attrs format.metric/spec)) '(keys card)]]}
   {:name   :parent-dropped
    :doc    "A collection's place is not its parent: every collection is at the root level."
    :target `kinds.collection/portable-content
    :edits  [[:replace '(serdes/*export-fk* (parent-id location) :model/Collection) nil]]}
   {:name   :no-prefetch
    :doc    "The batched export answers no lookup from the prefetched rows, so each reference costs its own query."
    :target `portable/export-batch
    :edits  [[:replace '(fetch @requests) {}]]}
   {:name   :no-refs
    :doc    "An item holds no references."
    :target `content/item
    :edits  [[:replace '(format.kinds/refs kind id attrs) #{}]]}
   {:name   :defaults-kept
    :doc    "An attribute that is nil or at its default stays in the attributes."
    :target `content/attrs
    :edits  [[:replace '(format.common/drop-defaults spec (into {} (remove (comp nil? val)) m)) 'm]]}
   {:name   :tags-not-portable
    :doc    "A snippet's template tags keep the database id of the snippet that they name."
    :target `kinds.snippet/attrs
    :edits  [[:replace '(serdes/export-mbql (:template_tags snippet)) '(:template_tags snippet)]]}
   {:name   :field-names-with-table
    :doc    "A field entry of a published table is keyed by its whole natural key, not by its name."
    :target `kinds.published-table/fields
    :edits  [[:replace '(drop 3 (serdes/*export-field-fk* (:field_id row)))
              '(serdes/*export-field-fk* (:field_id row))]]}])

(def ^:private tests
  [#'metabase-enterprise.library-branching.instance.kinds-test/collection-content-test
   #'metabase-enterprise.library-branching.instance.kinds-test/metric-content-test
   #'metabase-enterprise.library-branching.instance.kinds-test/snippet-content-test
   #'metabase-enterprise.library-branching.instance.kinds-test/published-table-content-test
   #'metabase-enterprise.library-branching.instance.kinds-test/items-fit-the-format-test
   #'metabase-enterprise.library-branching.instance.kinds-test/local-changes-test
   #'metabase-enterprise.library-branching.instance.kinds-test/batched-read-test
   #'metabase-enterprise.library-branching.instance.golden-test/read-gives-golden-items-test
   #'metabase-enterprise.library-branching.instance.read-property-test/read-matches-reference-model-test
   #'metabase-enterprise.library-branching.instance.app-db-test/read-snapshot-needs-its-own-transaction-test
   #'metabase-enterprise.library-branching.instance.app-db-test/save-during-read-is-not-in-snapshot-test])

(deftest read-side-mutations-test
  (mut/check mutations {:tests tests :timeout-ms 180000}))
