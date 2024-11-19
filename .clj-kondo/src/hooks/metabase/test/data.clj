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

(defn- local-def?
  [ns* sexpr]
  (= ns* (:ns (hooks/resolve {:name sexpr}))))

(defn- dataset-type
  "`dataset` can be one of:

  - a qualified symbol
  - an unqualified symbol referring to a a var in [[metabase.test.data.dataset-definitions]]
  - an unqualified symbol (referring to a let-bound value or a var in the current namespace
  - some sort of non-symbol form like a function call

  We can only determine if an unqualified symbol refers to something in the dataset definitions namespace if there are
  cached results available from [[global-dataset-symbols]]."
  [this-ns dataset]
  (let [sexpr       (hooks/sexpr dataset)
        global-defs (global-dataset-symbols)]
    (cond
      (not (symbol? sexpr))
      :non-symbol

      (namespace sexpr)
      :qualified

      (contains? global-defs sexpr)
      :unqualified/from-dataset-defs-namespace

      (local-def? this-ns sexpr)
      :unqualified/local-def

      :else
      :unqualified/unknown)))

(defn dataset
  [{{[_ dataset & body] :children} :node this-ns :ns}]
  (let [noop (constantly nil)
        body (case (dataset-type this-ns dataset)
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
               ;; and generate a `print` form:
               ;;
               ;;    (print ...)
               ;;
               ;; (this used to be a `do` form (which makes a lot more semantic sense), but that resulted in warnings
               ;; about unused values
               (:unqualified/from-dataset-defs-namespace :unqualified/unknown)
               (list* (hooks/token-node noop)
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

(defn replace-$id-special-tokens
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
  [{{[_ & args] :children} :node}]
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
  [{{[_ & args] :children} :node}]
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
  (let [[table query] (if (= (count args) 1)
                        [(first args)
                         (hooks/map-node [])]
                        args)]
    (when-not ((some-fn symbol? nil?) (hooks/sexpr table))
      (hooks/reg-finding! (assoc (meta table)
                                 :message "First arg to mbql-query should be either a table name symbol or nil."
                                 :type :metabase/mbql-query-first-arg)))
    (let [result (replace-$id-special-tokens query)
          ;; HACK I'm not sure WHY it works but I ran into https://github.com/clj-kondo/clj-kondo/issues/1773 when
          ;; trying to get this working -- for some magical reason wrapping the whole thing in a `do` form seems to fix
          ;; it. Once that bug is resolved we can go ahead and remove this line
          result (with-meta (hooks/list-node (with-meta (list
                                                         (hooks/token-node 'do)
                                                         result)
                                                        (meta query)))
                            (meta query))]
      {:node result})))
