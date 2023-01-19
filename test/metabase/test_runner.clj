(ns metabase.test-runner
  "The only purpose of this namespace is to make sure all of the other stuff below gets loaded."
  (:require
   [hawk.core :as hawk]
   [humane-are.core :as humane-are]
   [metabase.bootstrap]
   [metabase.config :as config]
   [metabase.test-runner.assert-exprs]
   [metabase.util.date-2]
   [metabase.util.i18n.impl]
   [pjstadig.humane-test-output :as humane-test-output]))

;;; TODO -- consider whether we should just mode all of this stuff to [[user]] instead of doing it here

(comment
  metabase.bootstrap/keep-me
  ;; make sure stuff like `schema=` and what not are loaded
  metabase.test-runner.assert-exprs/keep-me

  ;; these are necessary so data_readers.clj functions can function
  metabase.util.date-2/keep-me
  metabase.util.i18n.impl/keep-me)

;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
;; from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;;; Same for https://github.com/camsaul/humane-are
(humane-are/install!)

(defn find-and-run-tests-cli [options]
  (hawk.core/find-and-run-tests-cli options))
