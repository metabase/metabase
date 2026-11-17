(ns hooks.clojure.core.let
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common :as common]))

(def ^:private dynamic-redefs-macros
  '#{metabase.test/with-dynamic-fn-redefs
     metabase.test.util.dynamic-redefs/with-dynamic-fn-redefs})

(defn- captured-var-node
  "The symbol node naming the var whose value `init` captures: `x`, `@#'x` or `(deref #'x)`. Otherwise nil."
  [init]
  (let [var-quoted (fn [node]
                     (when (= :var (hooks/tag node))
                       (first (:children node))))]
    (case (hooks/tag init)
      :token init
      :deref (var-quoted (first (:children init)))
      :list  (let [[f x & more] (:children init)]
               (when (and x
                          (not more)
                          (= 'clojure.core/deref (common/node->qualified-symbol f)))
                 (var-quoted x)))
      nil)))

(defn- reexported-from
  "The vars that `var-sym` could be a potemkin re-export of."
  [var-sym]
  (let [var-name (symbol (name var-sym))
        proxied  (common/proxied-analyses (common/ns-analysis (symbol (namespace var-sym))))]
    (for [ns-sym (common/reexport-sources proxied var-name)]
      (symbol (name ns-sym) (name var-name)))))

(defn- var-and-sources
  "The set of `var-sym` and every var it re-exports, directly or through other re-exports."
  [var-sym]
  (loop [found #{var-sym}
         todo  [var-sym]]
    (if-let [[v & more] (seq todo)]
      (let [new-vars (remove found (reexported-from v))]
        (recur (into found new-vars) (concat more new-vars)))
      found)))

(defn- symbols
  "Every symbol that appears in `node`."
  [node]
  (into #{}
        (comp (filter hooks/token-node?)
              (map hooks/sexpr)
              (filter symbol?))
        (tree-seq :children :children node)))

(defn- dynamic-redefs
  "Each `with-dynamic-fn-redefs` form in `nodes`, as the vars it redefines and the symbols it uses."
  [nodes]
  (for [node  (mapcat #(tree-seq :children :children %) nodes)
        :when (and (hooks/list-node? node)
                   (dynamic-redefs-macros (common/node->qualified-symbol (first (:children node)))))
        :let  [[_ bindings] (:children node)]
        :when (hooks/vector-node? bindings)]
    {:vars    (into #{} (keep common/node->qualified-symbol) (take-nth 2 (:children bindings)))
     :symbols (symbols node)}))

(defn- dependent-locals
  "The set of `local` and every local in `later-pairs` whose init uses it, directly or through another of them."
  [local later-pairs]
  (reduce (fn [locals [binding init]]
            (if (and (hooks/token-node? binding)
                     (some locals (symbols init)))
              (conj locals (hooks/sexpr binding))
              locals))
          #{local}
          later-pairs))

(defn- redefined-while-used?
  "Whether a form in `redefs` uses one of `locals` while redefining `captured` or a var that `captured` re-exports."
  [redefs locals captured]
  ;; Calling a captured re-export calls whatever its source's proxy calls, so redefining the source counts.
  ;; The reverse is fine: redefining a re-export only intercepts calls made through the re-export.
  (when-let [using (seq (filter #(some locals (:symbols %)) redefs))]
    (let [targets (var-and-sources captured)]
      (some #(some (:vars %) targets) using))))

(defn- message [sym]
  (str "This captures " sym ", which with-dynamic-fn-redefs redefines below. "
       "Once the var holds a proxy, which the test runner installs before any test, calling this inside the redef "
       "calls the replacement. "
       "Use (mt/original-fn #'" sym ") instead. [:metabase/dynamic-redefs-captured-proxy]"))

(defn lint-let
  "Warn on a captured var that a later `with-dynamic-fn-redefs` redefines while using the capture."
  [{:keys [node]}]
  ;; The macro leaves its proxy on the var, and the test runner installs it before any test, so the binding holds the
  ;; proxy. Only a run that skips the runner, on the var's first redefinition, captures the original.
  ;; Calling the proxy while the redef is in scope reaches the replacement.
  ;; Outside the redef, the proxy calls the original, so a capture used only there is fine.
  (let [[_let bindings & body] (:children node)]
    (when (hooks/vector-node? bindings)
      (let [pairs    (partition 2 (:children bindings))
            captures (for [[i [local init]] (map-indexed vector pairs)
                           :let  [var-node (captured-var-node init)
                                  captured (common/node->qualified-symbol var-node)]
                           :when (and captured (hooks/token-node? local))]
                       {:local       (hooks/sexpr local)
                        :later-pairs (drop (inc i) pairs)
                        :init        init
                        :var-node    var-node
                        :captured    captured})]
        ;; Only walk the scope when some binding captures a var.
        (when-let [redefs (and (seq captures)
                               (seq (dynamic-redefs (concat (map second pairs) body))))]
          ;; A redef can reach the capture through a later local, such as a replacement fn bound in this `let`.
          (doseq [{:keys [local later-pairs init var-node captured]} captures
                  :when (redefined-while-used? redefs (dependent-locals local later-pairs) captured)]
            (hooks/reg-finding!
             (assoc (meta init)
                    :message (message (hooks/sexpr var-node))
                    :type    :metabase/dynamic-redefs-captured-proxy)))))))
  {:node node})
