(ns dev.security-lint.toucan
  "Toucan 2's calling conventions, for the rules that read a Toucan call's arguments.

  `(t2/select-one :model/Card 1)`, `(t2/select-one-fn :name :model/Card 1)`, `(t2/select-fn->fn :id :name
  :model/Card 1)`: the model is the first argument of most calls, but the `-fn` variants take the function or
  functions first, and the model and everything after it shift along. A rule that read argument 1 as the
  pk-or-query read `:model/Card` for the last two and reported nothing there."
  (:require
   [dev.security-lint.ast :as ast]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn model-arg-index
  "The index of the model argument of a Toucan call: 0 for most; 1, past the function, for `select-one-fn`,
  `select-fn-set`, `select-fn-vec` and `select-pk->fn`; 2, past the two functions, for `select-fn->fn`."
  [node]
  (case (some-> (ast/head-sym node) name)
    ("select-one-fn" "select-fn-set" "select-fn-vec" "select-pk->fn") 1
    "select-fn->fn"                                                   2
    0))

(defn target-model
  "The model a Toucan call names, as written: `Card` for `:model/Card` and for `[:model/Card :id :name]`; nil for
  a computed model or a query map."
  [node]
  (let [m (some-> (ast/arg node (model-arg-index node)) ast/unmeta)
        m (if (and (ast/vector-node? m) (seq (ast/children m))) (first (ast/children m)) m)]
    (when (and m (ast/keyword-node? m) (= "model" (namespace (n/sexpr m))))
      (name (n/sexpr m)))))

(defn args-after-model
  "The arguments after the model: the pk-or-query or the keyword conditions, and a write's changes map."
  [node]
  (drop (inc (model-arg-index node)) (ast/args node)))

(defn pk-arg
  "The argument that names the row a Toucan call touches: the one after the model when it is not a keyword -- a
  primary key or a query -- else the value following an `:id` keyword condition. Nil when there is neither."
  [node]
  (let [[a :as args] (args-after-model node)]
    (cond
      (nil? a)                                nil
      (not (ast/keyword-node? (ast/unmeta a))) a
      :else                                   (some (fn [[k v]]
                                                      (let [k (ast/unmeta k)]
                                                        (when (and (ast/keyword-node? k) (= :id (n/sexpr k))) v)))
                                                    (partition 2 args)))))

(def foreign-kinds
  "Origins that are neither the request nor the application database: written by something outside the instance
  altogether -- a parsed document, an HTTP response, warehouse metadata."
  #{:file :external :warehouse})
