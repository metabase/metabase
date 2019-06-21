(defproject metabase/oracle-driver "1.0.0"
  :min-lein-version "2.5.0"

  :include-drivers-dependencies [#"^ojdbc[78]\.jar$"]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "oracle.metabase-driver.jar"}})
