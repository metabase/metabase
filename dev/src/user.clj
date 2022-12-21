(ns user
  (:require
   [metabase.test-runner.assert-exprs]))

;; make sure stuff like `schema=` and what not are loaded
(comment metabase.test-runner.assert-exprs/keep-me)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'metabase.bootstrap)
  (require 'dev)
  (in-ns 'dev)
  :loaded)
