(ns metabase.cmd.endpoint-dox-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.cmd.endpoint-dox :as cmd.endpoint-dox]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest generate-dox-test
  (testing "Make sure we can run the command successfully"
    (mt/with-temp-file [filename]
      (cmd.endpoint-dox/generate-dox! filename)
      (is (.exists (io/file filename)))
      (io/delete-file filename))))
