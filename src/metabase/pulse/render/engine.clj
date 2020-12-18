(ns metabase.pulse.render.engine
  (:import java.lang.reflect.Method))

(defn script-engine
  "Get an instance of the Nashorn JavaScript engine. The actual class is different on Java >= 15 vs Java < 15."
  ^javax.script.ScriptEngine []
  (.getEngineByName (javax.script.ScriptEngineManager.) "nashorn"))

(defn openjdk-nashorn-engine? []
  #_(.getScriptEngine (org.openjdk.nashorn.api.scripting.NashornScriptEngineFactory.))
  (let [engine-class-name (some-> (script-engine) class .getCanonicalName)]
    (= engine-class-name "org.openjdk.nashorn.api.scripting.NashornScriptEngine")))

(defn- engine-js-object-class ^Class []
  (Class/forName
   (if (openjdk-nashorn-engine?)
     "org.openjdk.nashorn.api.scripting.JSObject"
     "jdk.nashorn.api.scripting.JSObject")))

(def ^:private ^{:arglists '(^java.lang.reflect.Method [])} call-method
  (let [dlay (delay (some
                     (fn [^Method method]
                       (when (= (.getName method) "call")
                         method))
                     (.getDeclaredMethods (engine-js-object-class))))]
    (fn [] @dlay)))

(defn call
  "Invoke a JavaScript object."
  [js-object & args]
  (.invoke (call-method) js-object (object-array args)))
