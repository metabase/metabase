(defproject metabase/sqlite-driver "1.0.0-SNAPSHOT-3.25.2"
  :min-lein-version "2.5.0"

  :dependencies
  [[org.xerial/sqlite-jdbc "3.25.2"]]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "sqlite.metabase-driver.jar"}})
