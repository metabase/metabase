(ns metabase.shared.models.visualization-settings-test
  "Tests for the shared visualization-settings namespace functions"
  #?@
   (:clj
    [(:require
      [clojure.spec.test.alpha :as stest]
      [clojure.test :as t]
      [clojure.walk :as walk]
      [metabase.shared.models.visualization-settings :as mb.viz])]
    :cljs
    [(:require
      [clojure.spec.test.alpha :as stest]
      [clojure.test :as t]
      [clojure.walk :as walk]
      [goog.string :as gstring]
      [metabase.shared.models.visualization-settings :as mb.viz])]))

(def all-instrument-fns
  [`mb.viz/field-id->column-ref
   `mb.viz/column-name->column-ref
   `mb.viz/field-str->column-ref
   `mb.viz/keyname
   `mb.viz/parse-json-string
   `mb.viz/encode-json-string
   `mb.viz/parse-db-column-ref
   `mb.viz/with-col-settings
   `mb.viz/crossfilter-click-action
   `mb.viz/url-click-action
   `mb.viz/entity-click-action
   `mb.viz/with-click-action
   `mb.viz/with-entity-click-action
   `mb.viz/fk-parameter-mapping])

(defn with-spec-instrumentation-fixture
  "`clojure.test` fixture that turns on instrumentation of all specs in the viz settings namespace, then turns it off."
  [f]
  (stest/instrument `all-instrument-fns)
  (f)
  (stest/unstrument `all-instrument-fns))

(def fmt #?(:clj format :cljs gstring/format))

(t/use-fixtures :once with-spec-instrumentation-fixture)

(t/deftest parse-column-ref-strings-test
  (t/testing "Column ref strings are parsed correctly"
    (let [f-qual-nm "/databases/MY_DB/tables/MY_TBL/fields/COL1"
          f-id      42
          col-nm    "Year"
          expn-nm   "Calculated Column"]
      (doseq [[input-str expected] [[(fmt "[\"ref\",[\"field\",%d,null]]" f-id) {::mb.viz/field-id f-id}]
                                    [(fmt "[\"ref\",[\"field\",\"%s\",null]]" f-qual-nm)
                                     {::mb.viz/field-str f-qual-nm}]
                                    [(fmt "[\"name\",\"Year\"]" col-nm)
                                     {::mb.viz/column-name col-nm}]
                                    [(fmt "[\"ref\",[\"expression\",\"%s\"]]" expn-nm)
                                     {::mb.viz/column-name expn-nm}]]]
        (t/is (= expected (mb.viz/parse-db-column-ref input-str)))))))

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
          col-nm-map          {:show_mini_bar true
                               :column_title "Name Column"}
          db-col-settings     {(fmt "[\"ref\",[\"field\",%d,{\"base-type\":\"type/Integer\"}]]" f-id) db-click-bhv-map
                               (fmt "[\"name\",\"%s\"]" col-name)                                     col-nm-map}
          db-viz-settings     {:column_settings db-col-settings
                               :table.columns   [{:name     "ID"
                                                  :fieldRef [:field f-id nil]
                                                  :enabled  true}
                                                 {:name     "Name"
                                                  :fieldRef [:expression col-name]
                                                  :enabled  true}]}
          norm-click-behavior {::mb.viz/click-behavior-type ::mb.viz/link
                               ::mb.viz/link-type           ::mb.viz/card
                               ::mb.viz/parameter-mapping   {}
                               ::mb.viz/link-target-id      target-id}
          norm-col-nm         {::mb.viz/column-title  "Name Column"
                               ::mb.viz/show-mini-bar true}
          norm-click-bhvr-map {::mb.viz/click-behavior norm-click-behavior}
          norm-col-settings   {(mb.viz/field-id->column-ref f-id {"base-type" "type/Integer"}) norm-click-bhvr-map
                               (mb.viz/column-name->column-ref col-name)                       norm-col-nm}
          norm-viz-settings   {::mb.viz/column-settings norm-col-settings
                               ::mb.viz/table-columns [{::mb.viz/table-column-name      "ID"
                                                        ::mb.viz/table-column-field-ref [:field f-id nil]
                                                        ::mb.viz/table-column-enabled   true}
                                                       {::mb.viz/table-column-name      "Name"
                                                        ::mb.viz/table-column-field-ref [:expression col-name]
                                                        ::mb.viz/table-column-enabled   true}]}]
      (doseq [[db-form norm-form] [[db-viz-settings norm-viz-settings]]]
        (let [to-norm (mb.viz/db->norm db-form)]
          (t/is (= norm-form to-norm))
          (let [to-db (mb.viz/norm->db to-norm)]
            (t/is (= db-form to-db)))))
      ;; for a non-table card, the :click_behavior map is directly underneath :visualization_settings
      (t/is (= norm-click-bhvr-map (mb.viz/db->norm db-click-bhv-map))))))

(t/deftest form-transformation-test
  (t/testing "The deprecated k:mm :time_style is converted to HH:mm when normalized, and kept in the new style when converted back to the DB form"
    (let [db-col-settings-old {:column_settings {"[\"name\",\"Column Name\"]" {:time_style "k:mm"}}}
          db-col-settings-new {:column_settings {"[\"name\",\"Column Name\"]" {:time_style "HH:mm"}}}
          norm-col-settings   {::mb.viz/column-settings {{::mb.viz/column-name "Column Name"} {::mb.viz/time-style "HH:mm"}}}]
      (t/is (= norm-col-settings (mb.viz/db->norm db-col-settings-old)))
      (t/is (= db-col-settings-new (mb.viz/norm->db norm-col-settings)))))

  (t/testing "Invalid column refs are dropped when viz settings are normalized (#18972)"
    (t/is (= {::mb.viz/column-settings {}}
             (mb.viz/db->norm {:column_settings {"[\"ref\",null]" {:column_title "invalid"}}})))
    (t/is (= {::mb.viz/column-settings {}}
             (mb.viz/db->norm {:column_settings {"bad-column-ref" {:column_title "invalid"}}})))))

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
                           mb.viz/db->norm
                           mb.viz/norm->db))))))

(t/deftest parameter-mapping-test
  (t/testing "parameterMappings are handled correctly"
    (let [from-id    101
          to-id      294
          card-id    19852
          mapping-id (fmt "[\"dimension\",[\"fk->\",[\"field\",%d,null],[\"field\",%d,null]]]" from-id to-id)
          norm-id    [:dimension [:fk-> [:field from-id nil] [:field to-id nil]]]
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
          vs-norm     (mb.viz/db->norm vs-db)]
      (t/is (= exp-norm vs-norm))
      (t/is (= vs-db (mb.viz/norm->db vs-norm))))))

(defn- all-keywords [m]
  (let [all-kws (atom #{})]
    (walk/postwalk (fn [v] (when (keyword? v) (swap! all-kws #(conj % v)))) m)
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
          norm-form (mb.viz/db->norm db-form)
          to-db     (mb.viz/norm->db norm-form)]
      ;; make sure all keywords have the right namespace in normalized form (except the one param mapping key)
      (t/is (= [:447496ef]
               (filter #(not= (namespace %) (namespace ::mb.viz/column-settings)) (all-keywords norm-form))))
      ;; make sure all keywords have the right namespace in normalized form
      (t/is (empty? (filter #(some? (namespace %)) (all-keywords to-db))))
      (t/is (= db-form to-db)))))
