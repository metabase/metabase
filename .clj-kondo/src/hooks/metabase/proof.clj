(ns hooks.metabase.proof
  "Lints for the proof mechanism in `metabase.proof.impl`.

  - `:metabase/proof-constructor`: the proof constructor (`->Proof`, an `:analyze-call` hook here) and the class
    import (checked from the `ns` hook) are allowed only inside the proof namespace, so a proof can only come from an
    issuing check.
  - `:metabase/proof-system-issuer`: each system issuer may be called only from the namespaces enumerated for it under
    `[:linters :metabase/proof-system-issuer :allowed-callers]` in `config.edn`, keyed by the issuer's simple name;
    an entry is a namespace symbol (exact) or a string (a regex on the namespace name). That list is the residual
    ambient authority.
  - `:metabase/proof-gated-mutator`: in the `.db` namespace of a module marked `:proof-gated` in the modules config,
    every function whose name ends in `!` takes `proof` as its first parameter in every arity (called from the `defn`
    hook).

  Every hook returns its input unchanged so Kondo's normal analysis of the form still runs."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common.modules :as modules]))

(def ^:private proof-namespace 'metabase.proof.impl)

(def ^:private proof-class "metabase.proof.impl.Proof")

;;; ------------------------------------------------ constructor -----------------------------------------------------

(defn lint-constructor-call
  "Register a `:metabase/proof-constructor` finding when the proof constructor is called outside the proof namespace."
  [{:keys [node ns], :as input}]
  (when (and ns (not= ns proof-namespace))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format (str "Only %s may construct a proof; obtain one from an issuing check "
                                    "[:metabase/proof-constructor]")
                               proof-namespace)
              :type    :metabase/proof-constructor))))
  input)

(defn- proof-class-import?
  "Whether an `:import` entry node names the proof class: `metabase.proof.impl.Proof` as a symbol or string,
  or `(metabase.proof.impl Proof)`."
  [node]
  (cond
    (hooks/list-node? node)
    (let [[package-node & class-nodes] (:children node)]
      (boolean (and package-node
                    (= (str (hooks/sexpr package-node)) (str proof-namespace))
                    (some #(= (str (hooks/sexpr %)) "Proof") class-nodes))))

    (hooks/token-node? node)
    (= (str (hooks/sexpr node)) proof-class)

    :else
    false))

(defn lint-import-node
  "Register a `:metabase/proof-constructor` finding on `import-entry-node`, an entry of an `ns` form's `:import`, when
  it imports the proof class into `ns-symb` and that is not the proof namespace."
  [import-entry-node ns-symb]
  (when (and (not= ns-symb proof-namespace)
             (proof-class-import? import-entry-node))
    (hooks/reg-finding!
     (assoc (meta import-entry-node)
            :message (format (str "Only %s may import the proof class; obtain a proof from an issuing check "
                                  "[:metabase/proof-constructor]")
                             proof-namespace)
            :type    :metabase/proof-constructor))))

;;; ----------------------------------------------- system issuers ---------------------------------------------------

(defn- allowed-caller?
  [allowed ns-symb]
  (boolean (some (fn [entry]
                   (cond
                     (symbol? entry) (= entry ns-symb)
                     (string? entry) (re-find (re-pattern entry) (str ns-symb))
                     :else           false))
                 allowed)))

(defn lint-system-issuer-call
  "Register a `:metabase/proof-system-issuer` finding when a system issuer is called from a namespace not enumerated
  for it in the config."
  [{:keys [node ns config], :as input}]
  (let [fn-node (first (:children node))
        issuer  (when (hooks/token-node? fn-node)
                  (symbol (name (hooks/sexpr fn-node))))
        allowed (get-in config [:linters :metabase/proof-system-issuer :allowed-callers issuer])]
    (when (and ns issuer (not (allowed-caller? allowed ns)))
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format (str "The system issuer %s may not be called from %s; add the namespace to "
                                    ":allowed-callers in .clj-kondo/config.edn if it acts on nobody's behalf "
                                    "[:metabase/proof-system-issuer]")
                               issuer ns)
              :type    :metabase/proof-system-issuer))))
  input)

;;; ---------------------------------------------- proof-gated modules -----------------------------------------------

(defn- db-namespace? [ns-sym]
  (boolean (re-matches #"^metabase(?:-enterprise)?\.[^.]+\.db$" (str ns-sym))))

(defn- arglist-nodes
  "The params vector node of each arity of a `defn` whose children after the name are `nodes`."
  [nodes]
  (let [nodes (drop-while #(or (hooks/string-node? %) (hooks/map-node? %)) nodes)]
    (if (hooks/vector-node? (first nodes))
      [(first nodes)]
      (keep (fn [node]
              (when (hooks/list-node? node)
                (let [params (first (:children node))]
                  (when (hooks/vector-node? params)
                    params))))
            nodes))))

(defn- proof-first-param? [params-node]
  (let [first-param (first (:children params-node))]
    (boolean (and first-param
                  (hooks/token-node? first-param)
                  (= 'proof (hooks/sexpr first-param))))))

(defn lint-proof-gated-mutator
  "Register a `:metabase/proof-gated-mutator` finding on a `defn` in a proof-gated module's `.db` namespace whose name
  ends in `!` and which does not take `proof` as its first parameter in every arity."
  [{:keys [node ns], :as input}]
  (when (and ns (db-namespace? ns))
    (let [config (modules/config input)
          module (modules/module config ns)]
      (when (get-in config [:metabase/modules module :proof-gated])
        (let [[_defn name-node & body] (:children node)
              fn-name                  (when (hooks/token-node? name-node)
                                         (str (hooks/sexpr name-node)))]
          (when (and fn-name (str/ends-with? fn-name "!"))
            (doseq [params-node (arglist-nodes body)
                    :when       (not (proof-first-param? params-node))]
              (hooks/reg-finding!
               (assoc (meta params-node)
                      :message (format (str "%s is proof-gated: every mutating function in %s must take `proof` as "
                                            "its first parameter [:metabase/proof-gated-mutator]")
                                       module ns)
                      :type    :metabase/proof-gated-mutator))))))))
  input)
