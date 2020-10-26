(defproject metabase/exasol-driver "1.0.0"
  :min-lein-version "2.5.0"

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.11", "-source" "1.11"]
    :target-path   "target/%s"
    :uberjar-name  "exasol.metabase-driver.jar"}})
