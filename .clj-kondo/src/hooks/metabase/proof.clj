(ns hooks.metabase.proof
  "Lints for the proof mechanism in `metabase.proof.impl`.

  - `:metabase/proof-constructor`: the proof constructor (`->Proof`, an `:analyze-call` hook here) and the class
    import (checked from the `ns` hook) are allowed only inside the proof namespace, so a proof can only come from an
    issuing check.
  - `:metabase/dangerously-issue-system-proof`: every call of a system issuer outside the proof namespace is flagged,
    except a `test-only` call from a namespace matching `[:linters :metabase/dangerously-issue-system-proof
    :test-only-callers]` in `config.edn` (a namespace symbol, or a string regex on the namespace name). A call that
    acts on nobody's behalf is waved through at the site with an inline ignore and a justifying comment; the ratchet
    in `ratchets.edn` budgets those ignores, which are the residual ambient authority.
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

(def ^:private system-issuer-linter :metabase/dangerously-issue-system-proof)

(defn lint-system-issuer-call
  "Register a `:metabase/dangerously-issue-system-proof` finding on a system issuer call outside the proof namespace,
  unless it is a `test-only` call from a namespace matching the linter's `:test-only-callers`."
  [{:keys [node ns config], :as input}]
  (let [fn-node      (first (:children node))
        issuer       (when (hooks/token-node? fn-node)
                       (symbol (name (hooks/sexpr fn-node))))
        test-callers (get-in config [:linters system-issuer-linter :test-only-callers])]
    (when (and ns issuer
               (not= ns proof-namespace)
               (not (and (= issuer 'test-only) (allowed-caller? test-callers ns))))
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format (str "%s issues a proof with no user check. If this call acts on nobody's behalf, "
                                    "suppress it with #_{:clj-kondo/ignore [%s]} and a comment saying why; "
                                    ".clj-kondo/ratchets.edn budgets those ignores")
                               issuer system-issuer-linter)
              :type    system-issuer-linter))))
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
