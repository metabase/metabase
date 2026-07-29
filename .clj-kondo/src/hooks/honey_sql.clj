(ns hooks.honey-sql
  "Linters for literal HoneySQL forms embedded in Clojure code."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common]))

(def ^:private subquery-map-keys
  "Map keys that mark a literal HoneySQL map as a subquery."
  #{:select :select-distinct :union :union-all :from :with})

(defn- subquery-node? [node]
  (and (hooks/map-node? node)
       (boolean (some (fn [k]
                        (and (hooks/keyword-node? k)
                             (contains? subquery-map-keys (hooks/sexpr k))))
                      (take-nth 2 (:children node))))))

(defn- in-with-subquery? [node]
  (and (hooks/vector-node? node)
       (let [[op & args] (:children node)]
         (boolean (and op
                       (hooks/keyword-node? op)
                       (contains? #{:in :not-in} (hooks/sexpr op))
                       (some subquery-node? args))))))

(defn lint-in-subquery
  "Register a `:metabase/honeysql-in-subquery` finding for every literal `[:in ... {subquery}]` or
  `[:not-in ... {subquery}]` vector under `node`, and return `node` unchanged. Postgres degrades an IN-subselect to
  an O(n^2) subplan once the id set outgrows work_mem in non-unnestable contexts (under OR, or NOT IN), so use a
  correlated `[:exists ...]` / `[:not [:exists ...]]` or a join against the subquery instead. Only literal map
  subqueries are detected; subqueries built elsewhere and passed by name are not. Runs on the bodies of `def`,
  `defn`, `defn-`, `defmethod` (clojure.core and methodical), `defmulti`, and `defenterprise` forms."
  [node]
  (letfn [(walk! [n ignored]
            (let [ignored (into ignored (hooks.common/ignored-linters n))]
              (when (and (in-with-subquery? n)
                         (not (contains? ignored :metabase/honeysql-in-subquery)))
                (hooks/reg-finding!
                 (assoc (meta n)
                        :message (str "Use a correlated [:exists ...] or a join instead of IN with a subquery: "
                                      "Postgres degrades it to an O(n^2) subplan past work_mem in non-unnestable "
                                      "contexts. [:metabase/honeysql-in-subquery]")
                        :type :metabase/honeysql-in-subquery)))
              ;; an ignore hint sometimes attaches to the node BEFORE the one it should cover (a map key, or a
              ;; kv-arg keyword), so hints on a node also cover its immediately following sibling
              (reduce (fn [sibling-hints child]
                        (walk! child (into ignored sibling-hints))
                        (set (hooks.common/ignored-linters child)))
                      #{}
                      (:children n))))]
    (walk! node #{}))
  node)
