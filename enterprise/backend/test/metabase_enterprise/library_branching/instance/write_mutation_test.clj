(ns metabase-enterprise.library-branching.instance.write-mutation-test
  "Mutations of the rules of the instance write side and of the save rule. Each mutation removes or weakens one rule,
  and a test of the write side must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.cascade-test]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.lock-test]
   [metabase-enterprise.library-branching.instance.save-rule :as save-rule]
   [metabase-enterprise.library-branching.instance.save-rule-test]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.instance.values-source :as values-source]
   [metabase-enterprise.library-branching.instance.write-property-test]
   [metabase-enterprise.library-branching.instance.write-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the write side."
  [{:name   :no-card-lock
    :doc    "current reads a card with no row lock, so a save of the card by another connection does not wait."
    :target `library-branching.db/lock-card
    :edits  [[:replace '[:update] nil]]}
   {:name   :no-field-settings-lock
    :doc    "current of a published table locks the table's settings row but not the settings rows of its fields."
    :target `library-branching.db/lock-table-settings
    :edits  [[:replace '[:update] nil {:nth 1}]]}
   {:name   :every-attribute-written
    :doc    "A write of a metric writes every attribute, also one whose content did not change, so a write of the
            current content changes rows (the query gets new uuids)."
    :target `kinds.metric/write-metric!
    :edits  [[:replace '(content/changed-attrs format.metric/spec (:attrs old) attrs) '(keys (:attrs format.metric/spec))]]}
   {:name   :absent-is-nil
    :doc    "An absent attribute is written as nil, not as its default."
    :target `content/attr-value
    :edits  [[:replace '(get-in spec [:attrs k :default]) nil]]}
   {:name   :take-over-outside
    :doc    "A write matches an identity also outside the Library tree, so a file takes over a personal item."
    :target `tree/check-in-tree!
    :edits  [[:replace 'in-tree? true {:nth 1}]]}
   {:name   :kind-not-checked
    :doc    "A write of a metric takes over a card of another kind with the same identity."
    :target `kinds.metric/write-metric!
    :edits  [[:replace '(= "metric" (some-> (:type row) clojure.core/name)) true]]}
   {:name   :place-not-in-scope
    :doc    "A write puts an item into any collection with the identity of its place, also one in the trash or outside
            the Library."
    :target `tree/place-collection
    :edits  [[:replace '(scope/in-scope? :collection place) true]]}
   {:name   :root-level-anywhere
    :doc    "Any collection may be at the root level, not only a fixed root."
    :target `kinds.collection/write-collection!
    :edits  [[:replace '(root? attrs) true]]}
   {:name   :subtree-stays
    :doc    "A move of a collection leaves the locations of its subtree as they were."
    :target `kinds.collection/write-collection!
    :edits  [[:replace '(contains? changes :location) false]]}
   {:name   :no-restore
    :doc    "A write of a trashed metric leaves it in the trash."
    :target `kinds.metric/write-metric!
    :edits  [[:replace '(:archived row) false]]}
   {:name   :no-trash
    :doc    "trash! of a metric does nothing."
    :target `kinds.metric/trash-metric!
    :edits  [[:replace '(library-branching.db/update-card! (:id row) {:archived true :archived_directly true}) nil]]}
   {:name   :instance-local-reset
    :doc    "A write of a metric also resets the public link and the embedding flag, as a load of a file that has no
            such attributes would."
    :target `kinds.metric/write-metric!
    :edits  [[:replace '(library-branching.db/update-card! (:id row) changes)
              '(library-branching.db/update-card! (:id row) (assoc changes :public_uuid nil :enable_embedding false))]]}
   {:name   :visibility-type-is-content
    :doc    "A read gives the visibility type of a table as content, which Metabase derives from the data layer, so a
            written data layer reads back with an attribute that the content did not have."
    :target `kinds.published-table/table-columns
    :edits  [[:replace '(set (keys (:attrs format.published-table/spec)))
              '(conj (set (keys (:attrs format.published-table/spec))) :visibility_type)]]}
   {:name   :field-settings-kept
    :doc    "A field setting that the content no longer has is not cleared."
    :target `kinds.published-table/field-changes
    :edits  [[:replace '(into (set (keys old)) (keys new)) '(keys new)]]}
   {:name   :outside-values-sources-cleared
    :doc    "A trash keeps no ParameterCard row of a user outside the Library tree, so the Card save path clears the
            values source of each parameter outside the Library that takes its values from a trashed card."
    :target `values-source/do-keeping-outside-values-sources
    :edits  [[:replace '(remove (comp in-tree? :user_collection_id)) '(filter (constantly false))]]}
   {:name   :library-values-sources-kept
    :doc    "A trash also keeps the ParameterCard rows of users in the Library tree, so a parameter of Library content
            keeps the values source of a trashed card."
    :target `values-source/do-keeping-outside-values-sources
    :edits  [[:replace '(remove (comp in-tree? :user_collection_id)) '(map identity)]]}
   {:name   :collection-trash-clears-outside-values-sources
    :doc    "A trash of a collection does not keep the values sources outside the Library of the cards in its subtree."
    :target `kinds.collection/trash-collection!
    :edits  [[:replace '(library-branching.db/values-source-users-in-subtree (:id row) (tree/children-location row)) []]]}
   {:name   :trashed-is-absent
    :doc    "current gives a trashed item as absent, so a first pull can write over an identity that a person deleted."
    :target `content/current-state
    :edits  [[:replace '{:state :trashed :content (read)} '{:state :absent}]]
    :tests  [#'metabase-enterprise.library-branching.instance.write-test/current-states-test]}
   {:name   :current-other-kind
    :doc    "current of a metric takes a card of another kind with the identity as the metric."
    :target `kinds.metric/current-metric
    :edits  [[:replace '(= "metric" (some-> (:type row) clojure.core/name)) true]]
    :tests  [#'metabase-enterprise.library-branching.instance.write-test/current-states-test]}
   {:name   :system-item-trashed
    :doc    "trash! of a collection does not refuse a system item of the Library."
    :target `kinds.collection/trash-collection!
    :edits  [[:replace '(contains? snapshot/system-ids id) false]]
    :tests  [#'metabase-enterprise.library-branching.instance.write-test/trash-of-a-system-item-is-refused-test]}
   {:name   :save-rule-sees-no-trash
    :doc    "The save rule finds no reference to an item that is not in scope."
    :target `save-rule/findings
    :edits  [[:replace '(not (contains? in-scope target)) false]]}
   {:name   :save-rule-refuses-old-references
    :doc    "The save rule refuses every save while any reference out of scope exists, also one that the save did not
            add."
    :target `save-rule/do-with-save-rule
    :edits  [[:replace '(set/difference (findings after (in-scope)) old) '(findings after (in-scope))]]}])

(def ^:private tests
  [#'metabase-enterprise.library-branching.instance.cascade-test/metric-trash-keeps-outside-values-sources-test
   #'metabase-enterprise.library-branching.instance.cascade-test/metric-trash-keeps-the-cascade-inside-the-library-test
   #'metabase-enterprise.library-branching.instance.cascade-test/collection-trash-keeps-outside-values-sources-test
   #'metabase-enterprise.library-branching.instance.cascade-test/metric-write-keeps-outside-values-sources-test
   #'metabase-enterprise.library-branching.instance.write-test/metric-write-test
   #'metabase-enterprise.library-branching.instance.write-test/write-keeps-instance-local-attributes-test
   #'metabase-enterprise.library-branching.instance.write-test/no-take-over-outside-the-library-test
   #'metabase-enterprise.library-branching.instance.write-test/trash-keeps-outside-content-working-test
   #'metabase-enterprise.library-branching.instance.write-test/collection-trash-and-restore-test
   #'metabase-enterprise.library-branching.instance.write-test/move-to-the-root-level-test
   #'metabase-enterprise.library-branching.instance.write-test/refused-writes-write-nothing-test
   #'metabase-enterprise.library-branching.instance.write-test/published-table-write-test
   #'metabase-enterprise.library-branching.instance.write-test/published-table-legacy-visibility-type-test
   #'metabase-enterprise.library-branching.instance.write-test/snippet-write-test
   #'metabase-enterprise.library-branching.instance.write-test/write-of-current-content-changes-no-row-test
   #'metabase-enterprise.library-branching.instance.write-test/current-states-test
   #'metabase-enterprise.library-branching.instance.write-test/published-table-states-test
   #'metabase-enterprise.library-branching.instance.write-test/trash-of-a-system-item-is-refused-test
   #'metabase-enterprise.library-branching.instance.write-test/take-theirs-over-a-local-change-test
   #'metabase-enterprise.library-branching.instance.write-property-test/metric-laws-test
   #'metabase-enterprise.library-branching.instance.write-property-test/library-collection-laws-test
   #'metabase-enterprise.library-branching.instance.write-property-test/snippet-collection-laws-test
   #'metabase-enterprise.library-branching.instance.write-property-test/snippet-laws-test
   #'metabase-enterprise.library-branching.instance.write-property-test/published-table-laws-test
   #'metabase-enterprise.library-branching.instance.write-property-test/layer-content-laws-test
   #'metabase-enterprise.library-branching.instance.save-rule-test/trash-of-a-used-item-is-refused-test
   #'metabase-enterprise.library-branching.instance.save-rule-test/reference-out-of-scope-is-refused-test
   #'metabase-enterprise.library-branching.instance.save-rule-test/saves-the-rule-allows-test
   #'metabase-enterprise.library-branching.instance.save-rule-test/trash-of-a-used-snippet-is-refused-test
   #'metabase-enterprise.library-branching.instance.lock-test/current-locks-the-row-test])

(deftest write-side-mutations-test
  (mut/check mutations {:tests tests :timeout-ms 300000}))
