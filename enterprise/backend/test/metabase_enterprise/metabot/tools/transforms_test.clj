(ns metabase-enterprise.metabot.tools.transforms-test
  "Tests for EE-only tool wrappers in
  `metabase-enterprise.metabot.tools.transforms`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms :as ee-transforms]
   [metabase-enterprise.metabot.tools.transforms.write :as transforms-write]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(deftest get-transform-python-library-details-non-agent-error-test
  (testing "EE get_transform_python_library_details still emits :entity-usage when the underlying call throws a non-agent error"
    (when (premium-features/has-feature? :transforms-python)
      (mt/with-dynamic-fn-redefs [transforms-write/get-transform-python-library-details
                                  (fn [_] (throw (ex-info "Not found." {:status-code 404})))]
        (let [result (ee-transforms/get-transform-python-library-details-tool {:path "missing"})
              eu     (get-in result [:structured-output :entity-usage])]
          (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
          (is (= {:input  [{:type "transform" :id "missing"}]
                  :output []}
                 eu))
          (is (str/includes? (:output result) "Not found.")))))))
