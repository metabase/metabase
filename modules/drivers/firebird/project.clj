(defproject metabase/firebird-driver "1.0.0-SNAPSHOT-0.0.1"
  :min-lein-version "2.5.0"

  :dependencies
  [[org.firebirdsql.jdbc/jaybird-jdk18 "3.0.5"]]

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"
   "--add-modules=java.xml.bind"]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-cleam     true
    :aot            :all
    :javac-options  ["-target" "1.8", "-source" "1.8"]
    :target-path    "target/%s"
    :uberjar-name   "firebird.metabase-driver.jar"}})
