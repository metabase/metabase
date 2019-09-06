(ns metabase.troubleshooting)

(defn system-info
  "Useful for debugging"
  []
  (into (sorted-map)
        (select-keys (System/getProperties) ["java.runtime.name"
                                             "java.runtime.version"
                                             "java.vendor"
                                             "java.vendor.url"
                                             "java.version"
                                             "java.vm.name"
                                             "java.vm.version"
                                             "os.name"
                                             "os.version"
                                             "user.language"
                                             "user.timezone"])))
