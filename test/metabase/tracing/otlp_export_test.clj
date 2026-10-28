(ns ^:mb/driver-tests metabase.tracing.otlp-export-test
  "Builds the production OTel SDK + OTLP HTTP exporter and exports a real span to an in-process
   collector, without touching any global tracing state.

   Why `^:mb/driver-tests`: driver jobs resolve dependencies with the `:drivers` alias, the same way
   the uberjar build does; the regular test classpath doesn't include driver dependencies, so it can't
   see the OpenTelemetry versions they pull in. For example, Snowflake pulls a newer OTel SDK via
   google-cloud-storage; with the exporters left at an older version, the uberjar failed at startup
   with `NoClassDefFoundError` whenever MB_TRACING_ENABLED was set, while every test passed. Running
   here means each driver's dependencies are checked against tracing.

   This covers version mismatches between OTel artifacts. It does not reproduce the uberjar's handling
   of the same class file shipped in several jars (unshaded copies inside driver jars); that is
   resolved by the conflict handlers in `bin/build/src/build/uberjar.clj`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.tracing.core :as tracing]
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (com.sun.net.httpserver HttpExchange HttpHandler HttpServer)
   (io.opentelemetry.sdk OpenTelemetrySdk)
   (java.net InetSocketAddress)))

(set! *warn-on-reflection* true)

(defn- start-collector!
  "Start a fake OTLP HTTP collector on a free port. Each POST to /v1/traces is recorded in
   `received` as a map of content type and body size."
  ^HttpServer [received]
  (doto (HttpServer/create (InetSocketAddress. "127.0.0.1" 0) 0)
    (.createContext "/v1/traces"
                    (reify HttpHandler
                      (handle [_ exchange]
                        (let [^HttpExchange exchange exchange]
                          (swap! received conj {:content-type (.getFirst (.getRequestHeaders exchange) "Content-Type")
                                                :bytes        (count (.readAllBytes (.getRequestBody exchange)))})
                          (.sendResponseHeaders exchange 200 -1)
                          (.close exchange)))))
    (.start)))

(deftest build-otel-sdk-exports-spans-test
  (let [received  (atom [])
        collector (start-collector! received)]
    (try
      (let [sdk ^OpenTelemetrySdk (tracing/build-otel-sdk
                                   {:endpoint     (format "http://127.0.0.1:%d/v1/traces"
                                                          (.getPort (.getAddress collector)))
                                    :service-name "otlp-export-test"
                                    :queue-size   2048
                                    :timeout-ms   5000
                                    :delay-ms     5000})]
        (try
          (span/with-span! {:name   "otlp-export-test"
                            :tracer (span/get-tracer {:open-telemetry sdk})}
            :ok)
          (finally
            ;; flushes the batch span processor, so the export has happened once this returns
            (.close sdk))))
      (testing "the span was exported to the collector over OTLP HTTP"
        (is (=? [{:content-type "application/x-protobuf"
                  :bytes        pos?}]
                @received)))
      (finally
        (.stop collector 0)))))
