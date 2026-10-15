(ns metabase-enterprise.library-branching.instance.dashboard-mutation-test
  "Mutations of the rules of the instance side of dashboards. Each mutation removes or weakens one rule, and a test of
  the rule must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.dashboard-property-test :as property-test]
   [metabase-enterprise.library-branching.instance.dashboard-test :as dashboard-test]
   [metabase-enterprise.library-branching.instance.kinds.dashboard :as dashboard]
   [metabase-enterprise.library-branching.instance.lock-test :as lock-test]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the instance side of dashboards."
  [{:name   :archived-in-scope
    :doc    "Scope keeps an archived dashboard, so a trashed one is still synced."
    :target `scope/collection-item-query
    :edits  [[:replace '(unarchived :t.archived) true]]
    :tests  [#'dashboard-test/scope-test]}
   {:name   :no-tab-order
    :doc    "A read gives the tabs in the order of their rows, not of their positions, so a tab moved to the front reads
            back in its old place."
    :target `library-branching.db/tabs-of-dashboards
    :edits  [[:replace '[:position :asc] '[:id :asc]]]
    :tests  [#'dashboard-test/put-get-test]}
   {:name   :no-card-order
    :doc    "A read gives the dashboard cards in the order of their rows, so a read differs between two instances."
    :target `dashboard/portable-content
    :edits  [[:replace '(format.dashboard/dashcard-order tab-items entries) 'entries]]
    :tests  [#'dashboard-test/content-test]}
   {:name   :every-attribute-written
    :doc    "A write sets every attribute, also one whose content did not change. Toucan skips an update to the values
            that a row has, so no row changes: the mutation survives, and GetPut does not rest on this comparison."
    :target `dashboard/write-dashboard!
    :edits  [[:replace '(content/changed-attrs format.dashboard/spec (:attrs old) attrs) '(set own)]]
    :expect :survived
    :tests  [#'dashboard-test/get-put-test]}
   {:name   :every-card-written
    :doc    "A write sets every column of each dashboard card that it keeps. Toucan skips an update to the values that a
            row has, so no row changes: the mutation survives, and GetPut does not rest on this comparison."
    :target `dashboard/write-dashcards!
    :edits  [[:replace '(not= (entry-v before k) (entry-v entry k)) true]]
    :expect :survived
    :tests  [#'dashboard-test/get-put-test]}
   {:name   :series-not-written
    :doc    "A write of a dashboard card that it keeps leaves its series as they were."
    :target `dashboard/write-dashcards!
    :edits  [[:replace '(not= (:series before []) (:series entry [])) false]]
    :tests  [#'dashboard-test/put-get-test #'property-test/dashboard-laws-test]}
   {:name   :tab-position-not-written
    :doc    "A write of a tab that it keeps leaves its position as it was."
    :target `dashboard/write-tabs!
    :edits  [[:replace '(not= i (get positions eid)) false]]
    :tests  [#'dashboard-test/put-get-test]}
   {:name   :tabs-not-deleted
    :doc    "A write leaves the tabs that the content does not hold."
    :target `dashboard/write-children!
    :edits  [[:replace '(seq gone) false]]
    :tests  [#'dashboard-test/put-get-test #'property-test/dashboard-laws-test]}
   {:name   :cards-not-deleted
    :doc    "A write leaves the dashboard cards that the content does not hold."
    :target `dashboard/delete-gone-dashcards!
    :edits  [[:replace '(seq gone) false]]
    :tests  [#'dashboard-test/put-get-test #'property-test/dashboard-laws-test]}
   {:name   :no-restore
    :doc    "A write of a trashed dashboard leaves it in the trash."
    :target `dashboard/write-dashboard!
    :edits  [[:replace '(:archived row) false]]
    :tests  [#'dashboard-test/trash-and-restore-test]}
   {:name   :no-trash
    :doc    "trash! of a dashboard does nothing."
    :target `dashboard/trash-dashboard!
    :edits  [[:replace '(library-branching.db/update-dashboard! (:id row) {:archived true :archived_directly true}) nil]]
    :tests  [#'dashboard-test/trash-and-restore-test]}
   {:name   :questions-not-trashed
    :doc    "trash! of a dashboard leaves its questions out of the trash, so archive is not closed downward."
    :target `dashboard/trash-dashboard!
    :edits  [[:replace '(dashboard/cascade-card-state-from-dashboard-update! row {:archived true}) nil]]
    :tests  [#'dashboard-test/trash-and-restore-test]}
   {:name   :questions-not-moved
    :doc    "A write that moves a dashboard leaves its questions in the old collection."
    :target `dashboard/write-dashboard!
    :edits  [[:replace '(contains? changes :collection_id) false]]
    :tests  [#'dashboard-test/move-test]}
   {:name   :take-over-outside
    :doc    "A write matches an identity also outside the Library tree, so a file takes over a person's dashboard."
    :target `dashboard/write-dashboard!
    :edits  [[:replace '(tree/collection-id-in-tree? (:collection_id row)) true]]
    :tests  [#'dashboard-test/refused-writes-test]}
   {:name   :missing-field-made
    :doc    "A write makes a stub field for a field that this instance does not have, as serdes import does."
    :target `portable/strict-import-resolver
    :edits  [[:replace '(instance/refuse! :environment id (str "This instance has no field " (pr-str field-key) ".")
                                          {:target field-key})
              '(binding [serdes.resolve/*import-resolver* nil] (serdes/*import-field-fk* field-key))]]
    :tests  [#'dashboard-test/refused-writes-test]}
   {:name   :missing-card-unchecked
    :doc    "A write of a dashboard card whose card this instance does not have throws a serdes error, not a refusal."
    :target `portable/strict-import-resolver
    :edits  [[:replace '(= :target-not-found (:metabase.models.serialization/type (ex-data e))) false]]
    :tests  [#'dashboard-test/refused-writes-test]}
   {:name   :no-card-lock
    :doc    "current takes no lock on the rows of the dashboard cards, so a save of a card by another connection does not
            wait."
    :target `library-branching.db/lock-dashboard
    :edits  [[:replace '(t2/query (assoc dashcards :for [:update])) nil]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :no-tab-lock
    :doc    "current takes no lock on the rows of the tabs."
    :target `library-branching.db/lock-dashboard
    :edits  [[:replace '(t2/query {:select [:id]
                                   :from   [(t2/table-name :model/DashboardTab)]
                                   :where  [:= :dashboard_id [:auto/param (:id row)]]
                                   :for    [:update]})
              nil]]
    :tests  [#'lock-test/current-locks-the-row-test]}
   {:name   :stub-keeps-cards
    :doc    "The stub of a dashboard keeps its cards, so a new dashboard on a reference cycle cannot be written first."
    :target `dashboard/stub-dashboard
    :edits  [[:replace '(dissoc (:attrs content) :dashcards :parameters) '(:attrs content)]]
    :tests  [#'dashboard-test/stub-test]}])

(deftest dashboard-mutations-test
  (mut/check mutations {}))
