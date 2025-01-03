(ns metabase.premium-features.defenterprise
  "Definition of the defenterprise macro, which enables writing functions with dual implementations across the OSS/EE
  code boundary. See the [[defenterprise]] macro docstring for more details."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.malli :as mu]))

(defn- in-ee?
  "Is the current namespace an Enterprise Edition namespace?"
  []
  (str/starts-with? (ns-name *ns*) "metabase-enterprise"))

(defonce
  ^{:doc "A map from fully-qualified EE function names to maps which include their EE and OSS implementations, as well
         as any additional options. This information is used to dynamically dispatch a call to the right implementation,
         depending on the available feature flags.

         For example:
           {ee-ns/ee-fn-name {:oss      oss-fn
                              :ee       ee-fn
                              :feature  :embedding
                              :fallback :oss}"}
  registry
  (atom {}))

(defn register-mapping!
  "Adds new values to the `registry`, associated with the provided function name."
  [ee-fn-name values]
  (swap! registry update ee-fn-name merge values))

(defn- check-feature
  [feature]
  (or (= feature :none)
      (do
        ;; Avoid a circular dependency between this namespace and metabase.premium-features.token-check
        (classloader/require 'metabase.premium-features.token-check)
        ((resolve 'metabase.premium-features.token-check/has-feature?) feature))))

(defn dynamic-ee-oss-fn
  "Dynamically tries to require an enterprise namespace and determine the correct implementation to call, based on the
  availability of EE code and the necessary premium feature. Returns a fn which, when invoked, applies its args to one
  of the EE implementation, the OSS implementation, or the fallback function."
  [ee-ns ee-fn-name]
  (let [try-require-ee-ns-once (delay (u/ignore-exceptions (classloader/require ee-ns)))]
    (fn [& args]
      @try-require-ee-ns-once
      (let [{:keys [ee oss feature fallback]} (get @registry ee-fn-name)]
        (cond
          (and ee (check-feature feature))
          (apply ee args)

          (and ee (fn? fallback))
          (apply fallback args)

          :else
          (apply oss args))))))

(defn- validate-ee-args
  "Throws an exception if the required :feature option is not present."
  [{feature :feature :as options}]
  (when-not feature
    (throw (ex-info (trs "The :feature option is required when using defenterprise in an EE namespace!")
                    {:options options}))))

(defn- oss-options-error
  "The exception to throw when the provided option is not included in the `options` map."
  [option options]
  (ex-info (trs "{0} option for defenterprise should not be set in an OSS namespace! Set it on the EE function instead." option)
           {:options options}))

(defn validate-oss-args
  "Throws exceptions if EE options are provided, or if an EE namespace is not provided."
  [ee-ns {:keys [feature fallback] :as options}]
  (when-not ee-ns
    (throw (Exception. (str (trs "An EE namespace must be provided when using defenterprise in an OSS namespace!")
                            " "
                            (trs "Add it immediately before the argument list.")))))
  (when feature (throw (oss-options-error :feature options)))
  (when fallback (throw (oss-options-error :fallback options))))

(defn- docstr-exception
  "The exception to throw when defenterprise is used without a docstring."
  [fn-name]
  (Exception. (tru "Enterprise function {0}/{1} does not have a docstring. Go add one!" (ns-name *ns*) fn-name)))

(defmacro defenterprise-impl
  "Impl macro for `defenterprise` and `defenterprise-schema`. Don't use this directly."
  [{:keys [fn-name docstr ee-ns fn-tail options schema? return-schema]}]
  (when-not docstr (throw (docstr-exception fn-name)))
  (let [oss-or-ee (if (in-ee?) :ee :oss)]
    (case oss-or-ee
      :ee  (validate-ee-args options)
      :oss (validate-oss-args '~ee-ns options))
    `(let [ee-ns#        '~(or ee-ns (ns-name *ns*))
           ee-fn-name#   (symbol (str ee-ns# "/" '~fn-name))
           oss-or-ee-fn# ~(if schema?
                            `(mu/fn ~(symbol (str fn-name)) :- ~return-schema ~@fn-tail)
                            `(fn ~(symbol (str fn-name)) ~@fn-tail))]
       (register-mapping! ee-fn-name# (merge ~options {~oss-or-ee oss-or-ee-fn#}))
       (def
         ~(vary-meta fn-name assoc :arglists ''([& args]))
         ~docstr
         (dynamic-ee-oss-fn ee-ns# ee-fn-name#)))))

(defn- options-conformer
  [conformed-options]
  (into {} (map (comp (juxt :k :v) second) conformed-options)))

(s/def ::defenterprise-options
  (s/&
   (s/*
    (s/alt
     :feature  (s/cat :k #{:feature}  :v keyword?)
     :fallback (s/cat :k #{:fallback} :v #(or (#{:oss} %) (symbol? %)))))
   (s/conformer options-conformer)))

(s/def ::defenterprise-args
  (s/cat :docstr  (s/? string?)
         :ee-ns   (s/? symbol?)
         :options (s/? ::defenterprise-options)
         :fn-tail (s/* any?)))

(s/def ::defenterprise-schema-args
  (s/cat :return-schema      (s/? (s/cat :- #{:-}
                                         :schema any?))
         :defenterprise-args (s/? ::defenterprise-args)))

(defmacro defenterprise
  "Defines a function that has separate implementations between the Metabase Community Edition (aka OSS) and
  Enterprise Edition (EE).

  When used in a OSS namespace, defines a function that should have a corresponding implementation in an EE namespace
  (using the same macro). The EE implementation will be used preferentially to the OSS implementation if it is available.
  The first argument after the function name should be a symbol of the namespace containing the EE implementation. The
  corresponding EE function must have the same name as the OSS function.

  When used in an EE namespace, the namespace of the corresponding OSS implementation does not need to be included --
  it will be inferred automatically, as long as a corresponding [[defenterprise]] call exists in an OSS namespace.

  Two additional options can be defined, when using this macro in an EE namespace. These options should be defined
  immediately before the args list of the function:

  ###### `:feature`

  A keyword representing a premium feature which must be present for the EE implementation to be used. Use `:none` to
  always run the EE implementation if available, regardless of token (WARNING: this is not recommended for most use
  cases. You probably want to gate your code by a specific premium feature.)

  ###### `:fallback`

  The keyword `:oss`, or a function representing the fallback mechanism which should be used if the instance does not
  have the premium feature defined by the :feature option. If a function is provided, it will be called with the same
  args as the EE function. If `:oss` is provided, it causes the OSS implementation of the function to be called.
  (Default: `:oss`)"
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (s/conform ::defenterprise-args defenterprise-args)
        _           (when (s/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise args"
                                      (s/explain-data ::defenterprise-args parsed-args))))
        args        (assoc parsed-args :fn-name fn-name)]
    `(defenterprise-impl ~args)))

;; TODO: migrate to malli
(defmacro defenterprise-schema
  "A version of defenterprise which allows for schemas to be defined for the args and return value. Schema syntax is
  the same as when using `mu/defn`. Otherwise identical to `defenterprise`; see the docstring of that macro for
  usage details."
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (s/conform ::defenterprise-schema-args defenterprise-args)
        _           (when (s/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise-schema args"
                                      (s/explain-data ::defenterprise-schema-args parsed-args))))
        args        (-> (:defenterprise-args parsed-args)
                        (assoc :schema? true)
                        (assoc :return-schema (-> parsed-args :return-schema :schema))
                        (assoc :fn-name fn-name))]
    `(defenterprise-impl ~args)))
