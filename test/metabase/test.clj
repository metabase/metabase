(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!"
  (:require [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [potemkin :as p]))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  data/keep-me
  datasets/keep-me
  driver/keep-me
  qp.test-util/keep-me
  qp.test/keep-me)

;; Add more stuff here as needed
(p/import-vars
 [data id db]
 [datasets test-drivers]
 [driver with-driver]
 [qp.test normal-drivers normal-drivers-with-feature]
 [qp.test-util with-everything-store])
