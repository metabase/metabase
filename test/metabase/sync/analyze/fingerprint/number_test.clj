(ns metabase.sync.analyze.fingerprint.number-test
  (:require [expectations :refer :all]
            [metabase.sync.analyze.fingerprint.number :as number]))

(expect
  (approximately (double Long/MAX_VALUE))
  (:avg (number/number-fingerprint [Long/MAX_VALUE Long/MAX_VALUE])))
