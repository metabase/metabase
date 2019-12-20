(defproject metabase/snowflake-driver "1.0.0-SNAPSHOT-3.10.2"
  :min-lein-version "2.5.0"

  :dependencies
  [[net.snowflake/snowflake-jdbc "3.10.2"]]

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
    :uberjar-name  "snowflake.metabase-driver.jar"}})
