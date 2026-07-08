(ns metabase.tracing.test-util
  "Test helpers for asserting OpenTelemetry span output. Provides an in-memory
  span exporter wired into clj-otel's default tracer for the duration of a test,
  plus a Clojure-friendly accessor for reading captured spans back."
  (:require
   [steffan-westcott.clj-otel.api.trace.span :as span])
  (:import
   (io.opentelemetry.api.common AttributeKey)
   (io.opentelemetry.sdk.testing.exporter InMemorySpanExporter)
   (io.opentelemetry.sdk.trace SdkTracerProvider)
   (io.opentelemetry.sdk.trace.data SpanData)
   (io.opentelemetry.sdk.trace.export SimpleSpanProcessor)))

(set! *warn-on-reflection* true)

(defmacro with-span-exporter
  "Run `body` with clj-otel's default tracer pointed at an in-memory span exporter.
   `exporter-binding` is bound to the exporter — pass it to [[finished-spans]] to
   read captured spans as Clojure maps.

   SimpleSpanProcessor exports synchronously on span end, so reads after the body
   are deterministic. On exit, the default tracer is reset to nil (clj-otel's
   initial state)."
  [[exporter-binding] & body]
  `(let [~exporter-binding         (InMemorySpanExporter/create)
         provider# ^SdkTracerProvider (-> (SdkTracerProvider/builder)
                                          (.addSpanProcessor (SimpleSpanProcessor/create ~exporter-binding))
                                          (.build))]
     (span/set-default-tracer! (.get provider# "metabase-test"))
     (try
       ~@body
       (finally
         (span/set-default-tracer! nil)
         (.shutdown provider#)))))

(defn finished-spans
  "Return finished spans from an in-memory span exporter as a vector of maps:
     - :name  span name (string)
     - :attrs map of OTel attribute name (string) -> value
   For tests needing more SpanData fields, extend this helper or read the raw
   SpanData via `(.getFinishedSpanItems exporter)`."
  [^InMemorySpanExporter exporter]
  (mapv (fn [^SpanData span]
          {:name  (.getName span)
           :attrs (into {} (map (fn [[^AttributeKey k v]] [(.getKey k) v]))
                        (.asMap (.getAttributes span)))})
        (.getFinishedSpanItems exporter)))
