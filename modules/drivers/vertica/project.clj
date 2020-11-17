(defproject metabase/vertica-driver "1.0.0-SNAPSHOT"
  :min-lein-version "2.5.0"

  :include-drivers-dependencies [#"^vertica-jdbc-.*\.jar$"]

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     [metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "vertica.metabase-driver.jar"}})
