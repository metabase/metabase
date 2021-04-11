(ns metabase.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require [clojure.test :refer :all]
            [metabase.sync.analyze.classifiers.name :as name]))

(deftest semantic-type-for-name-and-base-type-test
  (doseq [[input expected] {["id"      :type/Integer] :type/PK
                            ;; other pattern matches based on type/regex (remember, base_type matters in matching!)
                            ["rating"  :type/Integer] :type/Score
                            ["rating"  :type/Boolean] nil
                            ["country" :type/Text]    :type/Country
                            ["country" :type/Integer] nil}]
    (testing (pr-str (cons 'semantic-type-for-name-and-base-type input))
      (is (= expected
             (apply #'name/semantic-type-for-name-and-base-type input))))))
