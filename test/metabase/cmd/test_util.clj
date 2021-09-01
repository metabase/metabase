(ns metabase.cmd.test-util
  (:require [metabase.util.files :as files]))

(def fixture-db-file-path
  (delay
    (let [original-file "frontend/test/__runner__/test_db_fixture.db.mv.db"]
      (files/copy-file! (files/get-path original-file) (files/get-path (System/getProperty "java.io.tmpdir") "test_db_fixture.db.mv.db"))
      (str (files/get-path (System/getProperty "java.io.tmpdir") "test_db_fixture.db")))))
