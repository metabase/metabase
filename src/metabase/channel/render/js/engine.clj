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
   (org.graalvm.polyglot Context HostAccess Source Value)
   (org.graalvm.polyglot.proxy ProxyArray ProxyObject)))

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

(defn- deserialize-number
  [^Value result]
  (cond
    (.fitsInShort result)
    (.asShort result)

    (.fitsInLong result)
    (.asLong result)

    (.fitsInInt result)
    (.asInt result)

    (.fitsInDouble result)
    (.asDouble result)

    (.fitsInFloat result)
    (.asFloat result)))

(defn- deserialize
  [^Value result]
  (cond
    (.isNumber result)
    (deserialize-number result)

    (.isString result)
    (.asString result)

    (.hasArrayElements result)
    (let [n (.getArraySize result)]
      (into [] (map (fn [idx]
                      (deserialize (.getArrayElement result idx)))
                    (range 0 n))))

    (.isNull result)
    nil

    (.isBoolean result)
    (.asBoolean result)

    :else
    result))

(defn- serialize-arg [arg]
  (cond
    (keyword? arg)
    (name arg)

    (symbol? arg)
    (name arg)

    (map? arg)
    (ProxyObject/fromMap (into {} (map (fn [[k v]]
                                         [(serialize-arg k) (serialize-arg v)])
                                       arg)))

    (coll? arg)
    (ProxyArray/fromArray (into-array Object (map serialize-arg arg)))

    :else
    arg))

(defn- execute*
  [fn-ref args]
  (deserialize (.execute fn-ref (into-array Object (map serialize-arg args)))))

(defn execute-fn-name
  "Executes `js-fn-name` in js context with args"
  ^Value [^Context context js-fn-name & args]
  ;; TODO: locking context is not ideal, but contexts are currently being shared with all threads and GraalVM doesn't
  ;; support concurrent execution for js.
  ;; There is a couple of idea we can try:
  ;; - put a thread pool around context initialization
  ;; - init a new context for each thread
  ;; maybe we can remove the lock now as we have pooled static-viz-context
  ;; https://github.com/metabase/metabase/pull/56648
  (locking context
    (let [fn-ref (.eval context "js" js-fn-name)]
      (assert (.canExecute fn-ref) (str "cannot execute " js-fn-name))
      (execute* fn-ref args))))

(defn execute-fn
  "fn-ref should be an executable org.graalvm.polyglot.Value return from a js engine. Invoke this function with args."
  ^Value [^Value fn-ref & args]
  (assert (.canExecute fn-ref) "cannot execute function reference")
  (execute* fn-ref args))
