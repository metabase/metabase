(ns metabase-enterprise.library-branching.instance.action-mutation-test
  "Mutations of the rules of the instance side of actions. Each mutation removes or weakens one rule, and a test of the
  rule must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.action-property-test :as property-test]
   [metabase-enterprise.library-branching.instance.action-test :as action-test]
   [metabase-enterprise.library-branching.instance.in-use :as in-use]
   [metabase-enterprise.library-branching.instance.kinds.action :as action]
   [metabase-enterprise.library-branching.instance.lock-test :as lock-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def mutations
  "Each mutation removes or weakens one rule of the instance side of actions."
  [{:name   :archived-in-scope
    :doc    "Scope keeps an archived action, so a trashed one is still synced."
    :target [:method `scope/kind-query :action]
    :edits  [[:replace '(unarchived :t.archived) true]]
    :tests  [#'action-test/scope-test #'action-test/local-changes-test]}
   {:name   :place-is-the-collection
    :doc    "A read gives the collection of an action with a model as its place, so the action is not in its model."
    :target `action/portable-content
    :edits  [[:replace '(or model (serdes/*export-fk* collection_id :model/Collection))
              '(serdes/*export-fk* collection_id :model/Collection)]]
    :tests  [#'action-test/action-content-test]}
   {:name   :nil-settings-kept
    :doc    "A read keeps the nil column settings that the export adds, so a write of the content reads back with
            another value."
    :target `action/without-nil-settings
    :edits  [[:replace '(remove (comp nil? val)) '(map identity)]]
    :tests  [#'action-test/action-content-test]}
   {:name   :model-out-of-scope
    :doc    "A write puts an action on a model outside the Library."
    :target `action/model-card!
    :edits  [[:replace '(scope/in-scope? :model model) true]]
    :tests  [#'action-test/refused-writes-write-nothing-test]}
   {:name   :any-namespace
    :doc    "A write puts an action with no model in a collection of any namespace."
    :target `action/model-less-collection!
    :edits  [[:replace '(contains? model-less-namespaces (:namespace row)) true]]
    :tests  [#'action-test/refused-writes-write-nothing-test]}
   {:name   :take-over-outside
    :doc    "A write or a trash matches an identity also on a model outside the Library tree, so a file takes over a
            person's action."
    :target `action/row-in-tree?
    :edits  [[:replace '(nil? model_id) true] [:replace '(tree/collection-id-in-tree? collection_id) true]]
    :tests  [#'action-test/refused-writes-write-nothing-test]}
   {:name   :every-attribute-written
    :doc    "A write writes every attribute, also one whose content did not change, so a write of the current content
            changes the rows."
    :target `action/write-action!
    :edits  [[:replace '(content/changed-attrs format.action/spec (:attrs old) attrs) '(keys (:attrs format.action/spec))]]
    :tests  [#'action-test/write-test #'property-test/put-get-get-put-test]}
   {:name   :no-restore
    :doc    "A write of a trashed action leaves it in the trash."
    :target `action/write-action!
    :edits  [[:replace '(:archived row) false]]
    :tests  [#'action-test/write-test]}
   {:name   :no-trash
    :doc    "trash! of an action does nothing."
    :target `action/trash-action!
    :edits  [[:replace '(library-branching.db/archive-action! (:id row)) nil]]
    :tests  [#'action-test/write-test #'action-test/trash-keeps-outside-dashboards-test]}
   {:name   :data-app-action-archived
    :doc    "trash! tries to archive an action in the collection of a data app, which Metabase refuses with an error
            that is no refusal."
    :target `action/trash-action!
    :edits  [[:replace '(some-> (:collection_id row) library-branching.db/resource-collection?) false]]
    :tests  [#'action-test/trash-of-a-data-app-action-test]}
   {:name   :no-child-lock
    :doc    "current locks the action row only, so a save of its query by another connection does not wait."
    :target `library-branching.db/lock-action
    :edits  [[:replace '[:model/QueryAction :model/ImplicitAction] []]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :action-not-in-use
    :doc    "The in-use report knows no action, so a pull that trashes an action that a dashboard outside the Library
            shows does not name the dashboard."
    :target `in-use/users
    :edits  [[:replace '(model-of kind) '(get (dissoc model-of :action) kind)]]
    :tests  [#'action-test/trash-keeps-outside-dashboards-test]}])

(deftest action-mutations-test
  (mut/check mutations {:timeout-ms 300000}))
