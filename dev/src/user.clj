(ns user
  (:require
   [environ.core :as env]
   [humane-are.core :as humane-are]
   [mb.hawk.assert-exprs]
   [metabase.bootstrap]
   [metabase.test-runner.assert-exprs]))

(comment metabase.bootstrap/keep-me
         ;; make sure stuff like `schema=` and what not are loaded
         mb.hawk.assert-exprs/keep-me
         metabase.test-runner.assert-exprs/keep-me)

(humane-are/install!)

;; don't enable humane-test-output when running tests from the CLI, it breaks diffs.
;;
;; This uses [[env/env]] directly rather than [[metabase.config/is-test?]] so we can avoid loading [[metabase.config]]
;; on REPL launch, the less `metabase.*` stuff we load on REPL launch the better because if something breaks on launch
;; it's a big PITA to debug
(when-not (= (env/env :mb-run-mode) "test")
  ((requiring-resolve 'pjstadig.humane-test-output/activate!)))

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'dev)
  (in-ns 'dev)
  :loaded)
