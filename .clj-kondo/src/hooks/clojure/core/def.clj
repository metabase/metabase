(ns hooks.clojure.core.def
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- uppercase-name?
  "Whether the symbol is clearly an uppercase name like `TYPE-CONSTANTS` or `SOME_CONSTANT` or `TYPE->MODEL`."
  [s]
  (and (re-find #"[A-Z0-9]+(?:[-_]>?[A-Z0-9]+)+" s)
       ;; ignore stuff like `->SCREAMING_SNAKE_CASE`... this is ok
       (not (str/includes? s "SCREAMING_SNAKE_CASE"))))

(defn- has-underscores? [s]
  (and (str/includes? s "_")
       ;; ignore stuff like `->snake_case` and `->SCREAMING_SNAKE_CASE`
       (not (str/includes? s "snake_case"))
       (not (str/includes? s "SCREAMING_SNAKE_CASE"))))

(defn-  check-symbol-is-kebab-case [symbol-node]
  (let [symb (hooks/sexpr symbol-node)
        s    (str symb)]
    (cond
      (uppercase-name? s)
      (hooks/reg-finding!
       (assoc (meta symbol-node)
              :message "Use lower-case names for functions and variables; don't use special notation for constants. [:metabase/check-def-check-not-all-uppercase]"
              :type    :metabase/check-def-check-not-uppercase-name))

      (has-underscores? s)
      (hooks/reg-finding!
       (assoc (meta symbol-node)
              :message "Use kebab-case names for functions and variables. [:metabase/check-def-no-underscores]"
              :type    :metabase/check-def-no-underscores)))))

(defn- attr-map
  "The attr-map of a `defn`-like form, which Clojure merges into the var metadata, or nil.
  A map in a `def` or `defonce` is the value, not an attr-map."
  [node]
  (let [[head _name & args] (:children node)]
    (when-not (#{"def" "defonce"} (name (hooks/sexpr head)))
      (loop [[arg & more :as args] args]
        (cond
          (hooks/string-node? arg)                                  (recur more)
          ;; a Malli `:- schema` return annotation
          (and (hooks/keyword-node? arg) (= :- (hooks/sexpr arg))) (recur (rest more))
          (hooks/map-node? arg)                                     (hooks/sexpr arg)
          ;; a multi-arity body can end with a trailing attr-map
          (hooks/list-node? arg)                                    (let [trailing (last args)]
                                                                      (when (hooks/map-node? trailing)
                                                                        (hooks/sexpr trailing))))))))

(defn- dynamic?
  "Whether the var defined by `def-node` is dynamic, through metadata on `symbol-node` or a `defn` attr-map."
  [def-node symbol-node]
  (or (some (fn [meta-node]
              (let [m (hooks/sexpr meta-node)]
                (or (= m :dynamic)
                    (and (map? m) (true? (:dynamic m))))))
            (:meta symbol-node))
      (true? (:dynamic (attr-map def-node)))))

(defn- check-symbol-is-not-dynamic [def-node symbol-node]
  (when (dynamic? def-node symbol-node)
    ;; Report on the form, not the name: `kondo-insert-ignores` puts the ignore on the line above the finding,
    ;; and the line above the name can be inside the form, where an ignore has no effect.
    (hooks/reg-finding!
     (assoc (meta def-node)
            :message "Avoid new dynamic vars; pass the value as an argument or hang it on a stateful component. [:metabase/discourage-dynamic-vars]"
            :type    :metabase/discourage-dynamic-vars))))

(defn- name-symbol [node]
  (let [[_def & args] (:children node)]
    (some (fn [arg]
            (when (and (hooks/token-node? arg)
                       (symbol? (hooks/sexpr arg)))
              arg))
          args)))

(defn lint-def* [{:keys [node]}]
  (let [symbol-node (name-symbol node)]
    (check-symbol-is-kebab-case symbol-node)
    (check-symbol-is-not-dynamic node symbol-node)))

(defn lint-dynamic
  "Hook for def-like macros that should get only the dynamic-var check. Leaves the node unchanged."
  [{:keys [node]}]
  (check-symbol-is-not-dynamic node (name-symbol node))
  nil)

(defn lint-def [x]
  (lint-def* x)
  x)

(comment
  (defn x []
    (let [node (-> "(def ^:private TYPE->MODEL {\"document\" :model/Document})"
                   hooks/parse-string)]
      (lint-def {:node node}))))
