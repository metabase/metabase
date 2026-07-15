(ns metabase.util.memory
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (com.sun.management OperatingSystemMXBean)
   (java.lang.management ManagementFactory)))

(set! *warn-on-reflection* true)

(defn total-memory
  "Get total memory in bytes"
  []
  (.totalMemory (Runtime/getRuntime)))

(defn free-memory
  "Get free memory in bytes."
  []
  (.freeMemory (Runtime/getRuntime)))

(defn pretty-usage-str
  "Return pretty string with memory usage."
  []
  (let [free (free-memory)
        total (total-memory)]
    (format "free: %.2fG, total: %.2fG, ratio: %.2f"
            (/ free 1e9)
            (/ total 1e9)
            (double (/ free total)))))

(def ^:private cgroup-unlimited-threshold
  "cgroup v1 represents an unset memory limit as a huge sentinel (LONG_MAX rounded down to the
  page size, e.g. 0x7FFFFFFFFFFFF000). Treat any value at or above this as 'no limit'."
  0x7000000000000000)

(defn- read-cgroup-memory-limit
  "Read this container's memory limit in bytes from the cgroup filesystem, or nil when there is
  no cgroup limit file (e.g. not containerized, or macOS) or the limit is 'unlimited'. Handles
  cgroup v2 (`/sys/fs/cgroup/memory.max`) and v1 (`/sys/fs/cgroup/memory/memory.limit_in_bytes`)."
  []
  (letfn [(parse [path]
            (try
              (let [f (io/file path)]
                (when (.exists f)
                  (let [s (str/trim (slurp f))]
                    (cond
                      (= s "max")            nil ; cgroup v2 unlimited
                      (re-matches #"\d+" s)  (let [v (Long/parseLong s)]
                                               (when (< v cgroup-unlimited-threshold) v))))))
              (catch Exception _ nil)))]
    (or (parse "/sys/fs/cgroup/memory.max")                      ; cgroup v2
        (parse "/sys/fs/cgroup/memory/memory.limit_in_bytes")))) ; cgroup v1

(defn container-memory-limit
  "Best-effort total memory available to this process, in bytes. Returns the container/cgroup
  memory limit when one is set (the pod's memory ceiling), else the OS total physical memory,
  else nil if neither can be determined. Used to size resource caps (e.g. the static-viz
  render isolate) so they stay under the cgroup ceiling and fail closed instead of getting the
  whole process OOM-killed."
  []
  (or (read-cgroup-memory-limit)
      (let [os-bean (ManagementFactory/getOperatingSystemMXBean)]
        (when (instance? OperatingSystemMXBean os-bean)
          (.getTotalMemorySize ^OperatingSystemMXBean os-bean)))))
