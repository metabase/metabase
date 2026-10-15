(ns metabase-enterprise.library-branching.format.kinds.dashboard-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.dashboard :as dashboard]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private category [sd "PUBLIC" "PRODUCTS" "CATEGORY"])
(def ^:private dashboard-id "dAsHbOaRdDaShBoArDdA1")
(def ^:private other-dashboard-id "oThErDaShBoArDoThEr01")
(def ^:private collection-id "dAsHbOaRdScOlLeCtIoN1")
(def ^:private metric-id "IW8kbqZVaMxdGtCM2F4U6")
(def ^:private values-card-id "vAlUeScArDvAlUeScArD1")
(def ^:private series-card-id "sErIeScArDsErIeScArD1")
(def ^:private visualizer-card-id "vIsUaLiZeRcArDvIsUa01")
(def ^:private action-id "aCtIoNaCtIoNaCtIoNa01")
(def ^:private tab-1 "tAbOnEtAbOnEtAbOnEtA1")
(def ^:private tab-2 "tAbTwOtAbTwOtAbTwOtA2")
(def ^:private card-1 "dAsHcArDoNeDaShCaRd01")
(def ^:private card-2 "dAsHcArDtWoDaShCaRd02")
(def ^:private card-3 "dAsHcArDtHrEeDaShCa03")

(def ^:private attrs
  {:description "Revenue at a glance."
   :width       "full"
   :parameters  [{:id                   "cat01"
                  :name                 "Category"
                  :slug                 "category"
                  :type                 "string/="
                  :values_source_type   "card"
                  :values_source_config {:card_id values-card-id :value_field ["field" category nil]}}
                 {:id "date1" :name "Date" :slug "date" :type "date/all-options"}]
   :tabs        [{:id tab-1 :name "Overview"} {:id tab-2 :name "Details"}]
   :dashcards   [{:id                 card-1
                  :card_id            metric-id
                  :dashboard_tab_id   tab-1
                  :row                0
                  :col                0
                  :size_x             12
                  :size_y             6
                  :parameter_mappings [{:parameter_id "cat01"
                                        :card_id      metric-id
                                        :target       ["dimension" ["field" category nil]]}]
                  :series             [series-card-id]}
                 {:id                     card-2
                  :dashboard_tab_id       tab-1
                  :row                    6
                  :col                    0
                  :size_x                 12
                  :size_y                 2
                  :visualization_settings {:virtual_card {:display "text"} :text "Notes"}}
                 {:id               card-3
                  :action_id        action-id
                  :dashboard_tab_id tab-2
                  :row              0
                  :col              0
                  :size_x           4
                  :size_y           2}]})

(defn- item
  ([] (item attrs))
  ([a]
   {:kind  :dashboard
    :name  "Revenue overview"
    :place collection-id
    :refs  (kinds/refs :dashboard dashboard-id a)
    :attrs a}))

(defn- valid? [x] (mr/validate (codec/schema dashboard/codec) x))

(defn- yaml-text [x] (String. ^bytes (writer/write-yaml (codec/encode dashboard/codec dashboard-id x)) "UTF-8"))

(defn- decode-text [s] (codec/decode dashboard/codec (codec/read-yaml (.getBytes ^String s "UTF-8"))))

;;; ------------------------------------------------------ Format -----------------------------------------------------

(deftest encode-test
  (testing "the document of a dashboard: the place as collection, the attributes as they are"
    (is (= (merge {:kind "dashboard" :id dashboard-id :name "Revenue overview" :collection collection-id} attrs)
           (codec/encode dashboard/codec dashboard-id (item)))))
  (testing "decode gives the item back"
    (is (= [dashboard-id (item)] (codec/decode dashboard/codec (codec/encode dashboard/codec dashboard-id (item)))))
    (is (valid? (item)))))

(deftest legible-file-test
  (testing "a tab, a parameter of plain values and a dashboard card of plain values are each one line of the file"
    (let [lines (set (str/split-lines (yaml-text (item))))]
      (is (contains? lines (str "- {id: " tab-1 ", name: Overview}")))
      (is (contains? lines "- {id: date1, name: Date, slug: date, type: date/all-options}"))
      (is (contains? lines (str "- {id: " card-3 ", action_id: " action-id ", col: 0, dashboard_tab_id: " tab-2
                                ", row: 0, size_x: 4, size_y: 2}")))
      (testing "and an MBQL clause in a parameter mapping is one line"
        (is (contains? lines (str "    target: [dimension, [field, [" (str/join ", " category) "], null]]")))))))

