(ns user
  (:require
   [hawk.assert-exprs]
   [metabase.bootstrap]
   [metabase.test-runner.assert-exprs]))

;; make sure stuff like `schema=` and what not are loaded
(comment hawk.assert-exprs/keep-me
         metabase.bootstrap/keep-me
         metabase.test-runner.assert-exprs/keep-me)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'dev)
  (in-ns 'dev)
  :loaded)
