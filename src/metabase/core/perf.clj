(ns metabase.core.perf
  "Java Flight Recorder (JFR) performance monitoring support.
   When `MB_MONITOR_PERFORMANCE` is set, starts a JFR recording at startup
   that can be analyzed with JDK Mission Control or other JFR tools."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time LocalDate)
   (java.time.format DateTimeFormatter)
   (java.util.concurrent ScheduledThreadPoolExecutor TimeUnit)
   (jdk.jfr Configuration Recording)))

(set! *warn-on-reflection* true)

(defonce ^:private recording-atom (atom nil))
(defonce ^:private dump-executor-atom (atom nil))

(def ^:private sensitive-events
  "JFR events that may contain sensitive information and should be disabled."
  ["jdk.InitialEnvironmentVariable"
   "jdk.InitialSystemProperty"
   "jdk.SystemProcess"
   "jdk.JVMInformation"])

(defn- resolve-output-path
  "Determine the output path for the JFR recording file.
   - `\"true\"` generates a timestamped filename like `metabase-2026_01_15.jfr`
   - Any other value is used as a filename (`.jfr` is appended if missing)"
  ^java.nio.file.Path [setting-value]
  (let [filename (if (= "true" setting-value)
                   (str "metabase-"
                        (.format (LocalDate/now)
                                 (DateTimeFormatter/ofPattern "yyyy_MM_dd"))
                        ".jfr")
                   (if (str/ends-with? setting-value ".jfr")
                     setting-value
                     (str setting-value ".jfr")))]
    (.. (java.nio.file.Path/of filename (into-array String []))
        (toAbsolutePath))))

(defn- disable-sensitive-events!
  "Disable JFR events that may contain sensitive information."
  [^Recording recording]
  (doseq [^String event-name sensitive-events]
    (.disable recording event-name)))

(defn- start-periodic-dump!
  "Starts a background thread that periodically dumps the JFR recording to disk.
   This ensures data survives hard kills (SIGKILL, OOM) where shutdown hooks don't run."
  [^Recording recording ^java.nio.file.Path output-path interval-seconds]
  (let [executor (ScheduledThreadPoolExecutor. 1
                                               (reify java.util.concurrent.ThreadFactory
                                                 (newThread [_ r]
                                                   (doto (Thread. r "jfr-periodic-dump")
                                                     (.setDaemon true)))))]
    (.scheduleAtFixedRate executor
                          ^Runnable (fn [] (.dump recording output-path))
                          (long interval-seconds)
                          (long interval-seconds)
                          TimeUnit/SECONDS)
    (reset! dump-executor-atom executor)))

(defn maybe-enable-monitoring!
  "If `MB_MONITOR_PERFORMANCE` is set, starts a JFR recording.
   - Value `\"true\"` auto-generates a timestamped filename
   - Any other non-empty/non-`\"false\"` string is used as filename
   - Recording uses the `\"profile\"` configuration with `dumpOnExit=true`"
  []
  (try
    (let [setting (config/config-str :mb-monitor-performance)]
      (when (and (not (str/blank? setting))
                 (not= "false" setting))
        (let [output-path (resolve-output-path setting)
              parent-dir  (.getParent output-path)
              config      (Configuration/getConfiguration "profile")
              recording   (Recording. config)]
          (when parent-dir
            (Files/createDirectories parent-dir (into-array FileAttribute [])))
          (.setToDisk recording true)
          (.setDumpOnExit recording true)
          (.setMaxSize recording 0)
          (.setMaxAge recording nil)
          (.setDestination recording output-path)
          (disable-sensitive-events! recording)
          (.start recording)
          (reset! recording-atom recording)
          (start-periodic-dump! recording output-path 60)
          (log/infof "Performance monitoring started. Output file: %s" (str output-path)))))
    (catch Throwable e
      (log/warn e "Failed to start performance monitoring"))))

(defn stop-monitoring!
  "Stops and closes the JFR recording if one is active."
  []
  (when-let [^Recording recording @recording-atom]
    (try
      (when-let [^ScheduledThreadPoolExecutor executor @dump-executor-atom]
        (.shutdownNow executor)
        (reset! dump-executor-atom nil))
      (.stop recording)
      (.close recording)
      (reset! recording-atom nil)
      (log/info "Performance monitoring stopped")
      (catch Throwable e
        (log/warn e "Error stopping performance monitoring")))))
