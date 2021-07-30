(defproject metabase/presto-jdbc-driver "1.0.0-0.254-SNAPSHOT"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.facebook.presto/presto-jdbc "0.254"]]

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     [metabase-core "1.0.0-SNAPSHOT"]
     [metabase/presto-common-driver "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "presto-jdbc.metabase-driver.jar"}})
