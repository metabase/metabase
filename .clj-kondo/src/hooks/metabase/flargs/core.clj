(ns hooks.metabase.flargs.core
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(defn defflarg
  "Hook for [[metabase.flargs.core/defflarg]]. The macro shape is:

    (defflarg fn-name docstring flarg-key flarg-ns arglist & body)

  We rewrite to:

    (let [_flarg-key flarg-key]
      (defn fn-name docstring arglist & body))

  so that kondo:

    - sees a function definition with the given name, docstring, arglist, and body;
    - treats `flarg-key` as a referenced value (no unused warnings);
    - performs normal arity checking at call sites based on `arglist`.

  `flarg-ns` is dropped from the expansion entirely because it is a bare namespace
  symbol -- not something kondo can resolve as a var -- and appearing in the output
  would produce a spurious unresolved-symbol error. This mirrors how
  [[hooks.metabase.premium-features.defenterprise/defenterprise]] discards its
  enterprise-namespace positional arg."
  [{node :node}]
  (let [[_defflarg fn-name docstring flarg-key _flarg-ns & fn-tail] (:children node)]
    {:node (hooks/list-node
            (list
             (hooks/token-node 'let)
             (hooks/vector-node
              [(hooks/token-node '_flarg-key) flarg-key])
             (-> (hooks/list-node
                  (concat
                   (filter some?
                           (list (hooks/token-node 'defn)
                                 fn-name
                                 docstring))
                   fn-tail))
                 (with-meta (meta node))
                 hooks.common/add-lsp-ignore-unused-public-var-metadata)))}))

(comment
  ;; Dev helper: pass a string form through the hook to see what it rewrites to.
  (defn- defflarg* [form-str]
    (hooks/sexpr
     (:node
      (defflarg {:node (hooks/parse-string form-str)}))))

  (defflarg*
    "(defflarg test-fn \"Default: returns :default.\" :flarg/test-flarg metabase.flarg.test-flarg.core [] :default)"))
