(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.test-runner.parallel :as test-runner.parallel]
            [toucan.db :as db]
            [toucan.models :as models]
            [toucan.util.test :as tt]))

;; replace [[toucan.util.test/do-with-temp]] so it initializes the DB before doing the other stuff it usually does

(defn do-with-temp [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; disallow with-temp inside parallel tests.
  ;;
  ;; TODO -- there's not really a reason that we can't use with-temp in parallel tests -- it depends on the test -- so
  ;; once we're a little more comfortable with the current parallel stuff we should remove this restriction.
  (test-runner.parallel/assert-test-is-not-parallel "with-temp")
  ;; catch any Exceptions thrown when creating the object and rethrow them with some extra context to make them a
  ;; little easier to debug.
  (let [attributes-with-defaults (merge (tt/with-temp-defaults model)
                                        attributes)]
    (try
      (let [temp-object        (let [object (or (db/insert! model attributes-with-defaults)
                                                ;; if the object didn't come back from insert see if it's possible to
                                                ;; manually fetch it (work around Toucan 1 bugs where things with
                                                ;; non-integer values don't come back from H2, e.g. models like Session)
                                                (let [pk-key   (models/primary-key model)
                                                      pk-value (get attributes-with-defaults pk-key)]
                                                  (when pk-value
                                                    (db/select-one model pk-key pk-value))))]
                                 (assert (record? object)
                                         (str (format "db/insert! for %s did not return a valid row. Got: %s."
                                                      (name model)
                                                      (pr-str object))
                                              \newline
                                              "(Tip: db/insert! doesn't seem to work with H2 with tables with compound PKs, or with non-integer IDs.)"))
                                 object)
            primary-key-column (models/primary-key model)
            primary-key-value  (get temp-object primary-key-column)]
        (assert primary-key-value (format "No value for primary key %s for row %s"
                                          (pr-str primary-key-column)
                                          (pr-str temp-object)))
        (try
          (f temp-object)
          (finally
            (db/delete! model primary-key-column primary-key-value))))
      (catch Throwable e
        ;; only wrap `e` if it's not another `with-temp` error. This way we don't get "false positives" if something
        ;; fails at the beginning of a big `with-temp*` form for all the other models
        (throw (if (::with-temp-error? (ex-data e))
                 e
                 (ex-info (format "with-temp error for %s: %s" (name model) (ex-message e))
                          {:model                    (name model)
                           :attributes               attributes
                           :attributes-with-defaults attributes-with-defaults
                           :primary-key-column       (models/primary-key model)
                           ::with-temp-error?        true}
                          e)))))))

(alter-var-root #'tt/do-with-temp (constantly do-with-temp))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (test-runner.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
