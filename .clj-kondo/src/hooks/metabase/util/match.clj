(ns hooks.metabase.util.match
  (:require [clj-kondo.hooks-api :as api]))

(defn- token-node? [node token-name]
  (and (api/token-node? node)
       (= (str (:value node)) token-name)))

(defn- keyword-node? [node k]
  (and (api/keyword-node? node)
       (= (:k node) k)))

(defn- binding-symbol?
  "True when the token is a plain symbol that should be treated as a binding
  (not a keyword, not a boolean literal, not nil, not a number, not `_`)."
  [node]
  (and (api/token-node? node)
       (let [v (:value node)]
         (and (symbol? v)
              (not (contains? '#{_ nil true false} v))))))

;; To establish fake let bindings, we need to bind them to something. This "something" has to be vague enough to trick
;; kondo into not looking too much into it. E.g., if we bind everything to `nil`, Kondo linters will get fired up.
(def opaque-node (api/list-node (list (api/token-node 'rand-nth) (api/list-node []))))

(defn collect-bindings
  "Return a list of token nodes (symbols) introduced as bindings by `pattern`."
  [pattern]
  (cond
    (binding-symbol? pattern)
    [[pattern opaque-node]]

    ;; Lists: (:or ...), (:and ...), (sym :guard pred ...), or a quoted symbol.
    (api/list-node? pattern)
    (let [[head & rst] (:children pattern)]
      (cond (or (keyword-node? head :or)
                (keyword-node? head :and))
            (mapcat collect-bindings rst)

            (api/token-node? head)
            (cond-> []
              (binding-symbol? head) (conj [head opaque-node])
              (keyword-node? (first rst) :guard) (conj [(api/token-node '_) (second rst)]))

            ;; anything else (e.g. a function call used as predicate) — no bindings
            :else []))

    (api/vector-node? pattern)
    (mapcat (fn [node]
              (when-not (token-node? node "&")
                (collect-bindings node)))
            (:children pattern))

    ;; Maps: keys are literal selectors, values are sub-patterns.
    ;; Special value-symbols &truthy and _ are NOT user bindings.
    (api/map-node? pattern)
    (let [children (:children pattern)
          pairs    (partition 2 children)]
      (mapcat (fn [[_k v]]
                (when-not (or (token-node? v "&truthy")
                              (token-node? v "_"))
                  (collect-bindings v)))
              pairs))

    ;; For sets, make sure to use them because they may reference some of the outer local bindings, so if we don't
    ;; include them, Kondo will complain about those bindings being unused.
    (api/set-node? pattern)
    [[(api/token-node '_) pattern]]

    ;; Anything else — no bindings.
    :else []))

(defn- dedupe-bindings
  "Prevent Kondo complaining that we have multiple fake bindings."
  [pairs]
  (loop [[[sym v] & r] pairs, seen #{}, result []]
    (cond (nil? sym) result
          (and (seen sym) (not (token-node? sym "_"))) (recur r seen result)
          :else (recur r (conj seen sym) (conj result sym v)))))

(defn match-one
  "clj-kondo :analyze-call hook for match-one.

  Rewrites

    (match-one value
      pat1 ret1
      pat2 ret2
      ...)

  into a `let` form that declares all binding symbols introduced by the patterns, so clj-kondo knows they are
  legitimate and won't warn about unresolved/unused symbols:

    (let [<all-bindings> (rand-nth []) ...]
      (or ret1 ret2 ...))"
  [{:keys [node]}]
  (let [[_ value & clauses] (:children node)]
    (when (odd? (count clauses))
      (api/reg-finding!
       {:message  "match-one/match-many/replace requires an even number of pattern/result pairs"
        :type     :metabase/match-odd-clauses
        :row      (:row node)
        :col      (:col node)
        :filename (-> node meta :filename)}))
    (let [pairs (partition 2 clauses)
          all-bindings (->> pairs
                            (mapcat (fn [[pat _ret]] (collect-bindings pat)))
                            dedupe-bindings)
          special-bindings [(api/token-node '_)        value
                            (api/token-node '&match)   opaque-node
                            (api/token-node '&parents) opaque-node
                            (api/token-node '&recur)   opaque-node
                            ;; Pretend to use &match, &parents, and &recur so that Kondo doesn't complain about them
                            ;; if they are not used by the user code.
                            (api/token-node '_) (api/token-node '&match)
                            (api/token-node '_) (api/token-node '&parents)
                            (api/token-node '_) (api/token-node '&recur)]
          binding-nodes (into special-bindings all-bindings)
          result-exprs (map second pairs)
          new-node (api/list-node
                    (list
                     (api/token-node 'let)
                     (api/vector-node binding-nodes)
                     (api/list-node
                      (concat [(api/token-node 'clojure.core/or)] result-exprs [opaque-node]))))]
      {:node new-node})))

(def match-many match-one)
(def replace match-one)

(defn replace-in [context]
  ;; Everything is the same as in match-one, just drop the middle argument.
  (match-one (update-in context [:node :children] (fn [[sym value path & clauses]] (list* sym value clauses)))))
