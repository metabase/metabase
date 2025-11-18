(ns metabase.test-runner.bootstrap
  "CLI entrypoint for running tests; this loads some namespaces that NEED to be loaded before everything else (such
  as [[metabase.test.redefs]], which adds some checks to make sure loading namespaces doesn't trigger app DB
  queries)."
  (:require
   [humane-are.core :as humane-are]
   [metabase.config.core :as config]
   [metabase.core.bootstrap]
   [metabase.test-runner.assert-exprs]
   [metabase.test.redefs]
   [metabase.util.date-2]
   [metabase.util.i18n.impl]
   [pjstadig.humane-test-output :as humane-test-output]))

;;; TODO -- consider whether we should just mode all of this stuff to [[user]] instead of doing it here

(comment
  metabase.core.bootstrap/keep-me
  ;; make sure stuff like `=?` and what not are loaded
  metabase.test-runner.assert-exprs/keep-me
  ;; load the wrappers around with-temp and other stuff like that
  metabase.test.redefs/keep-me
  ;; these are necessary so data_readers.clj functions can function
  metabase.util.date-2/keep-me
  metabase.util.i18n.impl/keep-me)

;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
;; from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;;; Same for https://github.com/camsaul/humane-are
(humane-are/install!)

(defn find-and-run-tests-cli
  "Entrypoint for `clojure -X:test`."
  [options]
  ((requiring-resolve 'metabase.test-runner/-find-and-run-tests-cli) options))
