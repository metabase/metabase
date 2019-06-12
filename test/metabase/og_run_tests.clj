(ns metabase.og-run-tests
  (:require
    [metabase.query-processor-test.breakout-test]
    [clojure.test :refer :all]
    [clojure.tools.namespace.find :as ns-find]
    [clojure.java.classpath :as classpath]
    [clojure.string :as str]
    [metabase.test-setup :as metabase.test-setup]
    [expectations :as expectations]))



(defn expectations-wrap [stage]
  (doseq [ns-symb (ns-find/find-namespaces (classpath/system-classpath))
          :when (and (str/starts-with? ns-symb "metabase.")
                     (find-ns ns-symb))
          [_ varr] (ns-interns ns-symb)
          :let [{:keys [expectations-options]} (meta varr)]
          :when (= expectations-options stage)]
    (varr)))

(defn run-driver-tests []
  (System/setProperty "DRIVERS" "h2,mongo")

  (expectations-wrap :before-run)

  (metabase.test-setup/call-with-test-scaffolding
    (fn [] (expectations/run-tests '[metabase.query-processor-test.breakout-test])))

  (expectations-wrap :after-run))



(defn load-server []
  (require 'metabase.core
           'metabase.server
           'metabase.db
           'metabase.handler
           'metabase.plugins)
  (metabase.server/start-web-server! #'metabase.handler/app)
  (metabase.db/setup-db!)
  (metabase.plugins/load-plugins!)
  (metabase.core.initialization-status/set-complete!))

(comment

  ;; Run tests with drivers
  (run-driver-tests)


  ;; Load app server
  (load-server)
  )
