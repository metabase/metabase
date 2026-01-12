(ns hooks.metabase.legacy-mbql.schemas.macros
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- unwrap-defclause-clause-name
  "The `clause-name-form` can be either a plain symbol, or a vector like `[var-name mbql-clause-name]`. For the vector
  form, we are only interested in the `var-name`. For a plain symbol, the two names are the same. Return a token node."
  [clause-name-form]
  (-> (if (hooks/vector-node? clause-name-form)
        (first (:children clause-name-form))
        clause-name-form)
      (with-meta (meta clause-name-form))))

(defn- collect-defclause-body-schemas
  "Collect the argument schemas in the body of a `defclause` form into a vector node.

  The body is a sequence of <argument-name> <argument-schema> pairs. We can ignore the argument names.

  <argument-schema> can optionally be wrapped be `(optional ...)` or `(rest ...)`... we can ignore these."
  [arg-specs]
  (hooks/vector-node
   (for [[_arg-name arg-schema] (partition-all 2 arg-specs)
         :let                   [arg-schema (if (and (hooks/list-node? arg-schema)
                                                     ('#{optional rest} (hooks/sexpr (first (:children arg-schema)))))
                                              (-> (second (:children arg-schema))
                                                  (with-meta (meta arg-schema)))
                                              arg-schema)]]
     arg-schema)))

(defn defclause
  "e.g.

    (defclause [ag:var var] field-or-expression FieldOrExpressionDef)
    =>
    (def ag:var [FieldOrExpressionDef])"
  [{:keys [node], :as x}]
  (let [[_defclause clause-name & arg-specs] (:children node)]
    (assoc x :node (-> (hooks/list-node
                        (list
                         (hooks/token-node 'do)
                         (-> (hooks/keyword-node (keyword "metabase.legacy-mbql.schema" (name (hooks/sexpr clause-name))))
                             (with-meta (meta clause-name))
                             (hooks/reg-keyword! 'metabase.legacy-mbql.schemas.macros/defclause))
                         (collect-defclause-body-schemas arg-specs)))
                       (with-meta (meta node))))))

(defn defclause*
  "e.g.

    (defclause [ag:var var] field-or-expression FieldOrExpressionDef)
    =>
    (def ag:var [FieldOrExpressionDef])"
  [{:keys [node], :as x}]
  (let [[_defclause clause-name schema] (:children node)]
    (assoc x :node (-> (hooks/list-node
                        (list
                         (hooks/token-node 'do)
                         (-> (hooks/keyword-node (keyword "metabase.legacy-mbql.schema" (name (hooks/sexpr clause-name))))
                             (with-meta (meta clause-name))
                             (hooks/reg-keyword! 'metabase.legacy-mbql.schemas.macros/defclause*))
                         schema))
                       (with-meta (meta node))))))

(comment
  (defn- expand-defclause [form]
    (hooks/sexpr
     (:node
      (defclause
        {:node
         (hooks/parse-string
          (with-out-str
            (clojure.pprint/pprint
             form)))}))))

  (defn- x []
    (expand-defclause '(defclause var
                         field-or-expression FieldOrExpressionDef)))
  ;; =>
  (do :metabase.legacy-mbql.schema/var [FieldOrExpressionDef])

  (defn- y []
    (expand-defclause '(defclause var
                         x (some-list-schema)
                         y (optional FieldOrExpressionDef)
                         z (rest (some-other-schema)))))
  ;; =>
  (do :metabase.legacy-mbql.schema/var [(some-list-schema) FieldOrExpressionDef (some-other-schema)]))

(defn one-of [{:keys [node], :as x}]
  (let [[_one-of & schema-nodes] (:children node)
        node' (-> (hooks/vector-node
                   (mapv (fn [schema-node]
                           (if (and (hooks/token-node? schema-node)
                                    (simple-symbol? (hooks/sexpr schema-node)))
                             (-> (hooks/keyword-node (keyword "mteabase.legacy-mbql.schema" (name (hooks/sexpr schema-node))))
                                 (with-meta (meta schema-node)))
                             schema-node))
                         schema-nodes))
                  (with-meta (meta node)))]
    (assoc x :node node')))

(comment
  (defn- expand-one-of [form]
    (hooks/sexpr (:node (one-of {:node (hooks/parse-string (with-out-str (clojure.pprint/pprint form)))}))))

  (defn- z []
    (expand-one-of '(one-of absolute-datetime relative-datetime time))))
