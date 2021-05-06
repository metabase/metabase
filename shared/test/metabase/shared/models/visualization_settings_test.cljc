(ns metabase.shared.models.visualization-settings-test
  "Tests for the shared visualization-settings namespace functions"
  #?@
      (:clj
       [(:require [clojure.test :as t]
                  [clojure.walk :as walk]
                  [metabase.shared.models.visualization-settings :as mb.viz])]
       :cljs
       [(:require [clojure.test :as t]
                  [clojure.walk :as walk]
                  [goog.string :as gstring]
                  [metabase.shared.models.visualization-settings :as mb.viz])]))

(def fmt #?(:clj format :cljs gstring/format))

(t/deftest parse-column-ref-strings-test
  (t/testing "Column ref strings are parsed correctly"
    (let [f-qual-nm "/databases/MY_DB/tables/MY_TBL/fields/COL1"
          f-id      42
          col-nm    "Year"]
      (doseq [[input-str expected] [[(fmt "[\"ref\",[\"field\",%d,null]]" f-id) {::mb.viz/field-id f-id}]
                                    [(fmt "[\"ref\",[\"field\",\"%s\",null]]" f-qual-nm)
                                     {::mb.viz/field-qualified-name f-qual-nm}]
                                    [(fmt "[\"name\",\"Year\"]" col-nm)
                                     {::mb.viz/column-name col-nm}]]]
        (t/is (= expected (mb.viz/parse-column-ref input-str)))))))

(t/deftest form-conversion-test
  (t/testing ":visualization_settings are correctly converted from DB to qualified form and back"
    (let [f-id                42
          target-id           19
          col-name            "My Column"
          db-click-behavior   {:type             "link"
                               :linkType         "question"
                               :parameterMapping {}
                               :targetId         target-id}
          db-click-bhv-map    {:click_behavior db-click-behavior}
          db-col-settings     {(fmt "[\"ref\",[\"field\",%d,null]]" f-id) db-click-bhv-map
                               (fmt "[\"name\",\"%s\"]" col-name)         db-click-bhv-map}
          db-viz-settings     {:column_settings db-col-settings}
          norm-click-behavior {::mb.viz/click-behavior-type ::mb.viz/link
                               ::mb.viz/link-type           ::mb.viz/card
                               ::mb.viz/parameter-mapping   {}
                               ::mb.viz/link-target-id      target-id}
          norm-click-bhvr-map {::mb.viz/click-behavior norm-click-behavior}
          norm-col-settings   {(mb.viz/column-ref-for-id f-id) norm-click-bhvr-map
                               (mb.viz/column-ref-for-column-name col-name) norm-click-bhvr-map}
          norm-viz-settings   {::mb.viz/column-settings norm-col-settings}]
      (doseq [[db-form norm-form] [[db-viz-settings norm-viz-settings]]]
        (let [to-norm (mb.viz/from-db-form db-form)]
          (t/is (= norm-form to-norm))
          (let [to-db (mb.viz/db-form to-norm)]
            (t/is (= db-form to-db)))))
      ;; for a non-table card, the :click_behavior map is directly underneath :visualization_settings
      (t/is (= norm-click-bhvr-map (mb.viz/from-db-form db-click-bhv-map))))))

(t/deftest virtual-card-test
  (t/testing "Virtual card in visualization settings is preserved through normalization roundtrip"
    ;; virtual cards have the form of a regular card, mostly
    (let [db-form {:virtual_card {:archived false
                                  ;; the name is nil
                                  :name     nil
                                  ;; there is no dataset_query
                                  :dataset_query {}
                                  ;; display is text
                                  :display "text"
                                  ;; visualization settings also exist here (being a card), but are unused
                                  :visualization_settings {}}
                   ;; this is where the actual text is stored
                   :text        "Stuff in Textbox"}]
      ;; the current viz setting code does not interpret textbox type cards, hence this should be a passthrough
      (t/is (= db-form (-> db-form
                           mb.viz/from-db-form
                           mb.viz/db-form))))))

(t/deftest parameter-mapping-test
  (t/testing "parameterMappings are handled correctly"
    (let [from-id    101
          to-id      294
          card-id    19852
          mapping-id (fmt "[\"dimension\",[\"fk->\",[\"field-id\",%d],[\"field-id\",%d]]]" from-id to-id)
          norm-id    [:dimension [:fk-> [:field-id from-id] [:field-id to-id]]]
          col-key    "[\"name\",\"Some Column\"]"
          norm-key   {::mb.viz/column-name "Some Column"}
          dimension  [:dimension [:field to-id {:source-field from-id}]]
          param-map  {mapping-id {:id     mapping-id
                                  :source {:type "column"
                                           :id   "Category_ID"
                                           :name "Category ID"}
                                  :target {:type      "dimension"
                                           :id        mapping-id
                                           :dimension dimension}}}
          vs-db      {:column_settings {col-key {:click_behavior {:linkType         "question"
                                                                  :type             "link"
                                                                  :linkTextTemplate "Link Text Template"
                                                                  :targetId         card-id
                                                                  :parameterMapping param-map}}}}
          norm-pm    {norm-id #::mb.viz{:param-mapping-id     norm-id
                                        :param-mapping-source #::mb.viz{:param-ref-id "Category_ID"
                                                                        :param-ref-type "column"
                                                                        :param-ref-name "Category ID"}
                                        :param-mapping-target #::mb.viz{:param-ref-id norm-id
                                                                        :param-ref-type "dimension"
                                                                        :param-dimension dimension}}}
          exp-norm   {::mb.viz/column-settings {norm-key {::mb.viz/click-behavior
                                                          #::mb.viz{:click-behavior-type ::mb.viz/link
                                                                    :link-type           ::mb.viz/card
                                                                    :link-text-template  "Link Text Template"
                                                                    :link-target-id      card-id
                                                                    :parameter-mapping   norm-pm}}}}
          vs-norm     (mb.viz/from-db-form vs-db)]
      (t/is (= exp-norm vs-norm))
      (t/is (= vs-db (mb.viz/db-form vs-norm))))))

