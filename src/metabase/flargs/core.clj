(ns metabase.flargs.core
  "Definition of the `defflarg` macro, which enables writing functions with a default (main-side) implementation and an
  optional override (flarg-side) implementation. Classpath-isolated in-progress features (\"flargs\") register their
  impls from a `metabase.flarg.<flarg-name>.*` or `metabase-enterprise.flarg.<flarg-name>.*` namespace, and those
  namespaces are only on the classpath when the corresponding flarg is enabled at build time.

  The shape deliberately mirrors `metabase.premium-features.defenterprise` so anyone who already reads that fluently
  reads `defflarg` fluently. The key differences:

    - No `:feature` option and no token check. The gate is classpath presence alone.
    - No `:fallback` option. If the flarg's namespace cannot be loaded, the default runs.
    - \"Side\" detection uses the `metabase(-enterprise)?.flarg.` namespace prefix."
  (:require
   [clojure.string :as str]
   [metabase.classloader.core :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defonce
  ^{:doc "A map from fully-qualified flarg function names to maps containing the default and, when one has been
         registered, impl implementations. Mirrors the shape of [[metabase.premium-features.defenterprise/registry]].

         For example:
           {flarg-ns/flarg-fn-name {:default default-fn
                                    :impl    impl-fn
                                    :flarg   :flarg/some-flarg}}"}
  registry
  (atom {}))

(defn register-mapping!
  "Adds new values to the `registry` for `flarg-fn-name`, merging them onto any existing entry."
  [flarg-fn-name values]
  (swap! registry update flarg-fn-name merge values))

(defn dynamic-flarg-fn
  "Returns a dispatcher fn that, on first invocation, lazily tries to load `flarg-ns` (so any `defflarg` impls in that
  namespace register themselves against the `registry`). Subsequent calls skip the require. The dispatcher then looks
  up `flarg-fn-name` in the `registry` and invokes the impl if one is registered, otherwise the default.

  If the require fails (ns not on classpath because the flarg is off), the exception is swallowed and the default runs
  from then on. This mirrors [[metabase.premium-features.defenterprise/dynamic-ee-oss-fn]]."
  [flarg-ns flarg-fn-name]
  (let [try-require-once (delay (u/ignore-exceptions (classloader/require flarg-ns)))]
    (fn [& args]
      @try-require-once
      (let [{:keys [default impl]} (get @registry flarg-fn-name)]
        (apply (or impl default) args)))))

(defn- in-flarg?
  "Is the current namespace a flarg namespace? Flarg namespaces are prefixed with `metabase.flarg.` or
  `metabase-enterprise.flarg.`."
  []
  (let [nm (str (ns-name *ns*))]
    (or (str/starts-with? nm "metabase.flarg.")
        (str/starts-with? nm "metabase-enterprise.flarg."))))

(defn- docstr-exception
  "The exception to throw when `defflarg` is used without a docstring."
  [fn-name]
  (Exception. (tru "Flarg function {0}/{1} does not have a docstring. Go add one!" (ns-name *ns*) fn-name)))

(defn- validate-flarg-key
  "Throws if `flarg-key` is not a literal keyword whose namespace is \"flarg\" (e.g. `:flarg/workflows`)."
  [flarg-key]
  (when-not (and (keyword? flarg-key)
                 (= "flarg" (namespace flarg-key)))
    (throw (ex-info (tru "defflarg requires a namespaced flarg keyword like :flarg/foo, got: {0}" (pr-str flarg-key))
                    {:flarg-key flarg-key}))))

(defn- validate-flarg-ns
  "Throws if `flarg-ns` is not a symbol."
  [flarg-ns]
  (when-not (symbol? flarg-ns)
    (throw (ex-info (tru "defflarg requires a symbol naming the flarg-side namespace, got: {0}" (pr-str flarg-ns))
                    {:flarg-ns flarg-ns}))))

(defn- validate-arglist
  "Throws if `arglist` is not a vector."
  [arglist]
  (when-not (vector? arglist)
    (throw (ex-info (tru "defflarg requires a vector arglist, got: {0}" (pr-str arglist))
                    {:arglist arglist}))))

(defmacro defflarg
  "Defines a function that has a main-side default implementation and an optional flarg-side impl. Analogous to
  [[metabase.premium-features.defenterprise/defenterprise]], but the gate is classpath presence of the flarg's
  namespace rather than license token + EE edition.

  Call shape:

    (defflarg fn-name
      \"docstring\"
      :flarg/<flarg-name>            ; literal keyword, namespace must be \"flarg\"
      metabase.flarg.<name>.<sub>    ; symbol naming the flarg-side namespace
      [arg1 arg2]
      body...)                       ; default body on the main side, impl body on the flarg side

  The same `defflarg` form is written on BOTH the main side (e.g. `src/metabase/...`) AND the flarg side
  (`release-flags/<flarg-name>/src/metabase/flarg/<flarg-name>/...`) with different bodies. At call time, if an impl is
  registered for this fn, the impl runs; otherwise the default runs. The flarg-side namespace is lazily required on
  first call; if it is not on the classpath, the require is silently ignored and the default runs."
  {:arglists '([fn-name docstring flarg-key flarg-ns arglist & body])}
  [fn-name docstring flarg-key flarg-ns arglist & body]
  {:pre [(symbol? fn-name)]}
  (when-not (string? docstring) (throw (docstr-exception fn-name)))
  (validate-flarg-key flarg-key)
  (validate-flarg-ns flarg-ns)
  (validate-arglist arglist)
  (let [main-or-flarg (if (in-flarg?) :impl :default)]
    `(let [flarg-ns#      '~flarg-ns
           flarg-fn-name# (symbol (str flarg-ns# "/" '~fn-name))
           body-fn#       (fn ~(symbol (str fn-name)) ~arglist ~@body)]
       (register-mapping! flarg-fn-name# {~main-or-flarg body-fn#
                                          :flarg         ~flarg-key})
       (def
         ~(vary-meta fn-name merge {:arglists ''([& args])})
         ~docstring
         (dynamic-flarg-fn flarg-ns# flarg-fn-name#)))))
