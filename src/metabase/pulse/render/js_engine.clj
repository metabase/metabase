(ns metabase.pulse.render.js-engine
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
   (org.graalvm.polyglot Context HostAccess Source Value)))

(set! *warn-on-reflection* true)

(defn threadlocal-fifo-memoizer
  "Returns a memoizer that is unique to each thread."
  [thunk threshold]
  (memoize/fifo
   (with-meta thunk {::memoize/args-fn (fn [_]
                                        [(.getId (Thread/currentThread))])})
   :fifo/threshold threshold))

(defn context
  "Create a new org.graalvm.polyglot.Context suitable to evaluate javascript"
  ^Context []
  (.. (Context/newBuilder (into-array String ["js"]))
      ;; https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md
      (option "engine.WarnInterpreterOnly" "false")
      (option "js.intl-402" "true")
      (allowHostAccess HostAccess/ALL)
      (allowHostClassLookup (reify java.util.function.Predicate
                              (test [_ _] true)))
      (out System/out)
      (err System/err)
      (allowIO true)
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
