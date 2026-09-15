(ns metabase.api.docs-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.docs :as api.docs]
   [metabase.api.open-api :as open-api]
   [metabase.test :as mt]))

(deftest write-openapi-spec-to-file-propagates-errors-test
  (mt/with-temp-dir [directory "openapi-output"]
    (with-redefs [api.docs/openapi-file-path directory
                  api.docs/open-api-object  (constantly {})]
      (is (thrown? java.io.IOException
                   (api.docs/write-openapi-spec-to-file! identity))))))

(deftest public-openapi-document-test
  (let [ref (fn [name] {:$ref (str "#/components/schemas/" name)})
        spec {:paths {"/api/item" (ref "Public")
                      "/api/device" {}
                      "/api/dev" (ref "Dev")
                      "/api/testing/item" (ref "Testing")}
              :components {:schemas {"Public" {:properties {:child (ref "Child")}}
                                     "Child" {:properties {:parent (ref "Public")}}
                                     "Dev" {}
                                     "Testing" {}
                                     "Unused" {}}}}]
    (with-redefs [open-api/root-open-api-object (constantly spec)]
      (let [result (api.docs/open-api-object identity)]
        (is (= #{"/api/item" "/api/device"} (set (keys (:paths result)))))
        (is (= #{"Public" "Child"} (set (keys (get-in result [:components :schemas])))))
        (is (= [{:url "" :description "Metabase API"}] (:servers result)))))))

(deftest property-named-ref-test
  (testing "a property named `$ref` holding a schema is not treated as a reference"
    (let [ref  (fn [name] {:$ref (str "#/components/schemas/" name)})
          spec {:paths      {"/api/group" (ref "Group")}
                :components {:schemas {"Group"  {:properties {:$ref {:type "string"}
                                                              :member (ref "Member")}}
                                       "Member" {}
                                       "Unused" {}}}}]
      (with-redefs [open-api/root-open-api-object (constantly spec)]
        (is (= #{"Group" "Member"}
               (set (keys (get-in (api.docs/open-api-object identity) [:components :schemas])))))))))
