(defproject metabase/oracle-driver "1.0.0"
  :min-lein-version "2.5.0"

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"
   "--add-modules=java.xml.bind"]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "oracle.metabase-driver.jar"}})
