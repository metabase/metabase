(ns metabase.sync.analyze.fingerprint.datetime-test
  (:require [clj-time.core :as t]
            [expectations :refer :all]
            [metabase.sync.analyze.fingerprint.datetime :refer :all]))

(expect
  {:earliest "2013-01-01T00:00:00.000Z"
   :latest   "2018-01-01T00:00:00.000Z"}
  (datetime-fingerprint ["2013" "2018" "2015"]))
