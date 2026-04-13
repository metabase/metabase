(ns metabase.core.bootstrap
  (:gen-class)
  (:require
   [clojure.java.io :as io]
   [clojure.tools.cli :as cli]))

(set! *warn-on-reflection* true)

;; athena includes `log4j2.properties` which is the first location checked for config. This takes precedence over our
;; own log4j2.xml and dynamically reloads and kills useful logging. Should we move our log4j2.xml into
;; metabase/metabase/log4j2.xml and refer to it that way so presumably no jar could add another log4j2.xml that we
;; accidentally pick up?
(when-not (or (System/getProperty "log4j2.configurationFile")
              (System/getProperty "log4j.configurationFile"))
  ;; if the test config file from `test_resources` is on the claspath, e.g. in `clj -X:dev:test`, use that.
  (let [^String filename (if (io/resource "log4j2-test.xml")
                           "log4j2-test.xml"
                           "log4j2.xml")]
    (System/setProperty "log4j2.configurationFile" filename)))

;; ensure we use a `BasicContextSelector` instead of a `ClassLoaderContextSelector` for log4j2. Ensures there is only
;; one LoggerContext instead of one per classpath root. Practical effect is that now `(LogManager/getContext true)`
;; and `(LogManager/getContext false)` will return the same (and only)
;; LoggerContext. https://logging.apache.org/log4j/2.x/manual/logsep.html
(System/setProperty "log4j2.contextSelector" "org.apache.logging.log4j.core.selector.BasicContextSelector")

;; ensure the [[clojure.tools.logging]] logger factory is the log4j2 version (slf4j is far slower and identified first)
(System/setProperty "clojure.tools.logging.factory" "clojure.tools.logging.impl/log4j2-factory")

;;; ===========================================================================
;;; Standalone modes
;;;
;;; These modes don't need the full Metabase infrastructure (app-db, events,
;;; etc.) and can run with minimal namespace loading for fast startup.
;;;
;;; Usage: java -jar metabase.jar --mode checker [checker-specific args...]
;;; ===========================================================================

#_{:clj-kondo/ignore [:discouraged-var]}
(def output!
  "Alias for println so can suppress warning in one place"
  println)

(defn- run-standalone-mode
  "Errors if --mode is specified but not recognized.
   The mode's -main function is responsible for calling System/exit."
  [mode args]
  (let [startup (case mode
                  ;; schema checker was moved out to js. Perhaps this will get a long running server mode checker? Or
                  ;; perhaps just this one.
                  "checker" 'metabase-enterprise.checker.cli/entrypoint
                  nil)]
    (if startup
      ((requiring-resolve startup) args)
      (do (binding [*out* *err*]
            (output! (str "Unknown mode: " mode))
            (output! "Available modes: checker"))
          (System/exit 1)))))

(defn -main
  "Main entrypoint. Invokes [[metabase.core.core/entrypoint]]"
  [& args]
  ;; We need to install the classloader here before other namespaces are loaded since they could launch threads on load.
  ;; If a thread is spun up and put back into a pool before this happens that pool will have a poisoned thread unable to
  ;; see classes in our classloader.
  ((requiring-resolve 'metabase.classloader.core/the-classloader))
  ;; Check for standalone modes first - these skip loading metabase.core.core
  (let [{:keys [options]} (cli/parse-opts args [[nil "--mode MODE"]])
        mode              (:mode options)]
    (if mode
      (run-standalone-mode mode args)
      (apply (requiring-resolve 'metabase.core.core/entrypoint) args))))
