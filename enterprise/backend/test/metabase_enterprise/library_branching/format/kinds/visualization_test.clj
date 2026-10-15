(ns metabase-enterprise.library-branching.format.kinds.visualization-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.kinds.visualization :as visualization]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.models.serialization :as serdes]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private total [sd "PUBLIC" "ORDERS" "TOTAL"])
(def ^:private slashed [sd "PUBLIC" "ORDERS" "a/b \"c\""])
(def ^:private card-id "cArDcArDcArDcArDcArD1")
(def ^:private dashboard-id "dAsHbOaRdDaShBoArDdA1")
(def ^:private tab-id "tAbTaBtAbTaBtAbTaBtA1")
(def ^:private collection-id "cOlLeCtIoNcOlLeCtIoN1")
(def ^:private timeline-id "tImElInEtImElInEtImE1")
(def ^:private other-timeline-id "tImElInEtImElInEtImE2")
(def ^:private event-id "eVeNteVeNteVeNteVeNt1")
(def ^:private metric-id "mEtRiCmEtRiCmEtRiCmE1")

(defn- json-key
  [x]
  (keyword (json/encode x)))

(def ^:private dimension (json/encode ["dimension" ["field" slashed nil]]))

(def ^:private not-a-ref
  "JSON text of a dimension in a position that holds no JSON text: the id of a dashboard parameter."
  (json/encode ["dimension" ["field" [sd "PUBLIC" "ORDERS" "NOT_A_REF"] nil]]))

(def ^:private settings
  "Visualization settings with one reference at each position."
  {:column_settings                      {(json-key ["ref" ["field" total nil]])
                                          {:column_title   "Total"
                                           :click_behavior {:type             "link"
                                                            :linkType         "dashboard"
                                                            :targetId         dashboard-id
                                                            :tabId            tab-id
                                                            :parameterMapping {(keyword dimension)
                                                                               {:id     dimension
                                                                                :source {:type "column" :id "TOTAL"}
                                                                                :target {:type "dimension" :id dimension}}
                                                                               :p
                                                                               {:id     "p"
                                                                                :source {:type "column" :id "ID"}
                                                                                :target {:type "parameter" :id not-a-ref}}}}}
                                          (json-key ["name" "COUNT"])
                                          {:column_title "Count"}}
   :click_behavior                       {:type "link" :linkType "question" :targetId card-id}
   :link                                 {:entity {:model "collection" :id collection-id}}
   :timeline.selected_timeline_ids       [timeline-id]
   :timeline.excluded_timeline_event_ids [[other-timeline-id event-id]]
   :graph.dimensions                     ["CREATED_AT"]})

