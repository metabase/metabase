(defproject metabase/google-driver "1.0.0-SNAPSHOT-1.30.7"
  :min-lein-version "2.5.0"

  :aliases
  {"install-for-building-drivers" ["with-profile" "+install-for-building-drivers" "install"]}

  ;; TODO: use BOM to manage these (see extensive comment in project.clj under bigquery for more details)
  :dependencies
  [[com.google.api-client/google-api-client "1.31.5"]
   [com.google.http-client/google-http-client-jackson2 "1.39.2"]] ; keep this synced with bigquery driver dependency version

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     ;; [com.fasterxml.jackson.core/jackson-core "2.10.2"] ; Not sure why this is needed -- this is a dep of metabase-core
     [metabase-core "1.0.0-SNAPSHOT"]]}

   :install-for-building-drivers
   {:auto-clean true
    :aot        :all}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "google.metabase-driver.jar"}})
