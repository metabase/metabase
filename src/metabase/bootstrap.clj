(ns metabase.bootstrap
  (:gen-class)
  (:require [clojure.java.io :as io]))

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

(defn -main
  "Main entrypoint. Invokes [[metabase.core/entrypoint]]"
  [& args]
  (apply (requiring-resolve 'metabase.core/entrypoint) args))
