(ns hooks.clojure.core.let
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn- validated-call-class
  "When `node` is `(metabase.util.validated/validated SomeRecord x)`, the `SomeRecord` symbol; otherwise nil."
  [node]
  (when (hooks/list-node? node)
    (let [[f-node class-node] (:children node)]
      (when (and (hooks/token-node? f-node)
                 (symbol? (hooks/sexpr f-node))
                 (= '{:ns metabase.util.validated, :name validated}
                    (select-keys (hooks/resolve {:name (hooks/sexpr f-node)}) [:ns :name]))
                 (hooks/token-node? class-node))
        (hooks/sexpr class-node)))))

(defn- tag [binding-node]
  (some-> (:meta binding-node) first hooks/sexpr))

(defn- reg! [node message]
  (hooks/reg-finding! (assoc (meta node)
                             :message message
                             :type    :metabase/validated-field-access)))

(defn- sym-node? [sym node]
  (and (hooks/token-node? node) (= sym (hooks/sexpr node))))

(def ^:private key-read-fns
  '#{get get-in select-keys -> ->> clojure.core/get clojure.core/get-in clojure.core/select-keys})

(defn- keyword-reads
  "Nodes in `body` that read `sym` by key: `(:k sym)`, `(get sym ...)`, `(get-in sym ...)`, `(select-keys sym ...)`,
  `(-> sym ...)`, or a map destructuring of `sym` in a nested binding vector."
  [sym body]
  (->> body
       (mapcat #(tree-seq :children :children %))
       (mapcat (fn [node]
                 (cond
                   (hooks/list-node? node)
                   (let [[f-node arg-node] (:children node)]
                     (when (and (sym-node? sym arg-node)
                                (or (hooks/keyword-node? f-node)
                                    (and (hooks/token-node? f-node)
                                         (key-read-fns (hooks/sexpr f-node)))))
                       [node]))

                   (hooks/vector-node? node)
                   (for [[binding-node init-node] (partition 2 (:children node))
                         :when (and (hooks/map-node? binding-node) (sym-node? sym init-node))]
                     binding-node))))))

(defn lint-let
  "A validated record's fields are read with `.-` on a local hinted with its class, so a misspelled field is a
  reflection warning. A keyword read of a misspelled field is a silent nil. So when a `let` binds
  `(validated/validated SomeRecord x)`, the binding must be a symbol hinted `^SomeRecord`, and the body must not read it
  by keyword."
  [{:keys [node], :as input}]
  (let [[_let bindings-node & body] (:children node)]
    (when (hooks/vector-node? bindings-node)
      (doseq [[binding-node init-node] (partition 2 (:children bindings-node))
              :let [record-class (validated-call-class init-node)]
              :when record-class]
        (if-not (and (hooks/token-node? binding-node)
                     (= record-class (tag binding-node)))
          (reg! binding-node (format "Bind a validated record to a local hinted ^%s, and read its fields with .-"
                                     record-class))
          (doseq [read-node (keyword-reads (hooks/sexpr binding-node) body)]
            (reg! read-node (format "Read a validated %s's fields with .-, not by keyword: a misspelled keyword is nil"
                                    record-class)))))))
  input)
