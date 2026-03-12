(ns metabase.warehouses.provider-detection-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase.warehouses.provider-detection :as provider-detection]))

(deftest detects-from-strings
  (let [raw-yaml "
providers:
- {name: Foo™, pattern: foo\\.hosted\\.com$}
- {name: Hosty®, pattern: (hosty\\.hosted.com|\\.hosted\\.by\\.hosted)$}"
        providers (:providers (yaml/parse-string raw-yaml))]
    (doseq [[expected host] [["Foo™" "random.23423.foo.hosted.com"]
                             ;; ensure the escaped periods are not interpreted as wildcards
                             [nil "random.23423.foo†hosted†com"]
                             ["Hosty®" "random.2342342.hosty.hosted.com"]
                             ["Hosty®" "random.hosted.by.hosted"]
                             [nil "not.gonna.match.com"]]]
      (is (= expected (#'provider-detection/detect-provider host providers))))))

(deftest detect-provider-from-database-test
  (testing "database with unsupported engine returns nil"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"} :engine :mysql}]
      (is (nil? (provider-detection/detect-provider-from-database database)))))

  (testing "database without host returns nil"
    (let [database {:details {} :engine :postgres}]
      (is (nil? (provider-detection/detect-provider-from-database database))))))
