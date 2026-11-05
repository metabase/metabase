(ns hooks.dev.security-lint
  "Hook for `dev.security-lint.rule/defrule`.

  Without it clj-kondo sees an unknown macro and reports the rule name, the context destructuring and every trigger
  symbol as unresolved. The triggers in particular name vars that deliberately may not be on the classpath -- a rule
  can watch for `clj-http.client/get` in a namespace that doesn't require it -- so they are dropped rather than
  resolved."
  (:require
   [clj-kondo.hooks-api :as api]))

(defn defrule
  "Rewrite (defrule name spec [ctx] body...) to (defn name \"doc\" [ctx] body...).

  `defn` rather than `def` + `fn`, and with a docstring, so the expansion doesn't trip the style linters that the
  real macro's output would never have tripped."
  [{:keys [node]}]
  (let [[_ rule-name _spec argvec & body] (:children node)]
    (when (and rule-name argvec)
      {:node (api/list-node
              (list* (api/token-node 'defn)
                     rule-name
                     (api/string-node "Security rule detector.")
                     argvec
                     body))})))
