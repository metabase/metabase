(ns metabase.util.system-info
  (:require
   [metabase.util.format :as u.format])
  (:import
   (com.sun.management OperatingSystemMXBean)
   (java.lang.management ManagementFactory)))

(set! *warn-on-reflection* true)

(defn- jvm-hardware-info
  "JVM hardware resources, useful for diagnosing performance problems."
  []
  (let [runtime (Runtime/getRuntime)
        os-bean (ManagementFactory/getOperatingSystemMXBean)]
    (cond-> {"jvm.available-processors" (.availableProcessors runtime)
             "jvm.max-memory"           (u.format/format-bytes (.maxMemory runtime))}
      ;; total physical memory on the host, not just what the JVM was allotted
      (instance? OperatingSystemMXBean os-bean)
      (assoc "system.total-memory"
             (u.format/format-bytes (.getTotalMemorySize ^OperatingSystemMXBean os-bean))))))

(defn system-info
  "System info we ask for for bug reports"
  []
  (into (sorted-map)
        (merge (select-keys (System/getProperties) ["java.runtime.name"
                                                    "java.runtime.version"
                                                    "java.vendor"
                                                    "java.vendor.url"
                                                    "java.version"
                                                    "java.vm.name"
                                                    "java.vm.version"
                                                    "os.name"
                                                    "os.version"
                                                    "user.language"
                                                    "user.timezone"
                                                    "file.encoding"])
               (jvm-hardware-info))))
