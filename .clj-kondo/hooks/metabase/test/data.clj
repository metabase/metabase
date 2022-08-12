(ns hooks.metabase.test.data
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(defn- global-dataset-symbols
  "Dataset definitions defined in [[metabase.test.data.dataset-definitions]]. This is only populated if clj-kondo has
  cached analysis for that namespace -- so it may or may not be populated. If it is populated we can do a bit of extra
  linting with that information."
  []
  (not-empty (set (keys (:clj (hooks/ns-analysis 'metabase.test.data.dataset-definitions))))))

(defn- dataset-type
  "`dataset` can be one of:

  - a qualified symbol
  - an unqualified symbol referring to a a var in [[metabase.test.data.dataset-definitions]]
  - an unqualified symbol (referring to a let-bound value or a var in the current namespace
  - some sort of non-symbol form like a function call

  We can only determine if an unqualified symbol refers to something in the dataset definitions namespace if there are
  cached results available from [[global-dataset-symbols]]."
  [dataset]
  (let [sexpr       (hooks/sexpr dataset)
        global-defs (global-dataset-symbols)]
    (cond
      (not (symbol? sexpr))
      :non-symbol

      (namespace sexpr)
      :qualified

      (empty? global-defs)
      :unqualified/unknown

      (contains? global-defs sexpr)
      :unqualified/from-dataset-defs-namespace

      ;; either something defined in the current namespace or let-bound in the current scope.
      :else
      :unqualified/local-def)))

(defn dataset
  [{{[_ dataset & body] :children, :as node} :node}]
  (let [body (case (dataset-type dataset)
               ;; non-symbol, qualified symbols, and unqualified symbols from the current namespace/let-bound can all
               ;; get converted from something like
               ;;
               ;;    (dataset whatever
               ;;      ...)
               ;;
               ;; to
               ;;
               ;;    (let [_ whatever]
               ;;      ...)
               (:non-symbol :qualified :unqualified/local-def)
               (list* (hooks/token-node 'let)
                      (hooks/vector-node [(hooks/token-node '_) dataset])
                      body)

               ;; for ones that came from the dataset defs namespace or ones whose origin is unknown, just ignore them
               ;; and generate a `do` form:
               ;;
               ;;    (do ...)
               (:unqualified/from-dataset-defs-namespace :unqualified/unknown)
               (list* (hooks/token-node 'do)
                      body))]
    {:node (with-meta (hooks/list-node (with-meta body
                                                  (meta dataset)))
                      (meta dataset))}))

(defn- special-token-node?
  "Whether this node is one of the special symbols like `$field`."
  [node]
  (when (hooks/token-node? node)
    (let [symb (hooks/sexpr node)]
      (and (symbol? symb)
           (some (partial str/starts-with? symb)
                 #{"$" "!" "&" "*" "%"})
           ;; ignore args like `%` or `%1` inside function literals. $id forms have to be more than one character long,
           ;; and the first character won't be a number (hopefully -- maybe some DBs allow this -- but we don't use it)
           (> (count (str symb)) 1)
           (not (re-find #"^%\d+" (str symb)))))))

(defn- replace-$id-special-tokens
  "Impl for [[$ids]] and [[mbql-query]]. Walk `form` and look for special tokens like `$field` and replace them with
  strings so we don't get unresolved symbol errors. Preserves metadata."
  [form]
  ;; [[walk/postwalk]] seems to preserve its meta so we don't need to do anything special
  (walk/postwalk
   (fn [node]
     (if (special-token-node? node)
       (-> (hooks/string-node (str (hooks/sexpr node)))
           (with-meta (meta node)))
       node))
   form))

(defn $ids
  [{{[_$ids & args] :children} :node}]
  ;; `$ids` accepts either
  ;;
  ;;    ($ids form)
  ;;
  ;; or
  ;;
  ;;    ($ids table & body)
  ;;
  ;; table is only relevant for expanding the special tokens so we can ignore it.
  (let [body (if (= (count args) 1)
               (first args)
               (hooks/list-node
                (list*
                 (hooks/token-node `do)
                 (rest args))))]
    {:node (replace-$id-special-tokens body)}))

(defn mbql-query
[{{[_mbql-query & args] :children} :node}]
(binding [*print-meta* true])
  ;; `mbql-query` accepts either
  ;;
  ;;    (mbql-query table)
  ;;
  ;; or
  ;;
  ;;    (mbql-query table query)
  ;;
  ;; and table may be `nil`.
  ;;
  ;; table is only relevant for expanding the special tokens so we can ignore it either way.
(let [query (if (= (count args) 1)
              (hooks/map-node [])
              (second args))]
  {:node (replace-$id-special-tokens query)}))
