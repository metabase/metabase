(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.job-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.schedule :as transforms.schedule]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase.driver :as driver]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest python-transform-scheduled-job-test
  (mt/test-helpers-set-global-values!
    (mt/with-temp-scheduler!
      (task/init! ::transforms.schedule/RunTransform)
      (mt/test-drivers #{:postgres}
        (mt/with-premium-features #{:transforms-python :transforms}
          (mt/dataset transforms-dataset/transforms-test
            (transforms.tu/with-transform-cleanup! [target {:type   "table"
                                                            :schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                                                            :name   "target_table"}]
              (mt/with-temp
                [:model/TransformTag {tag-id :id}       {:name "every second"}
                 :model/Transform    {transform-id :id} {:name   "Gadget Products"
                                                         :source {:type  "python"
                                                                  :source-database (mt/id)
                                                                  :source-tables {"transforms_customers" (mt/id :transforms_customers)}
                                                                  :body  (str "import pandas as pd\n"
                                                                              "\n"
                                                                              "def transform():\n"
                                                                              "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                                         :target  (assoc target :database (mt/id))}
                 :model/TransformTransformTag   _  {:transform_id transform-id :tag_id tag-id :position 0}
                 :model/TransformJob {job-id :id :as job} {:schedule "* * * * * ? *"}
                 :model/TransformJobTransformTag _ {:job_id job-id :tag_id tag-id :position 0}]
                (transforms.schedule/initialize-job! job)
                (transforms.schedule/update-job! job-id "* * * * * ? *")
                (is (true? (u/poll {:thunk   (fn [] (driver/table-exists? driver/*driver* (mt/db) target))
                                    :done?   true?
                                    :timeout-ms 20000
                                    :interval-ms 1000})))
                (is (true? (u/poll {:thunk   (fn [] (t2/exists? :model/Table :name (:name target)))
                                    :done?   true?
                                    :timeout-ms 10000
                                    :interval-ms 1000})))))))))))
