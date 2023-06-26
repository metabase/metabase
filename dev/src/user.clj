(ns user
  (:require
   [mb.hawk.assert-exprs]
   [metabase.bootstrap]
   [metabase.test-runner.assert-exprs]))

(comment metabase.bootstrap/keep-me
         ;; make sure stuff like `schema=` and what not are loaded
         mb.hawk.assert-exprs/keep-me
         metabase.test-runner.assert-exprs/keep-me)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'dev)
  (in-ns 'dev)
  :loaded)
