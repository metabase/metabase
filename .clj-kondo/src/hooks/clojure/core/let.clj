(ns hooks.clojure.core.let
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private dynamic-redefs-macros
  '#{metabase.test/with-dynamic-fn-redefs
     metabase.test.util.dynamic-redefs/with-dynamic-fn-redefs})

(defn- resolved-var
  "The fully qualified symbol `node` names, when it is a symbol that resolves to a var."
  [node]
  (when (hooks/token-node? node)
    (let [sym (hooks/sexpr node)]
      (when (symbol? sym)
        (let [{ns-sym :ns var-sym :name} (hooks/resolve {:name sym})]
          (when (symbol? ns-sym)
            (symbol (name ns-sym) (name var-sym))))))))

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
                   (dynamic-redefs-macros (resolved-var (first (:children node)))))
        :let  [[_ bindings] (:children node)]
        :when (hooks/vector-node? bindings)]
    {:vars    (into #{} (keep resolved-var) (take-nth 2 (:children bindings)))
     :symbols (symbols node)}))

(defn- message [sym]
  (str "This captures " sym ", which with-dynamic-fn-redefs redefines below. "
       "After the first run the var holds the proxy, so calling this inside the redef calls the replacement. "
       "Use (mt/original-fn #'" sym ") instead. [:metabase/dynamic-redefs-captured-proxy]"))

(defn lint-let
  "Warn on a captured var that a later `with-dynamic-fn-redefs` redefines while using the capture."
  [{:keys [node]}]
  ;; The macro leaves its proxy on the var, so the binding holds the original only on a test's first run in a JVM.
  ;; Later runs capture the proxy, and calling it while the redef is in scope reaches the replacement.
  ;; Outside the redef, the proxy calls the original, so a capture used only there is fine.
  (let [[_let bindings & body] (:children node)]
    (when (hooks/vector-node? bindings)
      (let [pairs    (partition 2 (:children bindings))
            captures (for [[local init] pairs
                           :let  [v (resolved-var init)]
                           :when (and v (hooks/token-node? local))]
                       {:local (hooks/sexpr local), :init init, :captured v})]
        ;; Only walk the scope when some binding captures a var, which few do.
        (when (seq captures)
          (let [redefs (dynamic-redefs (concat (map second pairs) body))]
            (doseq [{:keys [local init captured]} captures
                    :when                         (some #(and ((:vars %) captured) ((:symbols %) local)) redefs)]
              (hooks/reg-finding!
               (assoc (meta init)
                      :message (message (hooks/sexpr init))
                      :type    :metabase/dynamic-redefs-captured-proxy))))))))
  {:node node})
