(ns metabase-enterprise.metabot.tools.transforms.write-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms.write :as transforms-write]
   [metabase.metabot.tools.transforms.write :as oss-transforms-write]
   [metabase.test :as mt]))

(deftest create-fresh-python-template-test
  (testing "fresh Python transforms include common import"
    (let [result (oss-transforms-write/create-fresh-transform
                  :python "Python Transform" nil 1 nil)]
      (is (= "import common\nimport pandas as pd\n\ndef transform():\n    # Your transformation logic here\n    return pd.DataFrame([{\"message\": \"Hello from Python transform!\"}])\n"
             (get-in result [:source :body]))))))

(deftest create-fresh-python-transform-test
  (testing "creates fresh Python transform"
    (let [memory-atom (atom {:state {}})
          result (transforms-write/write-transform-python
                  {:edit_action {:mode "replace"
                                 :new_content "def transform():\n    return pd.DataFrame()"}
                   :transform_name "Python Transform"
                   :source_database (mt/id)
                   :source_tables [{:alias "t" :table_id 1 :schema "PUBLIC" :database_id 1}]
                   :memory-atom memory-atom})]
      (is (= "Python Transform" (get-in result [:structured-output :transform :name])))
      (is (= "python" (get-in result [:structured-output :transform :source :type]))))))
