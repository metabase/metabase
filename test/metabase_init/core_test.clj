(ns metabase-init.core-test
  (:use expectations)
  (:require [metabase-init.core :refer :all]))

;; Basic sanity check
(expect 2 (+ 1 1))

(expect false)
