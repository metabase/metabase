(ns metabase-enterprise.library-branching.old-format-mutation-test
  "Mutations of the rule that a published table of the old format with no display name has the name that warehouse
  sync gives it on the instance. Each mutation removes or weakens the rule at one place, and one of the tests that it
  names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.format.old :as old]
   [metabase-enterprise.library-branching.format.old-test :as old-test]
   [metabase-enterprise.library-branching.format.old.published-table :as old.published-table]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.old-format-app-db-test :as old-format-app-db-test]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.status :as status]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation drops or weakens the names of warehouse sync at one place."
  [{:name   :pull-head-unnamed
    :doc    "The pull decodes the head with no names: the first pull of the local content gives a conflict."
    :target `pull/pull!
    :edits  [[:replace '(check-commit store codecs h decoding) '(check-commit store codecs h {})]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :pull-base-unnamed
    :doc    "The pull decodes the base with no names: a head that changes a table gives a conflict."
    :target `pull/pull!
    :edits  [[:replace '(base-snapshot store codecs decoding b h) '(base-snapshot store codecs {} b h)]]
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
    :edits  [[:replace '(select-keys opts [:table-names]) {}]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
   {:name   :names-with-user-values
    :doc    "The instance gives the display names with the user values: a local rename of a table changes its base too,
            so it is no local change."
    :target `library-branching.db/sync-names-by-key
    :edits  [[:replace '{:alias :t :user-settings? false} '{:alias :t}]]
    :tests  [#'old-format-app-db-test/pull-of-old-format-trees-names-tables-as-the-instance-does-test]}
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
