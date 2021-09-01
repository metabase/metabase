(ns metabase-enterprise.enhancements.ee-strategy-impl
  "Macro for reifying an object that hands off method invocations to one implementation if EE features are
  enabled (i.e., if we have a valid token) or to a different implementation if they are not.

  In OO pattern terminology, this is an implementation of the strategy pattern -- the implementation of the interface
  is determined at runtime."
  (:require [clojure.string :as str]
            [pretty.core :refer [PrettyPrintable]]))

(defn invoke-ee-when-enabled
  "Impl for `reify-ee-strategy-impl`. Invoke `method` using `ee-impl` if EE features are enabled, otherwise invoke with
  `oss-impl`."
  [enable-pred-var method ee-impl oss-impl & args]
  (let [impl (if (enable-pred-var)
               ee-impl
               oss-impl)]
    (apply method impl args)))

(defn- resolve-protocol
  "Resolve a protocol symbol like `LDAPIntegration` to a protocol *map*."
  [protocol-symbol]
  (or (let [resolved (resolve protocol-symbol)]
        (if (class? resolved)
          (let [symb (symbol (-> (.getCanonicalName ^Class resolved)
                                 (str/replace  #"(^.+)\.([^\.]+$)" "$1/$2")
                                 (str/replace #"_" "-")))]
            ;; this macro only works on Clojure Protocols at this time, because we use the map definition of the
            ;; protocol to generate the method implementation forms. It *could* work with normal Java interfaces using
            ;; reflection, but there hasn't been a need for it yet at this point. We can add it if we need it
            (var-get (or (resolve symb)
                         (throw (ex-info (format "Could not find protocol %s. `ee-strategy-impl` only works on protocols at this time."
                                                 symb)
                                         {:protocol symb})))))
          (some-> resolved var-get)))
      (throw (ex-info (format "Could not resolve protocol %s." protocol-symbol)
                      {:protocol protocol-symbol}))))

(defn- generate-method-impl
  [enable-pred-symbol ee-impl-symbol oss-impl-symbol protocol-map {method-name :name, arglists :arglists}]
  (let [arg-counts            (map count arglists)
        protocol-namespace    (:ns (meta (:var protocol-map)))
        qualified-method-name (symbol (name (ns-name protocol-namespace))
                                      (name method-name))]
    (when-not (distinct? arg-counts)
      (throw (ex-info "ee-strategy-impl does not work with overloaded methods with the same number of args at this time."
                      {:method   method-name
                       :arglists arglists})))
    (for [arg-count (sort arg-counts)
          :let      [args (for [n (range (dec arg-count))]
                            (symbol (str (char (+ (int \a) n)))))]]
      `(~method-name [~'_ ~@args]
        (invoke-ee-when-enabled ~enable-pred-symbol ~qualified-method-name ~ee-impl-symbol ~oss-impl-symbol ~@args)))))

(defn- generate-protocol-impl [enable-pred-symbol ee-impl-symbol oss-impl-symbol protocol-symbol]
  (let [protocol-map (resolve-protocol protocol-symbol)]
    (cons
     (symbol (.getCanonicalName ^Class (:on-interface protocol-map)))
     (mapcat (partial generate-method-impl enable-pred-symbol ee-impl-symbol oss-impl-symbol protocol-map)
             (vals (:sigs protocol-map))))))

(defmacro reify-ee-strategy-impl
  "Reifies a Strategy Pattern object that implements `protocols`. Invocations of protocol methods will be forwarded to
  `ee-impl` if Enterprise Edition features are enabled (i.e., if we have a valid EE token), otherwise they will be
  forwarded to `oss-impl`.

    ;; For `MyProtocol` methods: invoke `ee-impl` if EE enhancements are enabled, otherwise invoke `oss-impl`
    (def impl
      (reify-ee-strategy-impl #'settings.metastore/enable-enhancements? ee-impl oss-impl
        MyProtocol))

  At the time of this writing, this only works with first-class Clojure Protocols (as opposed to plain Java
  interfaces), but should the need arise we can change this."
  {:style/indent [:defn 2]}
  [enable-pred-var ee-impl oss-impl & protocols]
  {:pre [(pos? (count protocols))]}
  (assert (and (sequential? enable-pred-var) (= (first enable-pred-var) 'var))
          "Predicate for enabling the EE impl should be a #'var")
  (let [ee-impl-symbol  (gensym "ee-impl-")
        oss-impl-symbol (gensym "oss-impl-")]
    `(let [~ee-impl-symbol  ~ee-impl
           ~oss-impl-symbol ~oss-impl]
       (reify
         PrettyPrintable
         (~'pretty [~'_]
          (list `reify-ee-strategy-impl ~enable-pred-var ~ee-impl-symbol ~oss-impl-symbol))

         ~@(mapcat (partial generate-protocol-impl enable-pred-var ee-impl-symbol oss-impl-symbol)
             protocols)))))