(deftest decode-normalizes-test
  (testing "a file with its dashboard cards in another order decodes to the item with the cards in their order"
    (let [doc (update (codec/encode dashboard/codec dashboard-id (item)) :dashcards (comp vec reverse))]
      (is (= [dashboard-id (item)] (codec/decode dashboard/codec doc)))))
  (testing "an entry of a dashboard card at its default decodes as if it were absent"
    (doseq [[k v] [[:parameter_mappings []] [:visualization_settings {}] [:series []] [:inline_parameters []]
                   [:card_id nil]]]
      (let [doc (assoc-in (codec/encode dashboard/codec dashboard-id (item)) [:dashcards 2 k] v)]
        (is (= [dashboard-id (item)] (codec/decode dashboard/codec doc)) (str k)))))
  (testing "parameter mappings decode in the order of their parameter ids, as the serdes export of master gives them"
    (let [mappings [{:parameter_id "zz" :target ["dimension" ["field" category nil]]}
                    {:parameter_id "aa" :target ["dimension" ["field" category nil]]}]
          doc      (assoc-in (codec/encode dashboard/codec dashboard-id (item)) [:dashcards 2 :parameter_mappings] mappings)]
      (is (= (vec (reverse mappings))
             (get-in (second (codec/decode dashboard/codec doc)) [:attrs :dashcards 2 :parameter_mappings])))))
  (testing "an absent tab list, card list or parameter list is empty"
    (is (= [dashboard-id (item {})]
           (decode-text (str "kind: dashboard\nid: " dashboard-id "\nname: Revenue overview\ncollection: "
                             collection-id "\ntabs: []\ndashcards: []\nparameters: []\nwidth: fixed\n"))))))

(deftest refs-test
  (testing "the references of a dashboard: the values source of a parameter, and each card's card, action, series,
            parameter mappings and visualization settings"
    (is (= #{[:card values-card-id]
             [:field [:env category]]
             [:card metric-id]
             [:card series-card-id]
             [:action action-id]}
           (kinds/refs :dashboard dashboard-id attrs))))
  (testing "the card of a dashboard card, and the card and the field of a parameter mapping, are references each"
    (is (= #{[:card metric-id]}
           (kinds/refs :dashboard dashboard-id {:dashcards [{:id card-1 :card_id metric-id :row 0 :col 0
                                                             :size_x 4 :size_y 4}]})))
    (is (= #{[:card series-card-id] [:field [:env category]]}
           (kinds/refs :dashboard dashboard-id
                       {:dashcards [{:id                 card-1 :row 0 :col 0 :size_x 4 :size_y 4
                                     :parameter_mappings [{:parameter_id "cat01"
                                                           :card_id      series-card-id
                                                           :target       ["dimension" ["field" category nil]]}]}]}))))
  (testing "a click behavior, a link card and the cards that the visualizer names are references"
    (let [settings {:click_behavior {:type "link" :linkType "dashboard" :targetId other-dashboard-id
                                     :tabId  [other-dashboard-id tab-1]}
                    :visualization  {:columnValuesMapping {:COLUMN_1 [{:sourceId (str "card:" visualizer-card-id)
                                                                       :name     "COUNT"}]
                                                           :DIMENSION [(str "$_card:" series-card-id "_name")]}}}]
      (is (= #{[:dashboard other-dashboard-id] [:card visualizer-card-id] [:card series-card-id]}
             (kinds/refs :dashboard dashboard-id
                         {:dashcards [{:id card-1 :row 0 :col 0 :size_x 4 :size_y 4
                                       :visualization_settings settings}]})))
      (is (= #{[:collection collection-id]}
             (kinds/refs :dashboard dashboard-id
                         {:dashcards [{:id card-1 :row 0 :col 0 :size_x 4 :size_y 4
                                       :visualization_settings {:link {:entity {:model "collection"
                                                                                :id    collection-id}}}}]})))))
  (testing "a tab of the dashboard and a parameter id are not references"
    (is (= #{} (kinds/refs :dashboard dashboard-id {:tabs      [{:id tab-1 :name "Overview"}]
                                                    :dashcards [{:id card-1 :dashboard_tab_id tab-1 :row 0 :col 0
                                                                 :size_x 4 :size_y 4 :inline_parameters ["cat01"]}]})))))

