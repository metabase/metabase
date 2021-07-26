(defproject metabase/presto-common-driver "1.0.0-SNAPSHOT"
  :min-lein-version "2.5.0"

  :description "Common code for all Presto drivers. Defines HoneySQL behavior, query generation, etc."

  :aliases
  {"install-for-building-drivers" ["with-profile" "+install-for-building-drivers" "install"]}

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     [metabase-core "1.0.0-SNAPSHOT"]]}

   :install-for-building-drivers
   {:auto-clean true
    :aot        :all}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "presto-common.metabase-driver.jar"}})