(defn- all-keywords [m]
  (let [all-kws (atom #{})]
    (walk/postwalk (fn [v] (if (keyword? v) (swap! all-kws #(conj % v)))) m)
    @all-kws))

(t/deftest comprehensive-click-actions-test
  (t/testing "Visualization settings for card in 'EE14566 - Click Behavior visualization_settings' should be handled"
    (let [db-form   {:column_settings
                     {"[\"name\",\"Year\"]"
                      {:click_behavior {:type             "crossfilter",
                                        :parameterMapping {:447496ef {:source {:type "column",
                                                                               :id   "Year",
                                                                               :name "Year"},
                                                                      :target {:type "parameter",
                                                                               :id   "447496ef"},
                                                                      :id     "447496ef"}}}},

                      "[\"name\",\"Question: Plain QB - Orders\"]"
                      {:click_behavior {:type             "link",
                                        :linkType         "question",
                                        :parameterMapping {},
                                        :targetId         1}},

                      "[\"name\",\"Dashboard: EE532\"]"
                      {:click_behavior {:type             "link",
                                        :linkType         "dashboard",
                                        :parameterMapping {},
                                        :targetId         2}},

                      "[\"name\",\"Custom Destination\"]"
                      {:click_behavior {:type         "link",
                                        :linkType     "url",
                                        :linkTemplate "/dashboard/1?year={{column:Year}}"}}}}
          norm-form (mb.viz/from-db-form db-form)
          to-db     (mb.viz/db-form norm-form)]
      ;; make sure all keywords have the right namespace in normalized form (except the one param mapping key)
      (t/is (= [:447496ef]
               (filter #(not= (namespace %) (namespace ::mb.viz/column-settings)) (all-keywords norm-form))))
      ;; make sure all keywords have the right namespace in normalized form
      (t/is (empty? (filter #(some? (namespace %)) (all-keywords to-db))))
      (t/is (= db-form to-db)))))
