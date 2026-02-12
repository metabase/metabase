(ns metabase.core.perf
  "Java Flight Recorder (JFR) performance monitoring support.
   When `MB_MONITOR_PERFORMANCE` is set, starts a JFR recording at startup
   that can be analyzed with JDK Mission Control or other JFR tools."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute)
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)
   (java.util.concurrent ScheduledThreadPoolExecutor ThreadFactory TimeUnit)
   (jdk.jfr Configuration Recording)))

(set! *warn-on-reflection* true)

(defonce ^:private recording-atom (atom nil))
(defonce ^:private dump-executor-atom (atom nil))
(defonce ^:private rolling-dir-atom (atom nil))

(def ^:private sensitive-events
  "JFR events that may contain sensitive information and should be disabled."
  ["jdk.InitialEnvironmentVariable"
   "jdk.InitialSystemProperty"
   "jdk.SystemProcess"
   "jdk.JVMInformation"])

(def ^:private timestamp-formatter
  (DateTimeFormatter/ofPattern "yyyyMMdd_HHmmss"))

(defn- generate-timestamped-filename
  "Generate a timestamped JFR filename like `metabase-20260115_143000.jfr`."
  []
  (str "metabase-"
       (.format (LocalDateTime/now) timestamp-formatter)
       ".jfr"))

(defn- resolve-output-path
  "Determine the output path for the JFR recording file.
   - `\"true\"` generates a timestamped filename like `metabase-20260115_143000.jfr`
   - Any value ending in `.jfr` is used as-is"
  ^Path [setting-value]
  (let [filename (if (= "true" setting-value)
                   (generate-timestamped-filename)
                   setting-value)
        ^Path path (Path/of filename (into-array String []))]
    (.toAbsolutePath path)))

(defn- save-rate-minutes
  "Read the save rate from MB_MONITOR_PERFORMANCE_SAVE_RATE (in minutes), falling back to `default-minutes`."
  [default-minutes]
  (or (config/config-int :mb-monitor-performance-save-rate)
      default-minutes))

(defn- directory-mode?
  "Returns true if the setting value should be treated as a directory for rolling JFR files.
   Directory mode is any value that is not \"true\", \"false\", blank, or ending in \".jfr\"."
  [setting-value]
  (and (not (str/blank? setting-value))
       (not= "false" setting-value)
       (not= "true" setting-value)
       (not (str/ends-with? setting-value ".jfr"))))

(defn- disable-sensitive-events!
  "Disable JFR events that may contain sensitive information."
  [^Recording recording]
  (doseq [^String event-name sensitive-events]
    (.disable recording event-name)))

(defn- start-periodic-dump!
  "Starts a background thread that periodically dumps the JFR recording to disk.
   This ensures data survives hard kills (SIGKILL, OOM) where shutdown hooks don't run."
  [^Recording recording ^Path output-path interval-minutes]
  (let [executor (ScheduledThreadPoolExecutor. 1
                                               (reify ThreadFactory
                                                 (newThread [_ r]
                                                   (doto (Thread. r "jfr-periodic-dump")
                                                     (.setDaemon true)))))]
    (.scheduleAtFixedRate executor
                          ^Runnable (fn [] (.dump recording output-path))
                          interval-minutes
                          interval-minutes
                          TimeUnit/MINUTES)
    (reset! dump-executor-atom executor)))

(defn- create-recording!
  "Create and start a new JFR recording with standard settings."
  ^Recording []
  (let [config    (Configuration/getConfiguration "profile")
        recording (Recording. config)]
    (.setToDisk recording true)
    (.setMaxSize recording 0)
    (.setMaxAge recording nil)
    (disable-sensitive-events! recording)
    (.start recording)
    recording))

(defn- start-rolling-mode!
  "Start rolling directory mode. Every `interval-minutes`, dumps the current recording
   to a timestamped file in `dir-path` and starts a new recording. Data is only written
   to disk at the end of each interval."
  [^Path dir-path interval-minutes]
  (Files/createDirectories dir-path (into-array FileAttribute []))
  (let [recording (create-recording!)
        _         (reset! recording-atom recording)
        _         (reset! rolling-dir-atom dir-path)
        executor  (ScheduledThreadPoolExecutor. 1
                                                (reify ThreadFactory
                                                  (newThread [_ r]
                                                    (doto (Thread. r "jfr-rolling-dump")
                                                      (.setDaemon true)))))]
    (.scheduleAtFixedRate
     executor
     ^Runnable (fn []
                 (try
                   (let [^Recording old-recording @recording-atom
                         ^String filename (generate-timestamped-filename)
                         output-file (.resolve dir-path filename)
                         new-recording (create-recording!)]
                     (.stop old-recording)
                     (.dump old-recording output-file)
                     (.close old-recording)
                     (reset! recording-atom new-recording)
                     (log/infof "Performance info written to: %s" (str output-file)))
                   (catch Throwable e
                     (log/warn e "Error during rolling performance dump"))))
     interval-minutes
     interval-minutes
     TimeUnit/MINUTES)
    (reset! dump-executor-atom executor)))

(defn maybe-enable-monitoring!
  "If `MB_MONITOR_PERFORMANCE` is set, starts a JFR recording.
   - Value `\"true\"` auto-generates a timestamped filename (includes date+time)
   - Value ending in `.jfr` is used as the output filename
   - `\"\"` or `\"false\"` disables monitoring
   - Any other value is treated as a directory for rolling 30-minute JFR files"
  []
  (try
    (let [setting (config/config-str :mb-monitor-performance)]
      (when (and (not (str/blank? setting))
                 (not= "false" setting))
        (if (directory-mode? setting)
          ;; Rolling directory mode: new file every 30 minutes
          (let [^Path dir-path (.toAbsolutePath (Path/of setting (into-array String [])))]
            (start-rolling-mode! dir-path (save-rate-minutes 30))
            (log/infof "Performance monitoring started in rolling mode. Output directory: %s" (str dir-path)))
          ;; Single file mode
          (let [output-path (resolve-output-path setting)
                parent-dir  (.getParent output-path)]
            (when parent-dir
              (Files/createDirectories parent-dir (into-array FileAttribute [])))
            (let [recording (create-recording!)]
              (.setDumpOnExit recording true)
              (.setDestination recording output-path)
              (reset! recording-atom recording)
              (start-periodic-dump! recording output-path (save-rate-minutes 5))
              (log/infof "Performance monitoring started. Output file: %s" (str output-path)))))))
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
      ;; In rolling mode, dump the final partial recording before closing
      (when-let [^Path dir-path @rolling-dir-atom]
        (let [^String filename (generate-timestamped-filename)
              output-file (.resolve dir-path filename)]
          (.dump recording output-file))
        (reset! rolling-dir-atom nil))
      (.close recording)
      (reset! recording-atom nil)
      (log/info "Performance monitoring stopped")
      (catch Throwable e
        (log/warn e "Error stopping performance monitoring")))))
