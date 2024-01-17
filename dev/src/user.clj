(ns user
  (:require
   [environ.core :as env]
   [humane-are.core :as humane-are]
   [mb.hawk.assert-exprs]
   [metabase.bootstrap]
   [metabase.test-runner.assert-exprs]
   [pjstadig.humane-test-output :as humane-test-output]))

;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
;; from the CLI, it breaks diffs. This uses [[env/env]] rather than [[metabase.config]] so we don't load that namespace
;; before we load [[metabase.bootstrap]]
(when-not (= (env/env :mb-run-mode) "test")
  (humane-test-output/activate!))

;;; Same for https://github.com/camsaul/humane-are
(humane-are/install!)

(comment metabase.bootstrap/keep-me
         ;; make sure stuff like `=?` and what not are loaded
         mb.hawk.assert-exprs/keep-me
         metabase.test-runner.assert-exprs/keep-me)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'dev)
  (in-ns 'dev)
  :loaded)
