(ns user
  (:require
   [hawk.assert-exprs]
   [metabase.test-runner.assert-exprs]))

;; make sure stuff like `schema=` and what not are loaded
(comment hawk.assert-exprs/keep-me
         metabase.test-runner.assert-exprs/keep-me)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'metabase.bootstrap)
  (require 'dev)
  (in-ns 'dev)
  :loaded)
