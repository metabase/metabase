(ns metabase-enterprise.library-branching.old-format-mutation-test
  "Mutations of the rules that decode the old format with values of the instance: a published table with no display
  name has the name that warehouse sync gives it on the instance, and the row id of a link card to a metric names the
  card of that row on the instance. Each mutation removes or weakens a rule at one place, and one of the tests that it
  names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.format.old :as old]
   [metabase-enterprise.library-branching.format.old-test :as old-test]
   [metabase-enterprise.library-branching.format.old.published-table :as old.published-table]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.old-format-app-db-test :as old-format-app-db-test]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.status :as status]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation drops or weakens the names of warehouse sync or the card ids of the instance at one place."
  [{:name   :pull-head-unnamed
    :doc    "The pull decodes the head with no names: the first pull of the local content gives a conflict."
    :target `pull/pull!
    :edits  [[:replace '(check-commit store codecs h decoding) '(check-commit store codecs h {})]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :pull-base-unnamed
    :doc    "The pull decodes the base with no names: a head that changes a table gives a conflict."
    :target `pull/pull!
    :edits  [[:replace '(base-snapshot store codecs decoding b branch h) '(base-snapshot store codecs {} b branch h)]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :deploy-head-unnamed
    :doc    "The deploy decodes the head with no names: it writes the table name as a user display name."
    :target `deploy/deploy!
    :edits  [[:replace '(pull/decode-opts inst) {}]]
    :tests  [#'old-format-app-db-test/deploy-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :deploy-base-unnamed
    :doc    "The drift check decodes the base with no names: each table with no user display name is drift."
    :target `deploy/drift
    :edits  [[:replace '(pull/decode-opts inst) {}]]
    :tests  [#'old-format-app-db-test/deploy-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :status-unnamed
    :doc    "The status decodes with no names: each table with no user display name shows as a remote change."
    :target `status/decode
    :edits  [[:replace '(select-keys opts pull/decode-keys) {}]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :push-base-unnamed
    :doc    "The push decodes a base with no stored digests with no names: each table with no user display name is a
            local change, so the content of the base is something to push."
    :target `push/base-digests
    :edits  [[:replace '(pull/decode-opts inst) {}]]
    :tests  [#'old-format-app-db-test/push-of-old-format-base-names-tables-as-the-instance-does-test]}
   {:name   :merge-branch-task-unnamed
    :doc    "The merge-branch task gives merge-branch no names: the merge writes the table name of a key as a name."
    :target `operations/merge-branch-task!
    :edits  [[:replace '(pull/decode-opts (instance)) {}]]
    :tests  [#'old-format-app-db-test/merge-branch-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :merge-branch-unnamed
    :doc    "Merge-branch decodes the commits with no names: the merge writes the table name of a key as a name."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(select-keys opts pull/decode-keys) {}]]
    :tests  [#'old-format-app-db-test/merge-branch-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :names-with-user-values
    :doc    "The instance gives the display names with the user values: a local rename of a table changes its base too,
            so it is no local change."
    :target `library-branching.db/sync-display-names-by-id
    :edits  [[:replace '{:user-settings? false} {}]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :instance-gives-no-card-ids
    :doc    "The decode options of an instance resolve no card row id: a pull of an old-format link card to a metric is
            refused."
    :target `pull/decode-opts
    :edits  [[:replace :card-ids :no-card-ids]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-link-card-to-a-metric-test]}
   {:name   :app-db-card-ids-dropped
    :doc    "The app DB instance resolves no card row id."
    :target `app-db/card-entity-ids
    :edits  [[:replace '(map (juxt :id :entity_id)) '(map (constantly nil))]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-link-card-to-a-metric-test]}
   {:name   :decoder-ignores-card-ids
    :doc    "The decoder does not ask for the cards: a link card to a metric keeps its row id."
    :target `old/decode-files
    :edits  [[:replace '(old.dashboard/resolve-card-ids opts (keep (fn [{:keys [old model]}]
                                                                     (when (= "Dashboard" model) old))
                                                                   read))
              'opts]]
    :tests  [#'old-test/metric-link-card-test]}
   {:name   :decoder-ignores-names
    :doc    "The decoder does not ask for the names: a table with no display name has the table name of its key."
    :target `old/assemble
    :edits  [[:replace '(old.published-table/resolve-names opts parts) 'opts]]
    :tests  [#'old-test/display-names-test]}
   {:name   :names-of-every-table
    :doc    "The decoder asks for the names of the tables with a display name too."
    :target `old.published-table/unnamed?
    :edits  [[:replace '(nil? (:display_name doc)) true]]
    :tests  [#'old-test/display-names-test]}])

(deftest old-format-names-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
