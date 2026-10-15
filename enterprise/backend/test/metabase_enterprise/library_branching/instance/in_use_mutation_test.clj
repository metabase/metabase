(ns metabase-enterprise.library-branching.instance.in-use-mutation-test
  "Mutations of the rules of the in-use report of a trashed card: the links to it by click behaviors and link cards.
  Each mutation removes or weakens one rule, and the test that it names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.card-test :as card-test]
   [metabase-enterprise.library-branching.instance.in-use :as in-use]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def mutations
  "Each mutation removes or weakens one rule of the in-use report of a trashed card."
  [{:name   :no-card-link-users
    :doc    "The in-use report of a trashed card names only the users by query and the dashboards that show it."
    :target `in-use/users
    :edits  [[:replace '(contains? card-kinds kind) false]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :card-click-behaviors-ignored
    :doc    "The in-use report of a trashed card reads no card outside the Library, so a click behavior of a card is not
            reported."
    :target `in-use/link-users
    :edits  [[:replace '(users :card kinds.card/read-cards (library-branching.db/cards-with-settings-mentioning row-id))
              nil]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :card-dashboard-links-ignored
    :doc    "The in-use report of a trashed card reads no dashboard outside the Library by its settings, so a click
            behavior of a dashboard card or a link card is not reported."
    :target `in-use/link-users
    :edits  [[:replace '(users :dashboard kinds.dashboard/read-dashboards
                               (library-branching.db/dashboards-with-settings-mentioning row-id))
              nil]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :card-links-in-scope
    :doc    "The in-use report of a trashed card names a card in the Library that links to it."
    :target `in-use/link-users
    :edits  [[:replace '(remove in-scope candidates) 'candidates]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :card-links-unchecked
    :doc    "The in-use report of a trashed card names each card and dashboard whose settings text holds the id of the
            card, also when it links to another item or to none."
    :target `in-use/link-users
    :edits  [[:replace '(uses? kind id refs) true]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :card-users-repeated
    :doc    "The in-use report names a card twice when it uses the trashed card by its query and links to it."
    :target `in-use/users
    :edits  [[:remove 'distinct]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}
   {:name   :trashed-links-kept
    :doc    "The in-use report names a card in the trash that links to the trashed card."
    :target `library-branching.db/cards-with-settings-mentioning
    :edits  [[:replace '[:= :archived false] 'true]]
    :tests  [#'card-test/trashed-card-linked-in-use-test]}])

(deftest in-use-mutations-test
  (mut/check mutations {}))
