(ns metabase-enterprise.library-branching.format.old-mutation-test
  "Mutations of the rules of the old-format decoder. Each mutation removes or weakens one rule, and one of the tests
  that it names must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.old :as old]
   [metabase-enterprise.library-branching.format.old-sync-test :as old-sync-test]
   [metabase-enterprise.library-branching.format.old-test :as old-test]
   [metabase-enterprise.library-branching.format.old.card :as old.card]
   [metabase-enterprise.library-branching.format.old.collection :as old.collection]
   [metabase-enterprise.library-branching.format.old.glossary :as old.glossary]
   [metabase-enterprise.library-branching.format.old.published-table :as old.published-table]
   [metabase-enterprise.library-branching.format.old.snippet :as old.snippet]
   [metabase-enterprise.library-branching.format.old.table-item :as old.table-item]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; The round-trip property test is in no list: it takes most of the time of a run, and the fixed tests kill each
;; mutation.
(def mutations
  "Each mutation removes or weakens one rule of the old-format decoder."
  [{:name   :v57-marker-kept
    :doc    "A collection that v57 marked with `type: remote-synced` keeps the marker as its type."
    :target `old.collection/decode
    :edits  [[:replace '(when-not (contains? scope-markers (:type doc)) (:type doc)) '(:type doc)]]
    :tests  [#'old-test/v57-remote-synced-collection-test
             #'old-test/v57-nested-remote-synced-collections-test]}
   {:name   :trash-kept
    :doc    "An archived collection is in the snapshot."
    :target `old.collection/decode
    :edits  [[:replace '(common/archived? doc) false]]
    :tests  [#'old-test/archived-items-test]}
   {:name   :trash-not-closed
    :doc    "An item under an archived collection is in the snapshot."
    :target `old/without-trash
    :edits  [[:replace '(contains? gone place) false]]
    :tests  [#'old-test/archived-items-test]}
   {:name   :archived-card-kept
    :doc    "An archived card is in the snapshot."
    :target `old.card/decode
    :edits  [[:replace '(common/archived? doc) false]]
    :tests  [#'old-test/cards-test]}
   {:name   :nil-settings-kept
    :doc    "A metric keeps the nil visualization settings that the export writes, so it differs from what the
            instance reads."
    :target `old.card/decode
    :edits  [[:replace '(some-> (:visualization_settings doc) common/present) '(:visualization_settings doc)]]
    :tests  [#'old-test/remote-sync-files-decode-to-the-golden-items-test]}
   {:name   :unknown-model-dropped
    :doc    "A file of a serdes model with no decoder is dropped, so a pull would trash its item."
    :target `old/decode-file
    :edits  [[:replace '(finding :unknown-kind (str "No old-format decoder for the model " model) :model model) nil]]
    :tests  [#'old-test/unknown-models-test]}
   {:name   :term-by-shape
    :doc    "A term of 21 characters of the entity-id alphabet is taken as an entity id."
    :target `old.glossary/decode
    :edits  [[:replace '(term-identity term) '(if (re-matches #"[A-Za-z0-9_-]{21}" term) term (term-identity term))]]
    :tests  [#'old-test/nano-id-shaped-term-test]}
   {:name   :term-identity-unstable
    :doc    "The identity of a term-keyed glossary file differs from pull to pull."
    :target `old.glossary/term-identity
    :edits  [[:replace '(str "metabase glossary term:" term) '(str (random-uuid) term)]]
    :tests  [#'old-test/term-keyed-glossary-file-test]}
   {:name   :flags-ignored
    :doc    "A table value whose flag is false counts as a value that the user set."
    :target `old.published-table/user-set?
    :edits  [[:replace '(true? (get doc flag)) '(some? (get doc column))]]
    :tests  [#'old-test/user-set-values-test]}
   {:name   :coercion-unconditional
    :doc    "A coercion strategy counts as the user's also when the user did not set the effective type."
    :target `old.published-table/field-set?
    :edits  [[:replace '(some? (:effective_type doc)) '(some? (get doc column))]]
    :tests  [#'old-test/user-set-values-test]}
   {:name   :legacy-layers-kept
    :doc    "A data layer of the medallion names stays as it is, which the format refuses."
    :target `old.published-table/table-values
    :edits  [[:replace '(contains? legacy-data-layers (:data_layer doc)) false]]
    :tests  [#'old-test/legacy-data-layers-test]}
   {:name   :v64-fields-ignored
    :doc    "The field settings of a v64 table settings file are dropped."
    :target `old.published-table/decode-table-settings
    :edits  [[:replace '(:fields doc) nil]]
    :tests  [#'old-test/table-settings-test]}
   {:name   :v64-fields-win
    :doc    "The entry of a field in a v64 table settings file wins over its own settings file."
    :target `old.published-table/by-field
    :edits  [[:replace '(some (fn [p] (when (from-file? p) p)) ps) nil]]
    :tests  [#'old-test/field-settings-sources-test]}
   {:name   :no-remappings
    :doc    "The remappings of the fields are not content."
    :target `old.published-table/fields-attr
    :edits  [[:replace '(assoc-in acc (conj (field-path k) :remapping) remapping) 'acc]]
    :tests  [#'old-test/table-settings-test #'old-test/remapping-test]}
   {:name   :remapping-files-not-unique
    :doc    "Two Dimension files of one field give no finding, and one of them is lost in silence."
    :target `old.published-table/assemble
    :edits  [[:replace '(duplicates :key (filter from-file? remappings)) nil]]
    :tests  [#'old-test/remapping-test]}
   {:name   :external-remapping-without-target
    :doc    "A foreign-key remapping has no target field."
    :target `old.published-table/remapping
    :edits  [[:replace '(field-key! (or (:human_readable_field_id doc)
                                        (codec/invalid! "A foreign-key remapping has no target field.")))
              nil]]
    :tests  [#'old-test/remapping-test]}
   {:name   :field-files-not-unique
    :doc    "Two settings files of one field give no finding, and one of them is lost in silence."
    :target `old.published-table/assemble
    :edits  [[:replace '(duplicates :key (filter from-file? fields)) nil]]
    :tests  [#'old-test/field-settings-sources-test]}
   {:name   :unpublished-kept
    :doc    "A table whose settings say that it is not published is an item."
    :target `old.published-table/assemble
    :edits  [[:replace '(not (true? (:is_published doc))) false]]
    :tests  [#'old-test/table-settings-test]}
   {:name   :no-sync-names
    :doc    "A published table with no display name in its settings ignores the names of warehouse sync."
    :target `old.published-table/assemble
    :edits  [[:replace '(get table-names table-key) nil]]
    :tests  [#'old-test/display-names-test]}
   {:name   :namespace-collection-unplaced
    :doc    "A collection of a namespace with no parent is at the root level, not at the root of its area."
    :target `old.collection/decode
    :edits  [[:replace '(namespace-root (:namespace doc)) nil]]
    :tests  [#'old-test/top-level-collections-of-areas-test]}
   {:name   :snippet-unplaced
    :doc    "A snippet with no collection is at the root level, not at the root of the Snippets area."
    :target `old.snippet/decode
    :edits  [[:replace '(snapshot/area-root :snippets) nil]]
    :tests  [#'old-test/snippets-test]}
   {:name   :table-item-unplaced
    :doc    "A segment or a measure is at the root level: its place is not the source table of its definition."
    :target `old.table-item/decode-as
    :edits  [[:replace '(table-item/source-table (:definition doc)) nil]]
    :tests  [#'old-test/table-items-test]}
   {:name   :old-format-unread
    :doc    "`claims/decode` does not read the old format, so production cannot pull main before the switch."
    :target `claims/decode
    :edits  [[:replace '(old/decode-tree codecs (in-order (:old-items claims)) opts) '(tree/decode-tree codecs [])]]
    :tests  [#'old-test/claims-decode-test
             #'old-sync-test/pull-of-an-old-format-head-test]}
   {:name   :mixed-accepted
    :doc    "A tree with item files of both formats and no format version file decodes the old files alone."
    :target `claims/decode
    :edits  [[:replace '(seq (:items claims)) false]]
    :tests  [#'old-test/claims-decode-test]}])

(deftest old-format-mutations-test
  (mut/check mutations {}))

(deftest mutations-name-their-tests-test
  (testing "each mutation names the tests of its own rule, and none names the round-trip property test"
    (is (every? (comp seq :tests) mutations))
    (is (not-any? #(some #{#'old-test/old-format-round-trip-property-test} (:tests %)) mutations))))
