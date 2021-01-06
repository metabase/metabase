(ns metabase.cmd.dump-to-h2-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.db :as mdb]
            [metabase.db.setup :as mdb.setup]
            [metabase.util.files :as u.files]))

(deftest dump-deletes-target-db-files-tests
  ;; test fails when the application db is anything but H2 presently
  ;; TODO: make this test work with postgres / mysql / mariadb
  (when (= :h2 (mdb/db-type))
    (let [tmp-h2-db     (str (u.files/get-path (System/getProperty "java.io.tmpdir") "mbtest_dump.h2"))
          tmp-h2-db-mv  (str tmp-h2-db ".mv.db")
          file-contents {tmp-h2-db    "Not really an H2 DB"
                         tmp-h2-db-mv "Not really another H2 DB"}]
     ;; keep setup-db!/setup-db!* from changing connection state
      (with-redefs [mdb.setup/setup-db! (constantly nil)]
       (try
         (doseq [[filename contents] file-contents]
           (spit filename contents))
         (dump-to-h2/dump-to-h2! tmp-h2-db)

         (doseq [filename (keys file-contents)]
           (testing (str filename " was deleted")
             (is (false? (.exists (io/file filename))))))

         (finally
           (doseq [filename (keys file-contents)
                   :let     [file (io/file filename)]]
             (when (.exists file)
               (io/delete-file file)))))))))
