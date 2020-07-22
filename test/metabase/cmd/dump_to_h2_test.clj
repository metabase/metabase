(ns metabase.cmd.dump-to-h2-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [flatland.ordered.map :as ordered-map]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.db :as mdb]
            [metabase.util.files :as u.files]
            [toucan.db :as db]))

(deftest path-test
  (testing "works without file: schema"
    (is (= {:classname   "org.h2.Driver"
            :subprotocol "h2"
            :subname     "file:/path/to/metabase.db"
            :type        :h2}
           (#'dump-to-h2/h2-details "/path/to/metabase.db"))))

  (testing "works with file: schema"
    (is (= {:classname "org.h2.Driver"
            :subprotocol "h2"
            :subname     "file:/path/to/metabase.db"
            :type        :h2}
           (#'dump-to-h2/h2-details "file:/path/to/metabase.db")))))

(deftest casing-corner-cases-test
  (testing "objects->colums+values property handles columns with weird casing: `sizeX` and `sizeY`"
    (let [cols+vals (binding [db/*quoting-style* :ansi]
                      (-> (#'dump-to-h2/objects->colums+values
                           ;; using ordered-map so the results will be in a predictable order
                           [(ordered-map/ordered-map
                             :id    281
                             :row   0
                             :sizex 18
                             :sizey 9)])
                          (update :cols vec)))]
      (is (= {:cols ["\"id\"" "\"row\"" "\"sizeX\"" "\"sizeY\""]
              :vals [[281 0 18 9]]}
             cols+vals)))))

(deftest dump-deletes-target-db-files-tests
  (let [tmp-h2-db     (str (u.files/get-path (System/getProperty "java.io.tmpdir") "mbtest_dump.h2"))
        tmp-h2-db-mv  (str tmp-h2-db ".mv.db")
        file-contents {tmp-h2-db    "Not really an H2 DB"
                       tmp-h2-db-mv "Not really another H2 DB"}]
    ;; keep setup-db!/setup-db!* from changing connection state
    (with-redefs [mdb/setup-db!  (constantly nil)
                  mdb/setup-db!* (constantly nil)]
      (try
        (doseq [[filename contents] file-contents]
          (spit filename contents))
        (dump-to-h2/dump-to-h2! tmp-h2-db)

        (doseq [filename (keys file-contents)]
          (testing (str filename " was deleted")
            (is (false? (.exists (io/file filename))))))

        (finally
          (doseq [filename (keys file-contents)
                  :let [file (io/file filename)]]
            (when (.exists file)
              (io/delete-file file))))))))
