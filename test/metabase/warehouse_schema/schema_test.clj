(ns metabase.warehouse-schema.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(deftest dimension-type-test
  (testing "a Dimension is internal or external, as a keyword or a string"
    (is (= {:type :internal} (lib/normalize ::warehouse-schema.schema/dimension.update {:type "internal"})))
    (is (not (mr/validate ::warehouse-schema.schema/dimension.update {:type :http})))))

(deftest external-dimension-needs-field-test
  (let [bad {:type "external", :name "Remapped", :human_readable_field_id nil}]
    (testing "an external Dimension without a human-readable Field is a 400"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require a human readable field id"
                            (lib/normalize ::warehouse-schema.schema/dimension bad {:throw? true}))))
    (testing "so is a serialized one"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require a human readable field id"
                            (lib/normalize ::warehouse-schema.schema/external-dimension bad {:throw? true}))))
    (testing "an external Dimension with its Field, or a body without one of the two columns, passes"
      (is (= {:type :external, :human_readable_field_id 1}
             (lib/normalize ::warehouse-schema.schema/dimension.update
                            {:type "external", :human_readable_field_id 1} {:throw? true})))
      (is (= {:human_readable_field_id nil}
             (lib/normalize ::warehouse-schema.schema/dimension.update
                            {:human_readable_field_id nil} {:throw? true})))
      (is (= {:type :external}
             (lib/normalize ::warehouse-schema.schema/dimension.update {:type "external"} {:throw? true}))))))
