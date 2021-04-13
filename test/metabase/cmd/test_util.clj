(ns metabase.cmd.test-util
  (:require [metabase.util.files :as files]))

(def fixture-db-file-path
  (delay
    (let [original-file "frontend/test/__runner__/test_db_fixture.db.mv.db"]
      (files/copy-file! (files/get-path original-file) (files/get-path "/tmp/test_db_fixture.db.mv.db"))
      "/tmp/test_db_fixture.db")))
