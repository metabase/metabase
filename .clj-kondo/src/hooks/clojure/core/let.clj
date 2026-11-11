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

(defn- redefined-vars
  "The vars that a `with-dynamic-fn-redefs` anywhere in `nodes` redefines."
  [nodes]
  (into #{}
        (comp (mapcat #(tree-seq :children :children %))
              (filter hooks/list-node?)
              (filter #(dynamic-redefs-macros (resolved-var (first (:children %)))))
              (keep #(second (:children %)))
              (filter hooks/vector-node?)
              (mapcat #(take-nth 2 (:children %)))
              (keep resolved-var))
        nodes))

(defn lint-let
  "Flag a `let` binding that captures a var which a `with-dynamic-fn-redefs` in the `let` body redefines.

   `with-dynamic-fn-redefs` leaves its proxy on the var. The first time a test runs, the binding captures the original
   function. On any later run in the same JVM, it captures the proxy, so a replacement that calls the binding calls
   itself until the proxy's depth guard throws. `(mt/original-fn #'the/var)` returns the original on every run."
  [{:keys [node lang]}]
  (let [[_let bindings & body] (:children node)]
    ;; `with-dynamic-fn-redefs` is clj-only.
    (when (and (= :clj lang) (hooks/vector-node? bindings))
      (let [pairs (partition 2 (:children bindings))]
        ;; Only walk the body when some binding captures a var, which few do.
        (when-let [captures (seq (keep (fn [[_ init]]
                                         (when-let [v (resolved-var init)]
                                           [init v]))
                                       pairs))]
          (let [redefined (redefined-vars (concat (map second pairs) body))]
            (doseq [[init v] captures
                    :when (redefined v)
                    :let  [sym (hooks/sexpr init)]]
              (hooks/reg-finding!
               (assoc (meta init)
                      :message (str "This captures " sym ", which with-dynamic-fn-redefs redefines below. After the first "
                                    "run the var holds the proxy, so a replacement that calls this recurses. Use "
                                    "(mt/original-fn #'" sym ") instead. [:metabase/dynamic-redefs-captured-proxy]")
                      :type    :metabase/dynamic-redefs-captured-proxy))))))))
  {:node node})
