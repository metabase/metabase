(defproject metabase/sqlite-driver "1.0.0-SNAPSHOT"
  :min-lein-version "2.5.0"

  :aliases
  {"bikeshed" ["bikeshed" "--max-line-length" "140"]}

  :dependencies
  [[org.xerial/sqlite-jdbc "3.25.2"]]

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"
   "--add-modules=java.xml.bind"]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "sqlite.metabase-driver.jar"}

   :dev
   {:eastwood
    {:exclude-namespaces
     [:test-paths]

     :add-linters
     [:unused-private-vars
      :unused-namespaces
      :unused-fn-args
      :unused-locals]}

    :docstring-checker
    {:include [#"^sqlite"]
     :exclude [#"test"]}

    :plugins
    [[docstring-checker "1.0.3"]
     [jonase/eastwood "0.3.1"]
     [lein-bikeshed "0.4.1"]]}})
