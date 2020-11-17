(defproject metabase/redshift-driver "1.0.0-SNAPSHOT-1.2.43.1067"
  :min-lein-version "2.5.0"

  :repositories
  [["redshift" "https://s3.amazonaws.com/redshift-maven-repository/release"]]


  :dependencies
  [[com.amazon.redshift/redshift-jdbc42-no-awssdk "1.2.45.1069"]]

  :profiles
  {:provided
   {:dependencies
    [[org.clojure/clojure "1.10.1"]
     [metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "redshift.metabase-driver.jar"}})
