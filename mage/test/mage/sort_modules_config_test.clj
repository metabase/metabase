(ns mage.sort-modules-config-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.sort-modules-config :as sort-modules-config]))

(def keep-me "Ensures this namespace is loaded by mage.core-test" :loaded)

(def ^:private unsorted
  "{:metabase/modules
 {zebra
  {:team \"A\"
   :model-imports #{:model/Table
                    :model/Card
                    :model/Database}}

  enterprise/aardvark
  {:team \"B\"
   :model-exports #{:model/Foo :model/Bar}}

  apple
  {:team \"C\"
   :model-imports :bypass}}}
")

(def ^:private sorted
  "{:metabase/modules
 {apple
  {:team \"C\"
   :model-imports :bypass}

  zebra
  {:team \"A\"
   :model-imports #{:model/Card
                    :model/Database
                    :model/Table}}

  enterprise/aardvark
  {:team \"B\"
   :model-exports #{:model/Bar :model/Foo}}}}
")

(deftest sort-string-test
  (testing "sorts module order (enterprise last) and :model-imports/:model-exports sets, leaving :bypass alone"
    (is (= sorted (sort-modules-config/sort-string unsorted))))
  (testing "idempotent"
    (is (= sorted (sort-modules-config/sort-string sorted)))))
