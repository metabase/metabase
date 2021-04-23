(ns metabase.shared.models.visualization-settings-test
  (:require [clojure.test :as t]
            #?(:cljs [goog.string :as gstring])
            [metabase.shared.models.visualization-settings :as mb.viz]))

(def fmt #?(:clj format :cljs gstring/format))

(t/deftest parse-column-ref-strings-test
  (t/testing "Column ref strings are parsed correctly"
    (let [f-qual-nm "/databases/MY_DB/tables/MY_TBL/fields/COL1"
          f-id      42]
      (doseq [[input-str expected] [[(fmt "[\"ref\",[\"field\",%d,null]]" f-id) {::mb.viz/field-id f-id}]
                                    [(fmt "[\"ref\",[\"field\",\"%s\",null]]" f-qual-nm)
                                     {::mb.viz/field-qualified-name f-qual-nm}]]]
        (t/is (= expected (mb.viz/parse-column-ref input-str)))))))

(t/deftest form-conversion-test
  (t/testing ":visualization_settings are correctly converted from DB to qualified form and back"
    (let [f-id                42
          target-id           19
          db-click-behavior   {:type             "link"
                               :linkType         "question"
                               :parameterMapping {}
                               :targetId         target-id}
          db-col-settings     {(fmt "[\"ref\",[\"field\",%d,null]]" f-id) {:click_behavior db-click-behavior}}
          db-viz-settings     {:column_settings db-col-settings}
          norm-click-behavior {::mb.viz/click-behavior-type    ::mb.viz/link
                               ::mb.viz/link-type              ::mb.viz/card
                               ::mb.viz/link-parameter-mapping {}
                               ::mb.viz/link-target-id         target-id}
          norm-col-settings   {(mb.viz/column-ref-for-id f-id) {::mb.viz/click-behavior norm-click-behavior}}
          norm-viz-settings   {::mb.viz/column-settings norm-col-settings}]
      (doseq [[db-form norm-form] [[db-viz-settings norm-viz-settings]]]
        (let [to-norm (mb.viz/from-db-form db-form)]
          (t/is (= norm-form to-norm))
          (let [to-db (mb.viz/db-form to-norm)]
            (t/is (= db-form to-db))))))))

