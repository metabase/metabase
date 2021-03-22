(defproject metabase/sqlserver-driver "1.1.0-SNAPSHOT-9.2.1.jre8"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.microsoft.sqlserver/mssql-jdbc "9.2.1.jre8"]]

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
    :uberjar-name  "sqlserver.metabase-driver.jar"}})
