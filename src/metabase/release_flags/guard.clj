(ns metabase.release-flags.guard
  (:require
   [metabase.release-flags.models :as models]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private blocked-calls
  "Atom recording calls to functions blocked by a disabled release flag.
   Each entry is a map with :flag, :fn, and :call-site."
  (atom []))

(defn- call-site
  "Returns the call site of the guarded function as a string, e.g. \"my.ns (my_ns.clj:42)\".
   Walks the stack trace to find the first frame outside the guard namespace."
  []
  (let [guard-class-prefix "metabase.release_flags.guard"]
    (->> (.getStackTrace (Thread/currentThread))
         (drop-while #(or (.startsWith (.getClassName ^StackTraceElement %) guard-class-prefix)
                          (.startsWith (.getClassName ^StackTraceElement %) "clojure.lang")))
         first
         ((fn [^StackTraceElement frame]
            (when frame
              (format "%s (%s:%d)"
                      (.getClassName frame)
                      (.getFileName frame)
                      (.getLineNumber frame))))))))

(defn guard-namespace!
  "Protects all public functions in the current namespace behind a release flag.
   Call this at the end of a namespace. When a guarded function is called:
   - If the flag is enabled, the original function runs normally.
   - If the flag is not enabled (or does not exist), the call is recorded in
     [[blocked-calls]], a warning is logged, and nil is returned."
  [flag]
  (let [flag-name (name flag)
        ns-name   (ns-name *ns*)]
    (doseq [[sym v] (ns-interns *ns*)
            :when (and (var? v) (fn? @v))]
      (let [original-fn @v
            qualified   (str ns-name "/" sym)]
        (alter-var-root
         v
         (constantly
          (fn [& args]
            (if (try
                  (models/has-release-flag? flag-name)
                  (catch Exception _
                    false))
              (apply original-fn args)
              (let [site (call-site)]
                (swap! blocked-calls conj {:flag      flag-name
                                           :fn        qualified
                                           :call-site site})
                (log/warnf "Release flag \"%s\" is not enabled. Skipping call to %s (called from %s)"
                           flag-name qualified site)
                nil)))))))))
