(ns metabase.channel.render.js.engine
  "Graal polyglot context suitable for executing javascript code.

  We run the js in interpreted mode and turn off the warning with the `(option \"engine.WarnInterpreterOnly\"
  \"false\")`. Ideally we would compile the javascript but this is difficult when using the graal ecosystem in a non
  graal jdk. See https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md for more information.

  Javadocs: https://www.graalvm.org/truffle/javadoc/overview-summary.html"
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [metabase.util.i18n :refer [trs]])
  (:import
   (java.io OutputStream)
   (org.graalvm.polyglot Context Engine HostAccess SandboxPolicy Source Value)))

(set! *warn-on-reflection* true)

;; A singleton (one shared instance, not rebuilt per context) so all contexts sharing the `Engine` have identical
;; host-access config, as GraalVM requires.

(def ^:private no-host-class-lookup
  "Predicate blocking all host class lookup. A singleton so all contexts sharing an engine have identical config."
  (reify java.util.function.Predicate
    (test [_ _] false)))

(defn- new-js-engine
  "Build a JS `Engine` to be shared across contexts. We run JS interpreted (no Graal compiler on a stock JDK), so
  `engine.WarnInterpreterOnly` is silenced here on the engine (it's an engine-level option)."
  ^Engine []
  ;; https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md
  (.. (Engine/newBuilder)
      (option "engine.WarnInterpreterOnly" "false")
      (build)))

(defonce ^:private
  ^{:doc "GraalVM `Engine` shared by every sandboxed JS context (static-viz, color selector, untrusted custom-viz
          plugins). The engine owns the Truffle runtime + parsed-source cache, so contexts (and pool recycles) reuse
          one engine instead of each standing up its own. The engine is a process-lifetime singleton (intentionally
          never closed)."}
  shared-sandboxed-js-engine
  (delay (new-js-engine)))

(defn threadlocal-fifo-memoizer
  "Returns a memoizer that is unique to each thread."
  [thunk threshold]
  (memoize/fifo
   (with-meta thunk {::memoize/args-fn (fn [_]
                                         [(.getId (Thread/currentThread))])})
   :fifo/threshold threshold))

(defn context
  "Create a sandboxed org.graalvm.polyglot.Context for evaluating untrusted javascript
  (e.g. custom viz plugins). No host access, no class lookup, no filesystem I/O.
  All data must be passed as JSON strings and parsed in JS."
  ^Context []
  (.. (Context/newBuilder (into-array String ["js"]))
      (engine @shared-sandboxed-js-engine)
      (option "js.intl-402" "true")
      (allowHostAccess HostAccess/NONE)
      (allowHostClassLookup no-host-class-lookup)
      (out System/out)
      (err System/err)
      (allowIO false)
      (build)))

;;; ---------------------------------------- Untrusted plugin sandbox ----------------------------------------
;;;
;;; Stronger sandbox for running *untrusted* custom-viz plugin JS (third-party bundles). Unlike [[context]],
;;; which relies on `HostAccess/NONE` + config flags in the host JVM, this runs the guest inside a GraalVM
;;; native-image isolate (separate VM, separate heap) under `SandboxPolicy/UNTRUSTED`, so CPU/heap limits and
;;; speculative-execution mitigations are enforced by the VM. Requires the `js-isolate-community` artifact on
;;; the classpath. Built-in static-viz keeps the faster in-process [[context]] path; only plugins pay for the
;;; isolate.

(def ^:private ^OutputStream discarding-output-stream
  "Sink for untrusted-guest stdout/stderr — plugin console output is neither trusted nor useful in server
  logs, and `SandboxPolicy/UNTRUSTED` bounds it via `sandbox.Max*StreamSize` regardless."
  (proxy [OutputStream] []
    (write
      ([_])
      ([_ _ _]))))

(defn- new-untrusted-plugin-engine
  "Build the isolate `Engine` shared by every untrusted-plugin context. `engine.MaxIsolateMemory` caps the
  whole isolate heap and must exceed the per-context `sandbox.MaxHeapMemory` set in [[untrusted-plugin-context]]."
  ^Engine []
  (.. (Engine/newBuilder (into-array String ["js"]))
      ;; A shared engine and its contexts must declare the same sandbox policy, so the engine sets UNTRUSTED
      ;; too — otherwise creating an UNTRUSTED context on it would fail the engine/context policy-match check.
      (sandbox SandboxPolicy/UNTRUSTED)
      (option "engine.MaxIsolateMemory" "1GB")
      (out discarding-output-stream)
      (err discarding-output-stream)
      (build)))

(defonce ^:private
  ^{:doc "GraalVM isolate `Engine` shared by every untrusted custom-viz plugin context. Contexts on a shared
          engine still get isolated global scopes (one plugin can't see another's globals), while sharing the
          isolate's Truffle runtime + parsed-source cache. Process-lifetime singleton (intentionally never
          closed)."}
  shared-untrusted-plugin-engine
  (delay (new-untrusted-plugin-engine)))

(defn untrusted-plugin-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` for running untrusted custom-viz plugin JS.
  The guest runs in a separate isolate heap with VM-enforced CPU/heap/AST limits; like [[context]] it has no
  host access and no IO, so data must cross the boundary as JSON strings. Requires `js-isolate-community` on
  the classpath. The `sandbox.*` limits below are all mandatory under `UNTRUSTED` — the context fails to build
  if any is unset."
  ^Context []
  (.. (Context/newBuilder (into-array String ["js"]))
      (engine @shared-untrusted-plugin-engine)
      (sandbox SandboxPolicy/UNTRUSTED)
      ;; HostAccess/UNTRUSTED, not /NONE: the UNTRUSTED policy rejects /NONE (it still permits mutable
      ;; target-type mappings). /UNTRUSTED is the policy's purpose-built strictest host-access mode.
      (allowHostAccess HostAccess/UNTRUSTED)
      ;; allowAllAccess (the master switch that would enable all of the below at once) is false by default; UNTRUSTED forbids true.
      ;; allowHostClassLookup is false by default under SandboxPolicy/UNTRUSTED.
      ;; allowIO is disabled by default under SandboxPolicy/UNTRUSTED.
      ;; allowNativeAccess is false by default under SandboxPolicy/UNTRUSTED.
      ;; allowEnvironmentAccess is NONE (no host env vars) by default under SandboxPolicy/UNTRUSTED.
      ;; allowExperimentalOptions left at default false
      ;; Guest CPU budget covering a bundle load + plugin render: cold first render ~6s (4s cold parse + render),
      ;; warm renders ~2-3s (parsed-source cache). 10s leaves headroom for slower hardware while stopping a
      ;; misbehaving plugin from monopolizing a render thread. MaxCPUTimeCheckInterval left at its ~10ms default.
      (option "sandbox.MaxCPUTime" "10s")
      (option "sandbox.MaxHeapMemory" "512MB")
      (option "sandbox.MaxASTDepth" "5000")
      (option "sandbox.MaxThreads" "1")         ; single-threaded isolate; allowCreateThread also defaults to false
      (option "sandbox.MaxOutputStreamSize" "16MB")
      (option "sandbox.MaxErrorStreamSize" "4MB")
      ;; sandbox.MaxStatements skipped (and thus its MaxStatementsIncludeInternal modifier): fragile to tune and the compute axis is already covered by MaxCPUTime et al.
      ;; sandbox.MaxStackFrames skipped too: runtime-recursion blowup surfaces as a contained guest error in the isolate.
      (out discarding-output-stream)
      (err discarding-output-stream)
      (build)))

(defn load-js-string
  "Load a string literal source into the js context."
  [^Context context ^String string-src ^String src-name]
  (.eval context (.buildLiteral (Source/newBuilder "js" string-src src-name))))

(defn load-resource
  "Load a resource into the js context"
  [^Context context source]
  (let [resource (io/resource source)]
    (when (nil? resource)
      (throw (ex-info (trs "Javascript resource not found: {0}" source)
                      {:source source})))
    (.eval context (.build (Source/newBuilder "js" resource)))))

(defn execute-fn-name
  "Executes `js-fn-name` in js context with args"
  ^Value [^Context context js-fn-name & args]
  ;; TODO: locking context is not ideal, but contexts are currently being shared with all threads and GraalVM doesn't
  ;; support concurrent execution for js.
  ;; There is a couple of idea we can try:
  ;; - put a thread pool around context initialization
  ;; - init a new context for each thread
  (locking context
    (let [fn-ref (.eval context "js" js-fn-name)
          args   (into-array Object args)]
      (assert (.canExecute fn-ref) (str "cannot execute " js-fn-name))
      (.execute fn-ref args))))

(defn execute-fn
  "fn-ref should be an executable org.graalvm.polyglot.Value return from a js engine. Invoke this function with args."
  ^Value [^Value fn-ref & args]
  (assert (.canExecute fn-ref) "cannot execute function reference")
  (.execute fn-ref (object-array args)))
