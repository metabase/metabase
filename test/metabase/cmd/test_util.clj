(ns metabase.cmd.test-util
  (:require
   [metabase.util.files :as u.files]))

(set! *warn-on-reflection* true)

(def fixture-db-file-path
  (delay
    (let [original-file "frontend/test/__runner__/test_db_fixture.db.mv.db"]
      (u.files/copy-file! (u.files/get-path original-file) (u.files/get-path (System/getProperty "java.io.tmpdir") "test_db_fixture.db.mv.db"))
      (str (u.files/get-path (System/getProperty "java.io.tmpdir") "test_db_fixture.db")))))
