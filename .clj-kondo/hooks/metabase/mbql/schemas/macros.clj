(ns hooks.metabase.mbql.schemas.macros
  (:require [clj-kondo.hooks-api :as hooks]))

(defn defclause
  "e.g.

    (defclause [ag:var var] field-or-expression FieldOrExpressionDef)
    =>
    (def ag:var [FieldOrExpressionDef])

  1. The `clause-name` can be either a plain symbol, or a vector like `[var-name mbql-clause-name]`. For the vector
     form, we are only interested in the `var-name`. For a plain symbol, the two names are the same.

  2. The body is a sequence of <argument-name> <argument-schema> pairs. We can ignore the argument names."
  [{:keys [node]}]
  (let [[_defclause clause-name & arg-specs] (:children node)
        clause-name                          (-> (if (hooks/vector-node? clause-name)
                                                   (first (:children clause-name))
                                                   clause-name)
                                                 (with-meta (meta clause-name)))
        args                                 (mapv second (partition-all 2 arg-specs))
        node'                                 (-> (hooks/list-node
                                                   (list
                                                    (hooks/token-node 'def)
                                                    clause-name
                                                    (hooks/string-node "Docstring.")
                                                    (hooks/vector-node args)))
                                                  (with-meta (meta node)))]
    {:node node'}))

(comment
  (defn- defclause* [form]
    (hooks/sexpr
     (:node
      (defclause
        {:node
         (hooks/parse-string
          (with-out-str
            (clojure.pprint/pprint
             form)))}))))

  (defn- x []
    (defclause* '(defclause [ag:var var]
                   field-or-expression FieldOrExpressionDef)))

  (defn- y []
    (defclause* '(defclause var
                   field-or-expression FieldOrExpressionDef))))
