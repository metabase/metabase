(defproject metabase/bigquery-driver "1.0.0-SNAPSHOT-1.30.9"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.google.apis/google-api-services-bigquery "v2-rev20200523-1.30.9"]]

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     [metabase-core "1.0.0-SNAPSHOT"]
     [metabase/google-driver "1.0.0-SNAPSHOT-1.30.7"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "bigquery.metabase-driver.jar"}})
