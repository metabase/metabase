(ns hooks.metabase.test.data
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(defn dataset [{:keys [node]}]
  (let [[dataset & body] (rest (:children node))]
    {:node (with-meta
             (hooks/list-node
              (list*
               (hooks/token-node 'clojure.test/testing)
               (hooks/string-node (str dataset))
               body))
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
