(ns metabase.api.macros.defendpoint.open-api-test
  "See additional tests in [[metabase.api.open-api-test]]."
  (:require
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api.macros.defendpoint.open-api :as defendpoint.open-api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(deftest ^:parallel json-schema-conversion
  (testing ":maybe turns into optionality"
    (is (= {:type       :object
            :required   []
            :properties {"name" {:type :string}}}
           (#'defendpoint.open-api/fix-json-schema
            (mjs/transform [:map [:name [:maybe string?]]]))))))

(deftest ^:parallel json-schema-conversion-2
  (testing ":json-schema basically works (see definition of :metabase.lib.schema.common/non-blank-string)"
    (is (=? {:$ref        "#/definitions/metabase.lib.schema.common.non-blank-string"
             :definitions {"metabase.lib.schema.common.non-blank-string" {:type "string", :minLength 1}}}
            (mjs/transform ::lib.schema.common/non-blank-string)))))

(mr/def ::non-blank-string
  "Non-blank string."
  ::lib.schema.common/non-blank-string)

(deftest ^:parallel json-schema-conversion-2b
  (testing ":json-schema basically works (nested ref)"
    (is (=? {:$ref "#/definitions/metabase.api.macros.defendpoint.open-api-test.non-blank-string",
             :definitions {"metabase.api.macros.defendpoint.open-api-test.non-blank-string"
                           {:description "Non-blank string."
                            :$ref "#/definitions/metabase.lib.schema.common.non-blank-string"}

                           "metabase.lib.schema.common.non-blank-string"
                           {:type "string", :minLength 1}}}
            (mjs/transform ::non-blank-string)))))

(deftest ^:parallel json-schema-conversion-3
  (testing "maps-with-unique-key do not generate weirdness"
    (is (=? {:description string?
             :type        :array
             :items       {:type       :object
                           :required   ["id"]
                           :properties {"id" {:type :integer}}}}
            (#'defendpoint.open-api/fix-json-schema
             (mjs/transform (ms/maps-with-unique-key [:sequential [:map [:id :int]]] :id)))))))

(deftest ^:parallel json-schema-conversion-4
  (testing "nested data structures are still fixed up"
    (is (=? {:type  :array
             :items {:type       :object
                     :properties {"params" {:type :array
                                            :items {:type :string}}}}}
            (#'defendpoint.open-api/fix-json-schema
             (mjs/transform [:sequential [:map
                                          [:params {:optional true} [:maybe [:sequential :string]]]]]))))))

(deftest ^:parallel collect-definitions-test
  (binding [defendpoint.open-api/*definitions* (atom [])]
    (is (=? {:properties {:value {:$ref "#/components/schemas/metabase.lib.schema.common.non-blank-string"}}}
            (#'defendpoint.open-api/mjs-collect-definitions [:map [:value ::lib.schema.common/non-blank-string]])))
    (is (= [{"metabase.lib.schema.common.non-blank-string" {:type :string, :minLength 1}}]
           @@#'defendpoint.open-api/*definitions*))))
