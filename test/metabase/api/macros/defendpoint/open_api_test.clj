(ns metabase.api.macros.defendpoint.open-api-test
  "See additional tests in [[metabase.api.open-api-test]]."
  (:require
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api.macros.defendpoint.open-api :as defendpoint.open-api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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

(deftest ^:parallel collect-definitions-test
  (binding [defendpoint.open-api/*definitions* (atom [])]
    (is (=? {:properties {:value {:$ref "#/components/schemas/metabase.lib.schema.common.non-blank-string"}}}
            (#'defendpoint.open-api/mjs-collect-definitions [:map [:value ::lib.schema.common/non-blank-string]])))
    (is (= [{"metabase.lib.schema.common.non-blank-string" {:type :string, :minLength 1}}]
           @@#'defendpoint.open-api/*definitions*))))

(deftest ^:parallel deprecated-endpoint-test
  (testing "Deprecated metadata is included in OpenAPI spec"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :get
                  :route {:path "/test"}
                  :docstr "A deprecated endpoint."
                  :metadata {:deprecated "0.57.0"}
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/test" form)]
        (is (true? (:deprecated result)))
        (is (= "GET /api/test" (:summary result))))))

  (testing "Non-deprecated endpoints do not have deprecated field"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :get
                  :route {:path "/test"}
                  :docstr "A normal endpoint."
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/test" form)]
        (is (nil? (:deprecated result)))
        (is (= "A normal endpoint." (:description result))))))

  (testing "Deprecated with multipart metadata"
    (binding [defendpoint.open-api/*definitions* (atom (sorted-map))]
      (let [form {:method :post
                  :route {:path "/upload"}
                  :docstr "A deprecated upload endpoint."
                  :metadata {:deprecated true :multipart true}
                  :params {}
                  :body []}
            result (#'defendpoint.open-api/path-item "/api/upload" form)]
        (is (true? (:deprecated result)))))))
