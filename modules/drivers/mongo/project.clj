(defproject metabase/mongo-driver "1.0.0-SNAPSHOT-3.9.0"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.novemberain/monger "3.1.0" :exclusions [org.mongodb/mongodb-driver]]
   ;; MongoDB driver. Used interally by Monger. Using newer version than what ships with Monger -- see #6678
   [org.mongodb/mongodb-driver "3.9.0"]]

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
    :uberjar-name  "mongo.metabase-driver.jar"}})
