(defproject metabase/clickhouse-driver "1.0.0-SNAPSHOT-0.1.48"
  :min-lein-version "2.5.0"

  :dependencies
  [[ru.yandex.clickhouse/clickhouse-jdbc "0.1.50"
    :exclusions [com.fasterxml.jackson.core/jackson-core
                 org.slf4j/slf4j-api]]]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "clickhouse.metabase-driver.jar"}})