(deftest attributes-test
  (testing "the content attributes of a dashboard"
    (is (= #{:description :caveats :points_of_interest :collection_position :position :width :auto_apply_filters
             :show_in_getting_started :parameters :tabs :dashcards}
           (set (keys (:attrs dashboard/spec))))))
  (testing "the defaults are not in :attrs"
    (doseq [[k v] [[:width "fixed"] [:auto_apply_filters true] [:show_in_getting_started false] [:parameters []]
                   [:tabs []] [:dashcards []]]]
      (is (not (valid? (item (assoc attrs k v)))) (str k))))
  (testing "the public link, the embedding settings, the archive and the cache are not attributes"
    (doseq [k [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type :archived
               :archived_directly :cache_ttl :view_count :last_viewed_at :initially_published_at]]
      (is (not (valid? (assoc-in (item) [:attrs k] "x"))) (str k)))))

(defn- with-dashcards [dcs] (item (assoc attrs :dashcards dcs)))

(deftest structure-test
  (testing "two tabs with one id, or two dashboard cards with one id, do not fit"
    (is (not (valid? (item (assoc attrs :tabs [{:id tab-1 :name "Overview"} {:id tab-1 :name "Details"}]))))))
  (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [2 :id] card-1)))))
  (testing "a dashboard card on a tab that the dashboard does not have does not fit"
    (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [0 :dashboard_tab_id] "nOtAtAbNoTaTaBnOtAtA9"))))))
  (testing "dashboard cards out of their order do not fit"
    (is (not (valid? (with-dashcards (vec (reverse (:dashcards attrs))))))))
  (testing "a dashboard card with an entry at its default does not fit"
    (doseq [[k v] [[:parameter_mappings []] [:visualization_settings {}] [:series []] [:inline_parameters []]]]
      (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [2 k] v)))) (str k))))
  (testing "parameter mappings out of the order of their parameter ids do not fit"
    (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [2 :parameter_mappings]
                                               [{:parameter_id "zz"} {:parameter_id "aa"}]))))))
  (testing "a dashboard card needs its position and size, and has no other entry"
    (doseq [k [:row :col :size_x :size_y :id]]
      (is (not (valid? (with-dashcards (update (:dashcards attrs) 2 dissoc k)))) (str k)))
    (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [2 :entity_id] card-3)))))
    (is (not (valid? (with-dashcards (assoc-in (:dashcards attrs) [2 :dashboard_id] 7)))))))

