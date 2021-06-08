(ns metabase.pulse.render.js-engine
  (:refer-clojure :exclude [eval])
  (:require [metabase.util :as u])
  (:import com.oracle.truffle.js.scriptengine.GraalJSScriptEngine
           [javax.script Invocable ScriptEngine]
           [org.graalvm.polyglot Context HostAccess]))

(defn ^ScriptEngine engine
  "Create a new JavaScript engine."
  []
  ;; see https://www.graalvm.org/reference-manual/js/ScriptEngine/#manually-creating-context-for-more-flexibility
  (GraalJSScriptEngine/create
   nil
   (doto (Context/newBuilder (u/varargs String ["js"]))
     ;; these options allow JavaScript to access Java classes such as arrays directly -- see
     ;; https://www.graalvm.org/reference-manual/js/JavaInteroperability/
     (.allowHostAccess HostAccess/ALL)
     (.allowHostClassLookup (reify java.util.function.Predicate
                              (test [_ _] true))))))

(defn eval
  "Eval a `javascript` snippet with `engine`, returning the result."
  [^ScriptEngine engine ^String javascript]
  (.eval engine javascript))

(defn invoke-by-name
  "Invoke a JavaScript function with `function-name` and `args`."
  [^Invocable engine function-name & args]
  (.invokeFunction engine (name function-name) (object-array args)))

(defn invoke-function
  "Invoke a JavaScript function object directly."
  [^java.util.function.Function function & args]
  (.apply function (object-array args)))