(deftest refs-test
  (testing "the references at each position of visualization settings"
    (is (= #{[:field [:env total]]
             [:dashboard dashboard-id]
             [:field [:env slashed]]
             [:card card-id]
             [:collection collection-id]
             [:timeline timeline-id]
             [:timeline other-timeline-id]}
           (visualization/refs settings))))
  (testing "a link card to an item, a table or a database"
    (doseq [[entity ref] [[{:model "card" :id card-id} [:card card-id]]
                          [{:model "dataset" :id card-id} [:card card-id]]
                          [{:model "question" :id card-id} [:card card-id]]
                          [{:model "metric" :id card-id} [:card card-id]]
                          [{:model "dashboard" :id dashboard-id} [:dashboard dashboard-id]]
                          [{:model "table" :id [sd "PUBLIC" "ORDERS"]} [:table [:env [sd "PUBLIC" "ORDERS"]]]]
                          [{:model "database" :id sd} [:database [:env [sd]]]]]]
      (is (= #{ref} (visualization/refs {:link {:entity entity}})) (pr-str entity))))
  (testing "a link to a URL, a cross filter to a parameter, and a link with no target hold no reference"
    (is (= #{} (visualization/refs {:click_behavior {:type "link" :linkType "url" :linkTemplate "https://x/{{a}}"}})))
    (is (= #{} (visualization/refs {:click_behavior {:type             "crossfilter"
                                                     :parameterMapping {:p {:id     "p"
                                                                            :target {:type "parameter" :id "p"}}}}})))
    (is (= #{} (visualization/refs {:click_behavior {:type "link" :linkType "dashboard"}}))))
  (testing "a click behavior cannot link to a metric, so a link of the type \"metric\" holds no reference"
    (is (= #{} (visualization/refs {:click_behavior {:type "link" :linkType "metric" :targetId card-id}}))))
  (testing "a click behavior that is not a link keeps no reference to a link target that it held before"
    (is (= #{} (visualization/refs {:click_behavior {:type "crossfilter" :linkType "dashboard" :targetId dashboard-id}}))))
  (testing "a target of another shape is the target, so the item schema refuses it"
    (is (= #{[:dashboard 12]} (visualization/refs {:click_behavior {:type "link" :linkType "dashboard" :targetId 12}})))
    (is (= #{[:timeline 3]} (visualization/refs {:timeline.selected_timeline_ids [3]}))))
  (testing "settings of other shapes hold no reference and do not throw"
    (doseq [s [nil "x" [] {:column_settings [1]} {:column_settings {:not-json {:click_behavior 1}}}
               {:click_behavior "x"} {:click_behavior {:type "link" :parameterMapping [1]}} {:link "x"}
               {:link {:entity "x"}} {:link {:entity {:model "action" :id 1}}}
               {:timeline.selected_timeline_ids "x"} {:timeline.excluded_timeline_event_ids {:a 1}}
               {:column_settings {(keyword "[\"ref\"") {}}}]]
      (is (= #{} (visualization/refs s)) (pr-str s)))))

(defspec refs-are-the-generated-refs-test 300
  (prop/for-all [[settings refs] kinds.tu/visualization-settings-refs-gen]
    (= refs (visualization/refs settings))))

(defspec refs-of-document-maps-test 200
  (prop/for-all [settings kinds.tu/visualization-settings-gen]
    (set? (visualization/refs settings))))

;;; ------------------------------------------ The serdes walk of master ---------------------------------------------

(def ^:private role-models
  "The serdes model of the target of each role of an item reference."
  {:card "Card" :source-card "Card" :metric "Card" :dashboard "Dashboard" :collection "Collection"
   :timeline "Timeline" :segment "Segment" :measure "Measure" :snippet "NativeQuerySnippet"})

(defn- serdes-form
  "`settings` in the form that the serdes walk of master reads: column settings keys are strings (the walk takes the
  `name` of a key, which drops the part before a slash)."
  [settings]
  (cond-> settings
    (map? (:column_settings settings)) (update :column_settings update-keys #(subs (str %) 1))))

(defn- serdes-targets
  "`#{[model id]}`: the items that master's serdes walk of the portable `settings` follows: the dependencies of a
  load, and the descendants of an export (with each id its own portable id)."
  [settings]
  (let [s (serdes-form settings)]
    (into (into #{} (map (fn [[{:keys [model id]}]] [model id])) (serdes/visualization-settings-deps false s))
          (binding [serdes/*export-fk* (fn [id _model] id)]
            (keys (serdes/visualization-settings-descendants s {}))))))

(defn- ref-targets
  [refs]
  (into #{} (keep (fn [[role target]] (when-let [m (get role-models role)] [m target]))) refs))

(defspec refs-contain-the-serdes-walk-test 300
  (prop/for-all [[settings _] kinds.tu/visualization-settings-refs-gen]
    (every? (ref-targets (visualization/refs settings)) (serdes-targets settings))))

(deftest serdes-walk-coverage-test
  (testing "the generated settings make the serdes walk follow each kind of link"
    (let [models (into #{} (comp (mapcat (comp serdes-targets first)) (map first))
                       (gen/sample kinds.tu/visualization-settings-refs-gen 300))]
      (is (= #{"Card" "Dashboard" "Collection" "Timeline"} models)))))

;;; -------------------------------------------- Scenario M7-019 -----------------------------------------------------

(deftest link-to-an-out-of-scope-dashboard-test
  (testing (str "a metric whose click behavior links to a dashboard that is not in the snapshot refers to that "
                "dashboard only, and validate reports that reference")
    (let [attrs {:display                "scalar"
                 :query                  {:lib/type "mbql/query"
                                          :database sd
                                          :stages   [{:lib/type "mbql.stage/mbql" :source-table [sd "PUBLIC" "ORDERS"]}]}
                 :visualization_settings {:click_behavior {:type "link" :linkType "dashboard" :targetId dashboard-id}}}
          s     {metric-id {:kind  :metric
                            :name  "Revenue"
                            :place nil
                            :refs  (kinds/refs :metric metric-id attrs)
                            :attrs attrs}}]
      (is (= [{:rule :refs-closed :id metric-id :ref [:dashboard dashboard-id]}]
             (validate/validate s))))))

;;; ------------------------------------------------- Mutations ------------------------------------------------------

(def ^:private mutations
  [{:name   :no-column-keys
    :doc    "The JSON text of a column settings key is not read."
    :target `visualization/column-settings-refs
    :edits  [[:replace '(json-refs k) #{}]]}
   {:name   :no-column-click-behaviors
    :doc    "A click behavior in the column settings is not read."
    :target `visualization/column-settings-refs
    :edits  [[:replace '(click-behavior-refs (:click_behavior v)) nil]]}
   {:name   :no-top-click-behavior
    :doc    "The top-level click behavior is not read."
    :target `visualization/refs
    :edits  [[:replace '(click-behavior-refs (:click_behavior settings)) #{}]]}
   {:name   :no-link-target
    :doc    "A click-behavior link does not refer to its target."
    :target `visualization/click-behavior-refs
    :edits  [[:replace '(conj [role targetId]) 'identity]]}
   {:name   :link-type-ignored
    :doc    "A click behavior of any type refers to its target."
    :target `visualization/click-behavior-refs
    :edits  [[:replace '(= "link" type) true]]}
   {:name   :no-parameter-mappings
    :doc    "The parameter mappings of a click behavior are not read."
    :target `visualization/click-behavior-refs
    :edits  [[:replace '(parameter-mapping-refs parameterMapping) #{}]]}
   {:name   :every-mapping-is-json
    :doc    "A parameter mapping to a parameter is read as JSON text too."
    :target `visualization/parameter-mapping-refs
    :edits  [[:replace '(= "dimension" (get-in m [:target :type])) true]]}
   {:name   :no-link-card
    :doc    "A link card does not refer to its entity."
    :target `visualization/refs
    :edits  [[:replace '(link-card-refs (get-in settings [:link :entity])) nil]]}
   {:name   :no-link-card-environment
    :doc    "A link card to a table or a database does not refer to it."
    :target `visualization/link-card-refs
    :edits  [[:replace '(= "table" model) false] [:replace '(= "database" model) false]]}
   {:name   :no-shown-timelines
    :doc    "The shown timelines are not references."
    :target `visualization/timeline-refs
    :edits  [[:replace '(ids :timeline.selected_timeline_ids) nil]]}
   {:name   :no-hidden-event-timelines
    :doc    "The timeline of a hidden event is not a reference."
    :target `visualization/timeline-refs
    :edits  [[:replace '(ids :timeline.excluded_timeline_event_ids) nil]]}
   {:name   :hidden-event-not-its-timeline
    :doc    "A hidden event refers to the pair, not to its timeline."
    :target `visualization/timeline-refs
    :edits  [[:replace '(first x) 'x]]}
   {:name   :keyword-name-only
    :doc    "The text of a key is its name, so a slash in a field name cuts the JSON text."
    :target `visualization/text
    :edits  [[:replace '(subs (str k) 1) '(name k)]]}
   {:name   :no-generic-walk
    :doc    "The portable references elsewhere in the settings (a pivot split) are not read."
    :target `visualization/refs
    :edits  [[:replace '(portable/refs settings) #{}]]}])

(deftest visualization-mutations-test
  (mut/check mutations {:tests [#'refs-test #'refs-are-the-generated-refs-test]}))
