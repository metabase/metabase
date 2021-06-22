(defproject metabase/bigquery-cloud-sdk-driver "1.0.0-SNAPSHOT-1.131.1"
  :min-lein-version "2.5.0"

  ;; Google recommends using the BOM to load their cloud dependencies; see:
  ;; https://cloud.google.com/bigquery/docs/quickstarts/quickstart-client-libraries#install_the_client_library
  ;; in theory, this plugin should allow us to resolve lein dependencies from a BOM, and then LEAVE OUT the specific
  ;; versions of dependencies below (since that is the entire point of a BOM)
  ;; however, it's not working with our complicated lein setup
  ;; it works fine if you do a regular `lein repl` or `lein deps :tree` (from this module dir)
  ;; :plugins [[lein-bom "0.2.0-SNAPSHOT"]]
  ;;:bom {:import [[com.google.cloud/libraries-bom "20.6.0"]]}

  ;; unfortunately, even having those lines^^ uncommented results in this error, from the build driver script:
  ;;   [{:type java.lang.IllegalStateException,
  ;      :message "Could not find a suitable classloader to modify from clojure.lang.LazySeq@e3880c6a",
  ;      :at [cemerick.pomegranate$add_classpath invokeStatic "pomegranate.clj" 54]}],
  ;; and from our top level Metabase REPL, this error is thrown:
  ;;   Provided artifact is missing a version: [com.google.cloud/google-cloud-bigquery nil]

  :dependencies
  ;; TODO: figure out how to be able to leave off this version and use the BOM version (see above)
  [[com.google.cloud/google-cloud-bigquery "1.131.1"]]

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
    :uberjar-name  "bigquery-cloud-sdk.metabase-driver.jar"}})
