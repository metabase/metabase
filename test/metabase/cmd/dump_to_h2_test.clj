(ns metabase.cmd.dump-to-h2-test
  (:require [clojure.test :refer :all]
            [flatland.ordered.map :as ordered-map]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
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
