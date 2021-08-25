(ns metabase.pulse.render.js-engine
  "Graal polyglot context suitable for executing javascript code.

  We run the js in interpreted mode and turn off the warning with the `(option \"engine.WarnInterpreterOnly\"
  \"false\")`. Ideally we would compile the javascript but this is difficult when using the graal ecosystem in a non
  graal jdk. See https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md for more information.

  Javadocs: https://www.graalvm.org/truffle/javadoc/overview-summary.html"
  (:require [clojure.java.io :as io])
  (:import [org.graalvm.polyglot Context HostAccess Source Value]))

(defn ^Context context
  "Create a new org.graalvm.polyglot.Context suitable to evaluate javascript"
  []
  (.. (Context/newBuilder (into-array String ["js"]))
      ;; https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md
      (option "engine.WarnInterpreterOnly" "false")
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
  (.eval context (.build (Source/newBuilder "js" (io/resource source)))))

(defn ^Value execute-fn-name
  "Executes `js-fn-name` in js context with args"
  [^Context context js-fn-name & args]
  (let [fn-ref (.eval context "js" js-fn-name)
        args   (into-array Object args)]
    (assert (.canExecute fn-ref) (str "cannot execute " js-fn-name))
    (.execute fn-ref args)))

(defn ^Value execute-fn
  "fn-ref should be an executable org.graalvm.polyglot.Value return from a js engine. Invoke this function with args."
  [^Value fn-ref & args]
  (assert (.canExecute fn-ref) "cannot execute function reference")
  (.execute fn-ref (object-array args)))
