(defproject metabase/bigquery-driver "1.0.0-SNAPSHOT-1.27.0"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.google.apis/google-api-services-bigquery "v2-rev20181202-1.27.0"]]

  :profiles
  {:provided
   {:dependencies
    [[metabase-core "1.0.0-SNAPSHOT"]
     [metabase/google-driver "1.0.0-SNAPSHOT-1.27.0"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "bigquery.metabase-driver.jar"}})
