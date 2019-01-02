(defproject metabase/googleanalytics-driver "1.0.0-SNAPSHOT-1.27.0"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.google.apis/google-api-services-analytics "v3-rev20180622-1.27.0"]]

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
    :uberjar-name  "googleanalytics.metabase-driver.jar"}})
