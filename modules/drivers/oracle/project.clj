(defproject metabase/oracle-driver "1.0.0"
  :min-lein-version "2.5.0"

  :profiles
  {:provided
   {:dependencies
    ;; can't ship it as part of MB!
    ;; TODO - see whether we can add this to the `:dev` profile as well
    [[com.oracle.ojdbc/ojdbc8 "19.3.0.0"]
     [metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "oracle.metabase-driver.jar"}})
