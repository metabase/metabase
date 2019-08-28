(defproject metabase/google-driver "1.0.0-SNAPSHOT-1.27.0"
  :min-lein-version "2.5.0"

  :aliases
  {"install-for-building-drivers" ["with-profile" "+install-for-building-drivers" "install"]}

  :dependencies
  [[com.google.api-client/google-api-client "1.27.0"]]

  :profiles
  {:provided
   {:dependencies
    [[metabase-core "1.0.0-SNAPSHOT"]]}

   :install-for-building-drivers
   {:auto-clean true
    :aot        :all}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "google.metabase-driver.jar"}})
