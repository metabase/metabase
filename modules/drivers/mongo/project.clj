(defproject metabase/mongo-driver "1.0.0-SNAPSHOT-3.9.0"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.novemberain/monger "3.5.0"]]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "mongo.metabase-driver.jar"}})