(deftest layout-test
  (testing "a dashboard is the file `<name>.dashboard.yaml` in the directory of its collection"
    (let [dashboards {:kind :collection :name "Dashboards" :place nil :refs #{} :attrs {:type "library"}}]
      (is (= {collection-id "library/_collection.yaml"
              dashboard-id  "library/revenue_overview.dashboard.yaml"}
             (layout/layout kinds/codecs {collection-id dashboards dashboard-id (item)}))))))

(deftest out-of-scope-card-test
  (testing "a dashboard card that names a question outside the snapshot is a reference that does not close, and only
            that one is reported"
    (let [question-id "qUeStIoNoUtSiDe000001"
          a           {:dashcards [{:id card-1 :card_id question-id :row 0 :col 0 :size_x 4 :size_y 4}]}]
      (is (= [{:rule :refs-closed :id dashboard-id :ref [:card question-id]}]
             (validate/validate {dashboard-id (assoc (item a) :place nil)})))))
  (testing "an action button whose action is not in the snapshot is a reference that does not close"
    (let [a {:dashcards [{:id card-3 :action_id action-id :row 0 :col 0 :size_x 4 :size_y 2}]}]
      (is (= [{:rule :refs-closed :id dashboard-id :ref [:action action-id]}]
             (validate/validate {dashboard-id (assoc (item a) :place nil)})))))
  (testing "a click behavior that links to a collection as a dashboard is a reference of the wrong kind"
    (let [a {:dashcards [{:id card-1 :row 0 :col 0 :size_x 4 :size_y 4
                          :visualization_settings {:click_behavior {:type     "link" :linkType "dashboard"
                                                                    :targetId collection-id}}}]}]
      (is (= [{:rule :ref-kind :id dashboard-id :ref [:dashboard collection-id]}]
             (validate/validate {collection-id {:kind :collection :name "Dashboards" :place nil :refs #{}
                                                :attrs {:type "library-dashboards"}}
                                 dashboard-id  (item a)}))))))

;;; ------------------------------------------------- Reference cycles ------------------------------------------------

(def ^:private question-id "qUeStIoNoNtHeDaShBd01")

(defn- question
  "A question of the dashboard, in the collection."
  []
  (let [a {:display      "table"
           :query        {:lib/type "mbql/query"
                          :database sd
                          :stages   [{:lib/type "mbql.stage/mbql" :source-table [sd "PUBLIC" "ORDERS"]}]}
           :dashboard_id dashboard-id}]
    {:kind :question :name "Orders" :place collection-id :refs (kinds/refs :question question-id a) :attrs a}))

(deftest cycle-with-a-question-test
  (testing "a new dashboard and a new question of it form a reference cycle; a question has no stub, so the plan writes
            the dashboard first without its cards, then the question, then the dashboard's cards"
    (let [coll {:kind :collection :name "Dashboards" :place nil :refs #{} :attrs {:type "library-dashboards"}}
          d    (item {:dashcards [{:id card-1 :card_id question-id :row 0 :col 0 :size_x 4 :size_y 4}]})
          l    {collection-id coll}
          m    {collection-id coll dashboard-id d question-id (question)}]
      (is (= [[dashboard-id :write #{[:card question-id]}]
              [question-id :write nil]
              [dashboard-id :link #{[:card question-id]}]]
             (mapv (fn [{:keys [id write defer link]}] [id (if write :write :link) (or defer link)])
                   (plan/plan l m l))))))
  (testing "in a cycle of two dashboards that link to each other, each defers its link"
    (let [link   (fn [target] {:dashcards [{:id card-2 :row 0 :col 0 :size_x 4 :size_y 4
                                            :visualization_settings {:click_behavior {:type "link" :linkType "dashboard"
                                                                                      :targetId target}}}]})
          d1     (assoc (item (link other-dashboard-id)) :place nil)
          d2     (assoc (item (link dashboard-id)) :place nil)
          steps  (plan/plan {} {dashboard-id d1 other-dashboard-id d2} {})]
      (is (= #{[dashboard-id #{[:dashboard other-dashboard-id]}] [other-dashboard-id #{[:dashboard dashboard-id]}]}
             (set (keep (fn [{:keys [id defer]}] (when defer [id defer])) steps)))))))

;;; ------------------------------------------- The serdes walk of master ---------------------------------------------

(def ^:private role-models
  "The serdes model of the target of each role of an item reference."
  {:card "Card" :dashboard "Dashboard" :action "Action" :collection "Collection" :timeline "Timeline"
   :snippet "NativeQuerySnippet"})

(defn- serdes-settings
  "Visualization settings in the form that the serdes walk of master reads: column settings keys are strings."
  [settings]
  (cond-> settings
    (map? (:column_settings settings)) (update :column_settings update-keys #(subs (str %) 1))))

(defn- ingested
  "The dashboard of the attributes `a` in the form that a serdes load of master reads, with no collection."
  [a]
  {:serdes/meta [{:model "Dashboard" :id dashboard-id}]
   :parameters  (:parameters a)
   :dashcards   (for [dc (:dashcards a)]
                  (-> dc
                      (update :visualization_settings serdes-settings)
                      (assoc :series (mapv (fn [id] {:card_id id}) (:series dc)))))})

(defn- serdes-targets
  "`#{[model id]}`: the items that master's serdes load of the dashboard of `a` depends on."
  [a]
  (into #{} (map (fn [path] ((juxt :model :id) (peek path)))) (serdes/deserialization-dependencies (ingested a))))

(defn- ref-targets
  [refs]
  (into #{} (keep (fn [[role target]] (when-let [m (get role-models role)] [m target]))) refs))

(defspec refs-contain-the-serdes-walk-test 300
  (prop/for-all [a kinds.tu/dashboard-attrs-gen]
    (every? (ref-targets (kinds/refs :dashboard dashboard-id a)) (serdes-targets a))))

(deftest serdes-walk-coverage-test
  (testing "the generated dashboards make the serdes walk follow each kind of reference"
    (let [models (into #{} (comp (mapcat serdes-targets) (map first)) (gen/sample kinds.tu/dashboard-attrs-gen 300))]
      (is (= #{"Card" "Action" "Dashboard" "Collection" "Timeline"} models)))))

(defspec generated-dashboards-fit-test 200
  (prop/for-all [a kinds.tu/dashboard-attrs-gen]
    (valid? (item a))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :no-card-ref
    :doc    "A dashboard card does not refer to its card, so validate cannot find a card outside the Library."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(conj [:card card_id]) 'identity]]}
   {:name   :no-action-ref
    :doc    "An action button does not refer to its action, so a push exports a dashboard whose action is out of
            scope."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(conj [:action action_id]) 'identity]]}
   {:name   :no-series-refs
    :doc    "The other series of a dashboard card are not references."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(when (sequential? series) series) nil]]}
   {:name   :no-mapping-refs
    :doc    "The parameter mappings of a dashboard card are not read."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(portable/refs parameter_mappings) #{}]]}
   {:name   :no-settings-refs
    :doc    "The visualization settings of a dashboard card are not read, so a click behavior is no reference."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(visualization/refs visualization_settings) #{}]]}
   {:name   :no-visualizer-refs
    :doc    "The cards that the visualizer names by text are not references."
    :target `dashboard/dashcard-refs
    :edits  [[:replace '(visualizer-refs visualization_settings) #{}]]}
   {:name   :no-parameter-refs
    :doc    "The values source of a dashboard parameter is not a reference."
    :target `dashboard/refs
    :edits  [[:replace '(portable/refs parameters) #{}]]}
   {:name   :no-order
    :doc    "Decode keeps the order of the dashboard cards of the file, so one dashboard has two files."
    :target `dashboard/decode-attrs
    :edits  [[:replace '(dashcard-order (get attrs :tabs []) (mapv normal-dashcard dcs)) '(mapv normal-dashcard dcs)]]}
   {:name   :entry-defaults-kept
    :doc    "Decode keeps an entry of a dashboard card at its default, so one dashboard has two forms."
    :target `dashboard/decode-attrs
    :edits  [[:replace '(mapv normal-dashcard dcs) 'dcs]]}
   {:name   :mappings-unsorted
    :doc    "The parameter mappings of a dashboard card keep the order of the file, which the serdes export of master
            does not keep, so a repository in the old format shows a change that no person made."
    :target `dashboard/normal-dashcard
    :edits  [[:replace '(update :parameter_mappings mapping-order) 'identity]]}
   {:name   :tab-index-ignored
    :doc    "The order of the dashboard cards does not follow the order of the tabs."
    :target `dashboard/sort-key
    :edits  [[:replace '(get tab-index dashboard_tab_id -1) 0]]}
   {:name   :any-tab
    :doc    "A dashboard card can be on a tab that the dashboard does not have."
    :target `dashboard/tabs-fit?
    :edits  [[:replace '(contains? tab-ids (:dashboard_tab_id %)) true]]}
   {:name   :duplicate-dashcards
    :doc    "Two dashboard cards can have one id, so a write cannot tell them apart."
    :target `dashboard/tabs-fit?
    :edits  [[:replace '(distinct-ids? dashcards) true]]}])

(def ^:private plan-mutations
  [{:name   :no-stub-first
    :doc    "In a reference cycle of a dashboard and its question, the question leaves out its dashboard too, so the
            apply must write a stub of a question, which no kind store has."
    :target `plan/cyclic-refs
    :edits  [[:replace '(contains? stub-kinds (:kind (get m id))) false]]}])

(deftest dashboard-mutations-test
  (mut/check mutations {:tests [#'refs-test #'decode-normalizes-test #'structure-test]})
  (mut/check plan-mutations {:tests [#'cycle-with-a-question-test]}))
