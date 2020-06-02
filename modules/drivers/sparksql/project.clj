(defproject metabase/sparksql-driver "1.0.0-SNAPSHOT-1.2.2"
  :min-lein-version "2.5.0"

  :dependencies
  [
   ;; Exclusions below are all either things that are already part of metabase-core, or provide conflicting
   ;; implementations of things like log4j <-> slf4j, or are part of both hadoop-common and hive-jdbc;
   [org.apache.hadoop/hadoop-common "3.1.1"
    :exclusions [com.fasterxml.jackson.core/jackson-core
                 com.google.guava/guava
                 commons-logging
                 org.apache.httpcomponents/httpcore
                 org.codehaus.jackson/jackson-core-asl
                 org.codehaus.jackson/jackson-mapper-asl
                 org.eclipse.jetty/jetty-http
                 org.eclipse.jetty/jetty-io
                 org.eclipse.jetty/jetty-server
                 org.eclipse.jetty/jetty-util
                 org.slf4j/slf4j-log4j12
                 org.tukaani/xz]]
   [org.apache.hive/hive-jdbc "1.2.2"
    :exclusions
    [commons-logging
     org.apache.curator/curator-framework
     org.codehaus.jackson/jackson-jaxrs
     org.codehaus.jackson/jackson-xc
     org.slf4j/slf4j-log4j12
     org.eclipse.jetty.aggregate/jetty-all]]]

  ;; only used for the lein with-drivers stuff (i.e. tests and REPL)
  :aot [metabase.driver.FixedHiveConnection
        metabase.driver.FixedHiveDriver]

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
    :uberjar-name  "sparksql.metabase-driver.jar"}})
