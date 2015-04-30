(ns metabase.test.data.h2
  (:require [metabase.test.data.interface :refer :all]))

(deftype H2TestData []
  TestData
  (load! [_])
  (db-name [_]
    "Test Database")
  (connection-str [_]
    (let [filename (format "%s/target/test-data" (System/getProperty "user.dir"))]
      (format "file:%s;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1" filename))))
