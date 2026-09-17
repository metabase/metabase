(ns dev.security-lint.callgraph
  "Interprocedural taint propagation.

  Taint that stops at a function boundary is nearly useless in this codebase: API handlers delegate to helper
  namespaces, so a request value is typically two or three calls away from the sink it reaches. Sourcing taint at
  the boundary without propagating it takes the injection rules to zero findings while real ones remain.

  The propagation works over *regions* rather than syntax trees. clj-kondo already reports every local binding and
  every use of one, with positions and a shared id; all this namespace needs from the source is where the
  interesting regions are -- a parameter slot, a binding's init expression, a call argument. Asking \"does a
  tainted value appear in this region\" is then a position lookup, and the parsed trees can be discarded as soon as
  the regions are extracted, which keeps a whole-codebase run in reasonable memory."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [metabase.util :as u]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- regions ---------------------------------------------------

(defn within?
  "Whether [row col] falls inside `region`. See [[dev.security-lint.ast/within?]], of which this is an alias for
  the engine and the rules that reach it through this namespace."
  [region r c]
  (ast/within? region r c))

(def ^:private defn-names #{"defn" "defn-" "defmethod" "defenterprise" "defenterprise-schema"})

(defn- defn-head?
  "Whether `head` defines a function -- `defn`, `defn-`, `defmethod`, or the `mu/` (metabase.util.malli) variants.

  Matching by name rather than by symbol is what makes the 2,400 `mu/defn`s in this codebase visible to the graph
  at all. With only the bare forms recognized, taint never entered them and reachability stopped at each one.
  `defenterprise` defines a function too -- 273 of them -- with the EE implementation living under the same name
  in the namespace the form names; see [[extract]] for the edge that models that."
  [head]
  (boolean (and (symbol? head) (contains? defn-names (name head)))))
(def ^:private request-param-names vocab/request-param-names)

(def ^:private ring-request-keys vocab/ring-request-keys)

(defn- request-destructuring?
  "Whether `slot` destructures a Ring request map."
  [slot]
  (boolean
   (when (ast/map-node? slot)
     (when-let [ks (ast/map-get slot :keys)]
       (some #(contains? ring-request-keys (ast/->str %)) (ast/children ks))))))

(def ^:private fn-heads '#{fn fn*})

(def ^:private validator-heads vocab/validators)

(def ^:private guard-heads
  "Conditionals with a test and a branch that runs only when the test passed.

  `when-not` is deliberately absent: its body runs when the check *failed*, so vouching for it would retire the
  findings in exactly the unvalidated path. `assert` has no body of its own."
  '#{when if if-not})

(defn- guarded-forms
  "The forms a guard protects: everything after the test for `when`; only the then-branch for `if` and only the
  else-branch for `if-not`. Both branches of an `if` were once covered, which vouched for the failure path."
  [head-name args]
  ;; `args` is the whole argument list, test included, so branch positions are absolute
  (case head-name
    "when"   (rest args)
    "if"     (some-> (nth args 1 nil) vector)
    "if-not" (some-> (nth args 2 nil) vector)
    nil))

(defn- superuser-test?
  "Whether a conditional's test is the session's superuser flag: `superuser?` destructured from the request's
  `:is-superuser?`, `api/*is-superuser?*`, `(:is-superuser? request)`, or one of those under `and`."
  [test]
  (let [test (ast/unmeta test)]
    (boolean
     (cond
       (ast/symbol-node? test) (re-find #"^\*?is-superuser\?\*?$|^superuser\?$" (name (n/sexpr test)))
       (ast/call? test)        (let [head (ast/head-sym test)]
                                 (cond
                                   (= 'and head)                (some superuser-test? (ast/args test))
                                   (ast/keyword-node? (first (ast/children test)))
                                   (= :is-superuser? (n/sexpr (first (ast/children test))))
                                   :else                        false))
       :else                   false))))

(defn- positive-checks
  "The validator calls a test *positively* applies.

  A validator directly as the test, or under `and`, checks its argument. Under `not` it is a blocklist, and under
  `or` it may not have run at all -- neither vouches for anything. Only the validator's own arguments are checked,
  so `(and (contains? formats fmt) (seq path))` vouches for `fmt`, never for `path`."
  [test]
  (let [test (ast/unmeta test)
        head (ast/head-sym test)]
    (cond
      (contains? validator-heads head) [test]
      (= 'and head)                    (mapcat positive-checks (ast/args test))
      :else                            [])))

(defn- throwing-guard-checks
  "The validator calls a *throwing guard* applies: `(when-not (contains? allowed unit) (throw ...))`, a statement
  whose body is nothing but a throw. `when-not` vouches for no branch of its own -- its body runs when the check
  failed -- but when that body only throws, the forms after the statement run only when the check passed, so the
  statement is an assertion, like a named `validate-url!`: an allow-list check ahead of `(name unit)`. A `when-not`
  that logs and carries on vouches for nothing."
  [node]
  (let [node (ast/unmeta node)
        args (ast/args node)]
    (when (and (ast/call? node)
               (= 'when-not (some-> (ast/head-sym node) name symbol))
               (= 2 (count args))
               (= 'throw (some-> (second args) ast/unmeta ast/head-sym name symbol)))
      (seq (positive-checks (first args))))))

(def ^:private threading-heads vocab/threading-slots)

(declare binding-ids-in-region)

(defn- arglists
  "Every parameter vector of a `defn` form.

  One for a single-arity fn; for a multi-arity fn each body is `([params] & forms)`, so the vectors live one level
  down. Returning all of them means taint reaches a helper however many arities it has."
  [args]
  (let [args (map ast/unmeta args)
        ;; `(mu/defn f :- Schema [x] ...)`: the return schema sits where the arglist would otherwise be found, and
        ;; is itself often a vector, so it has to be stepped over rather than filtered by shape
        args (loop [[a & more] args, out []]
               (cond
                 (nil? a)               out
                 (= ":-" (ast/->str a)) (recur (next more) out)
                 :else                  (recur more (conj out a))))]
    (if-let [v (first (filter ast/vector-node? args))]
      [v]
      (keep (fn [body]
              (when (ast/call? body)
                (first (filter ast/vector-node? (map ast/unmeta (ast/children body))))))
            args))))

(def ^:private tail-through
  "Forms whose value is the value of one of their children: the tail positions to look through for what a
  function returns. `let` and friends return their last form; `if` either branch; `when` its last form or nil."
  '#{let let* when when-not when-let when-some if-let if-some do binding with-open locking
     if if-not cond condp case try prog1})

(defn- tail-forms
  "The forms whose value a body form evaluates to, looking through the [[tail-through]] heads: for
  `(let [x ...] (f) (g x))` the `(g x)`; for `(if a b c)` both `b` and `c`. Any other form is its own tail --
  a threading form included, since its value is what its last step returns and the whole form holds every step."
  [node]
  (let [node (ast/unmeta node)
        head (ast/head-sym node)]
    (if (and head (or (contains? tail-through (symbol (name head)))
                      ;; `with-quoting`, `with-transaction`, `with-redefs`: a body whose last form is the value
                      (str/starts-with? (name head) "with-")))
      (let [args (ast/args node)]
        (case (name head)
          ("if" "if-not") (mapcat tail-forms (rest args))
          ;; `(if-let [x init] then else)`: both branches, not the binding vector
          ("if-let" "if-some") (mapcat tail-forms (rest args))
          "cond"          (mapcat tail-forms (take-nth 2 (rest args)))
          ;; `(condp = x a ra b rb default)`: every result, and the default when the count is odd
          "condp"         (let [clauses (drop 2 args)]
                            (mapcat tail-forms (concat (take-nth 2 (rest clauses))
                                                       (when (odd? (count clauses)) [(last clauses)]))))
          "case"          (let [clauses (rest args)]
                            (mapcat tail-forms (concat (take-nth 2 (rest clauses))
                                                       (when (odd? (count clauses)) [(last clauses)]))))
          "try"           (mapcat tail-forms (remove #(contains? #{'catch 'finally} (ast/head-sym %)) args))
          "prog1"         (if-let [f (first args)] (tail-forms f) [])
          (if-let [t (last args)] (tail-forms t) [])))
      [node])))

(defn- tail-head
  "The call that produces a tail form's value, as `{:head sym :pos {:row :col}}`: the form's own head, or for a
  thread the head of its last step, and through `first` -- `(first (sql/format ...))` is the formatted string.
  Nil when the tail is not a call. The position is where clj-kondo reports the call, so the head can be resolved."
  [node]
  (let [node (ast/unmeta node)
        head (ast/head-sym node)]
    (cond
      (nil? head) nil
      (contains? vocab/value-threads head)
      (when-let [step (some-> (last (ast/args node)) ast/unmeta)]
        (if (ast/symbol-node? step)
          {:head (n/sexpr step) :pos (select-keys (meta step) [:row :col])}
          (tail-head step)))
      (= "first" (name head))
      (when-let [a (first (ast/args node))] (tail-head a))
      :else {:head head :pos (select-keys (meta node) [:row :col])})))

(defn- bodies
  "The body forms of a `defn` form, per arity: for a single arity everything after the parameter vector, for a
  multi-arity fn everything after each `([params] ...)`'s vector. The docstring and any `:-` return schema are
  skipped with the rest of the preamble."
  [args]
  (let [args (map ast/unmeta args)]
    (if-let [i (first (keep-indexed (fn [i a] (when (ast/vector-node? a) i)) args))]
      [(drop (inc i) args)]
      (for [body args
            :when (ast/call? body)
            :let  [cs (map ast/unmeta (ast/children body))
                   i  (first (keep-indexed (fn [i a] (when (ast/vector-node? a) i)) cs))]
            :when i]
        (drop (inc i) cs)))))

(defn- arglist
  "The first parameter vector of a `defn` form."
  [args]
  (first (arglists args)))

(def ^:private higher-order-heads vocab/higher-order-fns)

(defn- thread-target
  "The function a threading step names: `h` in `(-> x h)` and in `(-> x (h 1))`."
  [step]
  ;; `(map)` with no arguments hands us nil; without this guard `(n/tag nil)` throws and takes the scan with it
  (when-let [step (some-> step ast/unmeta)]
    (cond
      (ast/symbol-node? step) (n/sexpr step)
      (ast/call? step)        (ast/head-sym step)
      :else                   nil)))

(def ^:private shape-keeping-heads
  "Calls whose value has the keys of their first argument: `(assoc m :x 1)` sets a key the code named."
  #{"assoc" "dissoc" "update" "assoc-in" "update-in" "with-meta" "vary-meta"})

(def ^:private collection-keeping-heads
  "Calls whose value is a collection of the same elements as their last argument, so a sequence of rows keeps
  its rows' shape through them."
  #{"vec" "seq" "doall" "set" "distinct" "reverse" "sort" "sort-by" "take" "drop" "filter" "filterv" "remove"
    "partition-all" "partition" "take-while" "drop-while" "shuffle" "not-empty"})

(def ^:private element-mapping-heads
  "Calls whose value is a collection of what their first argument, a function, returns."
  #{"map" "mapv" "keep" "mapcat" "pmap"})

(defn- arg-shape
  "How the *keys* of an argument were chosen, as a term [[param-shapes]] resolves once the graph is known:

    :keyed              `(select-keys x [:a :b])`, a vector of keywords
    {:literal {k term}} a map literal with keyword keys, each value's term kept for what it holds under the key
    :opaque             `{k v}`, whose key is a value; anything not understood
    nil                 a scalar literal: no map at all
    {:ref {...}}        a local, or a call to a function -- the local's shape, or the function's return shape
    {:all [term ...]}   keyed when every term is: `(merge a b)`, the branches of an `if`, a `concat`
    {:map-vals term}    a map, or a sequence of `[k v]` pairs, whose *values* have the term: what `u/for-map`
                        and `(into {} (for ... [k v]))` build. Its own keys are values, so handed on whole it is
                        opaque; taken apart it is not
    {:vals-of term}     the values of such a map: `(vals m)`, the `v` of a `[k v]` destructured off it in a
                        `for` or a `doseq`

  A form that keeps a map's keys -- `assoc`, a threading form, a `let` -- has its input's term; a collection of
  maps has its element's: the body of a `for`, the function `map` applies, what a named row-builder returns.
  What a parameter received from every caller, as labels `:shape/keyed` and `:shape/opaque`, is what a rule
  about a map's keys asks."
  [filename a]
  (let [a    (ast/unmeta a)
        term (partial arg-shape filename)
        ref  (fn [node head] {:ref {:filename filename :row (:row (meta node)) :col (:col (meta node)) :head head}})
        all  (fn [nodes]
               (let [ts (remove nil? (map term nodes))]
                 (cond (empty? ts)        nil
                       (= 1 (count ts))   (first ts)
                       :else              {:all (vec ts)})))
        ;; `[k v]` as the body of a `for`-like form: a map from the k's to the v's, once collected
        pair (fn [body]
               (let [body (some-> body ast/unmeta)]
                 (if (and body (ast/vector-node? body) (= 2 (count (ast/children body))))
                   {:map-vals (term (second (ast/children body)))}
                   :opaque)))
        ;; what the function `map`, `keep` or `mapcat` applies returns: the element of the result
        element (fn [f]
                  (let [f (some-> f ast/unmeta)]
                    (cond
                      ;; `(fn [x] {...})`: its body's tails
                      (and (ast/call? f) (= "fn" (some-> (ast/head-sym f) name)))
                      (all (some-> (last (ast/args f)) tail-forms))
                      ;; `#(row %)`: the fn literal reads as a call to `row`, which is the element
                      (and f (= :fn (n/tag f)))
                      (term f)
                      ;; `row`: the function by name -- its return shape; a local holding a function is opaque
                      (and f (ast/symbol-node? f))
                      (ref f (n/sexpr f))
                      :else :opaque)))
        ;; one `->>` step applied to what came before it: `(map f)` is `f`'s element, `(filter p)` keeps the
        ;; rows, `(concat more)` adds rows, anything else is not understood
        thread-last (fn [acc step]
                      (let [step (some-> step ast/unmeta)
                            head (cond (ast/symbol-node? step) (n/sexpr step) (ast/call? step) (ast/head-sym step))
                            nm   (some-> head name)
                            args (if (ast/call? step) (ast/args step) [])]
                        (cond
                          (nil? nm)                                     :opaque
                          (contains? element-mapping-heads nm)          (element (first args))
                          (contains? collection-keeping-heads nm)       acc
                          (= nm "into")                                 acc
                          (= nm "concat")                               (all (cons acc (map term args)))
                          :else                                         :opaque)))]
    (cond
      (ast/literal? a)
      nil

      ;; a map literal with keyword keys is keyed, and keeps its entries: what it holds under a key, and that it
      ;; holds nothing under the others
      (ast/map-node? a)
      (if (every? (fn [[k _]] (ast/keyword-node? (ast/unmeta k))) (ast/map-entries a))
        {:literal (into {} (for [[k v] (ast/map-entries a)] [(n/sexpr (ast/unmeta k)) (term v)]))}
        :opaque)

      ;; `[{:a 1} {:b 2}]`: a collection of rows, keyed when every row is. `[:email :name]`: keys the code
      ;; chose, for the `select-keys` they end up in. Any other vector is not a map.
      ;; `[]` and `[1 2]` are no map; `[a (f x)]` is a collection of whatever those are.
      (ast/vector-node? a)
      (if (and (seq (ast/children a)) (every? #(ast/keyword-node? (ast/unmeta %)) (ast/children a)))
        :keyed
        (all (ast/children a)))

      (ast/symbol-node? a)
      (ref a (n/sexpr a))

      (ast/call? a)
      (let [head (ast/head-sym a)
            nm   (some-> head name)
            args (ast/args a)
            ;; `(:to-insert (build-rows ...))`: what the call returns under the key
            key-of (let [h (some-> (first (ast/children a)) ast/unmeta)
                         x (some-> (first args) ast/unmeta)]
                     (when (and h (ast/keyword-node? h) x (ast/call? x) (ast/head-sym x))
                       {:key-ref (ref x (ast/head-sym x)) :k (n/sexpr h)}))]
        (cond
          key-of
          key-of

          (nil? head)
          :opaque

          ;; `(select-keys m [:a :b])` is keyed; `(select-keys m (conj (fields) :x))` is keyed when the list is --
          ;; the keys were still chosen by code, one function over; `(select-keys m (:fields body))` is not
          (= nm "select-keys")
          (or (term (ast/arg a 1)) :opaque)

          ;; `(conj ks :k)`: the list, with a key the code named
          (= nm "conj")
          (if (every? #(ast/keyword-node? (ast/unmeta %)) (rest args))
            (term (first args))
            :opaque)

          ;; `(->> rows (filter p) (map f))`: the last step's rows
          (contains? '#{->> some->>} head)
          (reduce thread-last (term (first args)) (rest args))

          ;; `(-> {...} (assoc :x 1) f)`: the seed's term, until a step merges another map in
          (contains? threading-heads head)
          (when-let [t (term (first args))]
            (if (some #(contains? vocab/merging-heads (some-> (thread-target %) name)) (rest args)) :opaque t))

          ;; `(apply merge-with f maps)`, `(apply merge maps)`: the merge over the elements; `(apply f xs)`:
          ;; what `f` returns
          (= nm "apply")
          (let [f (some-> (first args) ast/unmeta)]
            (cond
              (and f (ast/symbol-node? f) (= "merge-with" (name (n/sexpr f)))) (all (drop 2 args))
              (and f (ast/symbol-node? f) (= "merge" (name (n/sexpr f))))      (all (rest args))
              (and f (ast/symbol-node? f))                                    (ref f (n/sexpr f))
              :else                                                           :opaque))

          (contains? shape-keeping-heads nm)
          (term (first args))

          (= nm "merge")
          (all args)

          (= nm "merge-with")
          (all (rest args))

          ;; `(let [...] body)`, `(if a b c)`, `(when x m)`: the value is one of the tails; nil branches are no map
          (or (contains? tail-through (symbol nm)) (str/starts-with? nm "with-"))
          (all (tail-forms a))

          (= nm "or")
          (all args)

          ;; `(for [...] {...})` is rows; `(for [...] [k v])` is pairs, a map once `into {}` collects them
          (= nm "for")
          (let [body (some-> (last args) ast/unmeta)]
            (if (and body (ast/vector-node? body)) (pair body) (term body)))

          (= nm "for-map")
          (pair (last args))

          (= nm "vals")
          {:vals-of (term (first args))}

          (contains? element-mapping-heads nm)
          (element (first args))

          (= nm "concat")
          (all args)

          ;; `(into [] rows)` keeps the rows; `(into {} pairs)` builds a map whose values are the pairs' seconds,
          ;; which the pairs' own term already says
          (= nm "into")
          (term (last args))

          (contains? collection-keeping-heads nm)
          (term (last args))

          ;; a call to something else: the function's return shape, once the graph knows it. clj-kondo keys a
          ;; call by its open paren, which for `#(row %)` is one column past the `#` the node starts at; the `#`
          ;; itself it reports as `clojure.core/fn*`.
          :else
          (if (= :fn (n/tag a))
            (update-in (ref a head) [:ref :col] inc)
            (ref a head))))

      :else :opaque)))

(defn- thread-shape
  "The shape term of what a threading step receives: the seed's, when every step before it keeps the keys the
  code chose -- `assoc`, `update`, `dissoc`, a helper that fills in fields -- and `:opaque` once a step merges
  another map in. The same approximation the taint takes: a thread's steps are recorded as receiving the seed."
  [filename seed earlier-steps]
  (let [merges? (fn [step] (contains? vocab/merging-heads (some-> (thread-target step) name)))]
    (when-let [term (arg-shape filename seed)]
      (if (some merges? earlier-steps) :opaque term))))

(defn- arg-records
  "The `:calls` records for one argument: the argument itself, and for a map literal one more per keyword entry,
  keyed, so `(f {:table-id id :file file})` hands `id` to the `table-id` of a callee that destructures the map and
  `file` to its `file`, rather than both to both. See `slot-binding-ids`."
  [filename head index pos a]
  (let [a (ast/unmeta a)]
    (cons {:head head :index index :pos pos :region (assoc (meta a) :filename filename) :map? (ast/map-node? a)
           :shape (arg-shape filename a)}
          (for [[k v] (ast/map-entries a)
                :let  [k (ast/unmeta k)]
                :when (ast/keyword-node? k)]
            {:head head :index index :pos pos :region (assoc (meta (ast/unmeta v)) :filename filename)
             :key  (n/sexpr k)}))))

(defn- slot-binding-ids
  "The binding ids a call record feeds in a parameter `slot`: every id in the slot for a plain argument to a plain
  parameter; for a map literal into a destructuring parameter, the whole map reaches only the `:as` binding
  and each keyed entry reaches the binding for its key."
  [local-idx slot {:keys [key map?]}]
  (let [keys (:keys slot)]
    (cond
      (nil? keys)   (if key [] (binding-ids-in-region local-idx (:region slot)))
      key           (concat (some->> (get keys key) (binding-ids-in-region local-idx))
                            (some->> (get keys :as) (binding-ids-in-region local-idx)))
      map?          (some->> (get keys :as) (binding-ids-in-region local-idx))
      :else         (binding-ids-in-region local-idx (:region slot)))))

(defn- meta-value
  "The value written for keyword `k` in `^{k v}` metadata on `raw`, an un-unmeta'd node, or nil."
  [raw k]
  (loop [nd raw]
    (when (and nd (#{:meta :meta*} (n/tag nd)))
      (let [[m inner] (ast/children nd)
            v         (when (ast/map-node? m) (ast/map-get m k))]
        (if v
          (n/sexpr v)
          (recur inner))))))

(defn- meta-keys
  "Keywords set by `^:kw` or `^{:kw true}` metadata on `raw`, an un-unmeta'd node."
  [raw]
  (loop [nd raw, ks #{}]
    (if (and nd (#{:meta :meta*} (n/tag nd)))
      (let [[m inner] (ast/children nd)
            ks (cond
                 (ast/keyword-node? m) (conj ks (n/sexpr m))
                 (ast/map-node? m)     (into ks (for [[k v] (ast/map-entries m)
                                                      :when (and (ast/keyword-node? k) (ast/truthy-literal? v))]
                                                  (n/sexpr k)))
                 :else                 ks)]
        (recur inner ks))
      ks)))

(defn- fn-name-sym
  "The name a `defn` form defines, looking through any metadata on it."
  [args]
  (let [a (ast/unmeta (first args))]
    (when (and a (ast/symbol-node? a)) (n/sexpr a))))

(defn- entry-name
  "How an entry point is named in a call path: an endpoint by its method and route, everything else by its head
  and first argument -- `defjob Nightly`, `def-listener! :queue/things`, `reify X509TrustManager`, `def creds`."
  [node]
  (let [head (some-> (ast/head-sym node) name)
        args (ast/args node)]
    (if (taint/defendpoint-params node)
      (let [[m r] args
            r     (some-> r ast/unmeta)
            route (cond
                    (nil? r)             nil
                    (ast/string-value r) (ast/string-value r)
                    (ast/vector-node? r) (some-> (first (ast/children r)) ast/string-value)
                    :else                (ast/->str r))]
        (str (some-> m ast/->str (str/replace #"^:" "") u/upper-case-en) " " route))
      (let [a (some-> (first args) ast/unmeta ast/normalized-text)
            a (when a (if (> (count a) 40) (str (subs a 0 40) "…") a))]
        (str head (when a (str " " a)))))))

(defn- handler-targets
  "What a router form hands on: the namespaces and vars named inside `nodes`, as `{:ns sym}` and `{:var sym}`.

  A quoted symbol is a namespace (`'metabase.cards.api`), `*ns*` is the enclosing one, and a qualified symbol in
  value position is a var that stands for a handler (`metabase.pulse.api/alert-routes`). Call heads are skipped:
  `api.macros/ns-handler` names a function, not a handler."
  [nodes own-ns]
  (letfn [(walk [nd]
            (let [nd (ast/unmeta nd)]
              (cond
                (nil? nd) nil

                (= :quote (n/tag nd))
                (let [q (some-> (first (ast/children nd)) ast/unmeta)]
                  (when (and q (ast/symbol-node? q)) [{:ns (n/sexpr q)}]))

                (ast/symbol-node? nd)
                (let [sym (n/sexpr nd)]
                  (cond
                    (= '*ns* sym)          [{:ns own-ns}]
                    (qualified-symbol? sym) [{:var sym}]
                    :else                   nil))

                (ast/call? nd)
                (mapcat walk (ast/args nd))

                (n/inner? nd)
                (mapcat walk (ast/children nd))

                :else nil)))]
    (vec (mapcat walk nodes))))

(defn handler-wrappers
  "Namespace -> the wrapper names applied to its handler, over every file: `{metabase.cards.api #{\"+auth\"}}`.

  A mount table wraps a namespace either directly, `(+auth 'metabase.cards.api)`, or through a var,
  `(+auth metabase.pulse.api/alert-routes)`, whose definition names the namespace or yet another var. Wrappers
  applied to a var are pushed through its definition until they land on namespaces. A namespace absent from the
  result has no wrapper anywhere: its endpoints are reachable exactly as written, which is the question
  `endpoint-mounted-without-auth` asks."
  [tables]
  (let [defs (into {} (for [t (vals tables), {:keys [var targets]} (:handler-defs t)] [var targets]))
        add  (fn [m k ws] (update m k (fnil into #{}) ws))
        seed (reduce (fn [acc {:keys [wrapper targets]}]
                       (reduce (fn [acc {:keys [ns var]}]
                                 (cond
                                   ns  (update acc :ns add ns #{wrapper})
                                   var (update acc :var add var #{wrapper})
                                   :else acc))
                               acc
                               targets))
                     {:ns {} :var {}}
                     (mapcat :wraps (vals tables)))]
    (loop [{:keys [ns var] :as acc} seed, seen-vars {}]
      (let [fresh (into {} (remove (fn [[v ws]] (= ws (get seen-vars v)))) var)]
        (if (empty? fresh)
          ns
          (recur (reduce (fn [acc [v ws]]
                           (reduce (fn [acc t]
                                     (cond
                                       (:ns t)  (update acc :ns add (:ns t) ws)
                                       (:var t) (update acc :var add (:var t) ws)
                                       :else    acc))
                                   acc
                                   (get defs v)))
                         acc
                         fresh)
                 var))))))

;;; ------------------------------------------------ Key terms ------------------------------------------------

(def ^:private key-setting-heads
  "Calls whose value is their first argument's map with named keys set: `assoc` replaces, the others set a key
  from what was there."
  #{"assoc" "assoc-in" "update" "update-in"})

(defn- literal-keys
  "The keywords in a vector or set literal of keywords, or nil when it is anything else."
  [node]
  (let [node (some-> node ast/unmeta)]
    (when (and node (or (ast/vector-node? node) (= :set (n/tag node)))
               (every? #(ast/keyword-node? (ast/unmeta %)) (ast/children node)))
      (into #{} (map #(n/sexpr (ast/unmeta %))) (ast/children node)))))

(defn- first-key
  "The first key of an `assoc-in`/`update-in` path, or an `update`/`assoc` key: a keyword, or nil."
  [node]
  (let [node (some-> node ast/unmeta)]
    (cond
      (nil? node)                 nil
      (ast/keyword-node? node)    (n/sexpr node)
      (ast/vector-node? node)     (first-key (first (ast/children node)))
      :else                       nil)))

(declare key-term)

(defn- apply-key-step
  "`acc` with one threading step applied: `(assoc :k v)`, `(merge m)`, `(dissoc :k)`, `(select-keys [...])`,
  `(f a b)`. `conditional?` -- a `cond->` step -- keeps what was there as well."
  [filename env acc step conditional?]
  (let [step   (ast/unmeta step)
        region (assoc (meta step) :filename filename)
        head   (if (ast/symbol-node? step) (n/sexpr step) (ast/head-sym step))
        nm     (some-> head name)
        args   (if (ast/call? step) (ast/args step) [])
        term   (partial key-term filename env)
        pos    (assoc (select-keys (meta step) [:row :col]) :filename filename)
        applied
        (cond
          (nil? head)
          {:any region}

          ;; `(cond-> m ok? (u/prog1 (side-effect!)))`, `(-> m (doto log))`: the value is the threaded map
          (contains? #{"prog1" "doto"} nm)
          acc

          (= nm "assoc")
          (let [pairs (partition 2 args)]
            (if (every? #(ast/keyword-node? (ast/unmeta (first %))) pairs)
              ;; under `cond->` the key keeps what it had as well: an `:add`, and no second copy of `acc`
              {(if conditional? :add :over) acc :keys (into {} (for [[k v] pairs] [(n/sexpr (ast/unmeta k)) (term v)]))}
              {:merge [acc {:any region}]}))

          (contains? key-setting-heads nm)
          (if-let [k (first-key (first args))]
            {:add acc :keys {k {:any region}}}
            {:merge [acc {:any region}]})

          ;; under `cond->`, what a `dissoc` or a `select-keys` may have removed is still there
          (= nm "dissoc")
          (if (and (not conditional?) (every? #(ast/keyword-node? (ast/unmeta %)) args))
            {:without acc :keys (into #{} (map #(n/sexpr (ast/unmeta %))) args)}
            acc)

          (= nm "select-keys")
          (cond conditional?                    acc
                (literal-keys (first args))     {:only acc :keys (literal-keys (first args))}
                :else                           {:any region})

          (contains? #{"merge" "merge-with"} nm)
          {:merge (into [acc] (map term) (if (= nm "merge-with") (rest args) args))}

          :else
          {:call {:head head :pos pos} :region region :args (into [acc] (map term) args)})]
    ;; a step that already keeps `acc` is not merged with it again: the term would double at every step
    (if (and conditional? (:call applied)) {:merge [acc applied]} applied)))

(defn- key-term
  "What a form holds under each key, as a term [[propagate*]] evaluates once the graph is known:

    {:lit {k term}}             a map literal with keyword keys: each key holds its value, a term of its own
    {:any region}               a form not understood: every key may hold what the form generates
    {:local region}             a symbol: what the binding it names holds; a parameter, nothing
    {:key-of term :key k}       `(:k m)`, `(get m :k)`: what `m` holds under `:k`
    {:over base :keys {k term}} `(assoc base :k v)`: k holds v, the rest is base's
    {:add base :keys {k term}}  `(assoc-in base [:k ...] v)`, `(update base :k f)`: k holds v and base's k
    {:without base :keys #{k}}  `(dissoc base :k)`
    {:only base :keys #{k}}     `(select-keys base [:k])`
    {:merge [term ...]}         `(merge a b)`: each key holds what any of them holds
    {:call c :region r :args}   a call: what the callee returns under the key, plus what it passes through
                                from its arguments; `:self true` for `next-method`. A callee the graph does
                                not hold is `{:any}` of the call.

  Threading forms fold their steps; `as->` binds its name in `env`. A `let`, an `if`, a `try` is the union
  of its tails."
  [filename env node]
  (let [a      (ast/unmeta node)
        region (assoc (meta a) :filename filename)
        term   (partial key-term filename env)]
    (cond
      (nil? a)
      nil

      (ast/map-node? a)
      (if (and (seq (ast/map-entries a))
               (every? (fn [[k _]] (ast/keyword-node? (ast/unmeta k))) (ast/map-entries a)))
        {:lit (into {} (for [[k v] (ast/map-entries a)] [(n/sexpr (ast/unmeta k)) (term v)]))}
        {:any region})

      (ast/symbol-node? a)
      (or (get env (n/sexpr a)) {:local region})

      (ast/literal? a)
      nil

      (not (ast/call? a))
      {:any region}

      :else
      (let [head (ast/head-sym a)
            nm   (some-> head name)
            args (ast/args a)
            pos  (assoc (select-keys (meta a) [:row :col]) :filename filename)
            kw-head (let [h (some-> (first (ast/children a)) ast/unmeta)]
                      (when (and h (ast/keyword-node? h)) (n/sexpr h)))]
        (cond
          ;; `(:k m)`: what `m` holds under `:k`
          kw-head
          {:key-of (term (first args)) :key kw-head}

          (nil? head)
          {:any region}

          ;; `(get m :k)`
          (and (= nm "get") (some-> (second args) ast/unmeta ast/keyword-node?))
          {:key-of (term (first args)) :key (n/sexpr (ast/unmeta (second args)))}

          ;; `(-> m (assoc :k v) f)`, `(cond-> m t (assoc :k v))`, `(as-> m $ (f $) (assoc $ :k v))`
          (contains? '#{-> some-> cond-> some->>  ->>} head)
          (let [seed  (term (first args))
                steps (rest args)
                cond? (contains? '#{cond-> cond->>} head)
                steps (if cond? (map second (partition 2 steps)) steps)]
            (if (contains? '#{->> some->>} head)
              ;; the value lands last: not a map operation the terms know
              (reduce (fn [acc step] {:merge [acc {:any (assoc (meta (ast/unmeta step)) :filename filename)}]}) seed steps)
              (reduce (fn [acc step] (apply-key-step filename env acc step cond?)) seed steps)))

          (= nm "as->")
          (let [seed (term (first args))
                sym  (some-> (second args) ast/unmeta n/sexpr)]
            (reduce (fn [acc step] (key-term filename (assoc env sym acc) step)) seed (drop 2 args)))

          ;; the value is one of the tails
          (or (contains? tail-through (symbol nm)) (str/starts-with? nm "with-"))
          (let [tails (tail-forms a)]
            (if (= tails [a])
              {:any region}
              {:merge (into [] (keep term) tails)}))

          (= nm "assoc")
          (apply-key-step filename env (term (first args)) (n/list-node (into [(first (ast/children a))] (rest args))) false)

          (contains? key-setting-heads nm)
          (if-let [k (first-key (second args))]
            {:add (term (first args)) :keys {k {:any region}}}
            {:any region})

          (= nm "dissoc")
          (if (every? #(ast/keyword-node? (ast/unmeta %)) (rest args))
            {:without (term (first args)) :keys (into #{} (map #(n/sexpr (ast/unmeta %))) (rest args))}
            (term (first args)))

          (= nm "select-keys")
          (if-let [ks (literal-keys (second args))]
            {:only (term (first args)) :keys ks}
            {:any region})

          (contains? #{"merge" "merge-with"} nm)
          {:merge (into [] (keep term) (if (= nm "merge-with") (rest args) args))}

          (= nm "next-method")
          {:call {:self true} :region region :args (mapv term args)}

          :else
          {:call {:head head :pos pos} :region region :args (mapv term args)})))))

(def ^:dynamic *trace-keys*
  "When bound to a function, called with `{:fn fq :key k :term term :labels #{...}}` for every key-term leaf that
  evaluates to something, so a surprising origin under a key can be traced to the tail and the form it came
  from. Off by default; a debugging aid."
  nil)

(defn- term-regions
  "Every region a key term names."
  [term]
  (cond
    (nil? term)     []
    (:lit term)     (mapcat term-regions (vals (:lit term)))
    (:any term)     [(:any term)]
    (:local term)   [(:local term)]
    (:over term)    (concat (mapcat term-regions (vals (:keys term))) (term-regions (:over term)))
    (:add term)     (concat (mapcat term-regions (vals (:keys term))) (term-regions (:add term)))
    (:without term) (term-regions (:without term))
    (:only term)    (term-regions (:only term))
    (:key-of term)  (term-regions (:key-of term))
    (:merge term)   (mapcat term-regions (:merge term))
    (:call term)    (cons (:region term) (mapcat term-regions (:args term)))
    :else           []))

(defn- self-calls-in
  "Every `next-method` call term inside `term`, with its arguments."
  [term]
  (cond
    (nil? term)     []
    (:lit term)     (mapcat self-calls-in (vals (:lit term)))
    (:merge term)   (mapcat self-calls-in (:merge term))
    (:over term)    (concat (mapcat self-calls-in (vals (:keys term))) (self-calls-in (:over term)))
    (:add term)     (concat (mapcat self-calls-in (vals (:keys term))) (self-calls-in (:add term)))
    (:without term) (self-calls-in (:without term))
    (:only term)    (self-calls-in (:only term))
    (:key-of term)  (self-calls-in (:key-of term))
    (:call term)    (cond->> (mapcat self-calls-in (:args term))
                      (:self (:call term)) (cons term))
    :else           []))

(def ^:private methodical-aliases
  "How `methodical.core` is required across the tree: 183 files as `methodical`, 6 as `m`."
  #{"methodical" "methodical.core" "m"})

(defn- methodical-qualifier
  "`:before`, `:after` or `:around` when `head` is methodical's `defmethod` and `args` open with the method name
  and that qualifier; nil for a primary method or clojure's own `defmethod`, whose dispatch value may itself be
  a keyword like `:after`."
  [head args]
  (when (and (symbol? head) (= "defmethod" (name head)) (contains? methodical-aliases (namespace head)))
    (let [q (some-> (second args) ast/unmeta)]
      (when (and q (ast/keyword-node? q) (contains? #{:before :after :around} (n/sexpr q)))
        (n/sexpr q)))))

(defn extract
  "Region tables for one parsed file.

  Returns `{:ns ... :params [...] :inits [...] :calls [...]}` where

    :params  {:fn fq-symbol, :index n, :region r}  -- one per parameter slot of each defn
    :inits   {:bind {:row :col}, :region r}        -- a let-style binding and its initializer
    :calls   {:head symbol, :index n, :region r, :pos {:row :col}} -- one per call argument
    :sources [region]                              -- trust boundaries: defendpoint params, Ring request params
    :fns     {:fn fq-symbol, :region r}            -- one per named fn, its whole form
    :entries [region + :kind]                      -- where execution starts: :http, :job, :mq, :cli, :startup
    :guards  {:checks [r], :body r}                -- validator calls a conditional applies, and the forms they protect
    :call-sites {:head symbol, :pos {:row :col}}   -- one per call node, arity-independent, for the graph
    :ns-middleware #{symbol}                       -- middleware applied to every endpoint via ns-handler

  Only single-arity `defn` forms are handled; a multi-arity fn contributes no parameter slots, so taint simply
  does not propagate into it. That is the conservative direction -- it loses findings rather than inventing them."
  [filename ns-sym root-node]
  (let [params (volatile! []) inits (volatile! []) calls (volatile! []) sources (volatile! [])
        fns (volatile! []) entries (volatile! []) guards (volatile! []) privilege-guards (volatile! []) sites (volatile! [])
        ns-middleware (volatile! #{}) wraps (volatile! []) handler-defs (volatile! [])
        numeric (volatile! []) strings (volatile! []) registry (volatile! []) keyed (volatile! []) sanitized (volatile! [])
        origin-fns (volatile! []) model-args (volatile! {}) tails (volatile! []) checks (volatile! [])
        thread-tails (volatile! []) tail-terms (volatile! [])
        ;; `(ns ^:instrument/always foo)`: the one way a `mu/defn` schema is enforced in production, where they
        ;; are otherwise compiled out. Only then does a `:- ms/PositiveInt` on a helper's parameter pin the value.
        enforced-ns? (boolean (some (fn [nd]
                                      (and (ast/call? nd) (= 'ns (ast/head-sym nd))
                                           (contains? (meta-keys (first (ast/args nd))) :instrument/always)))
                                    (ast/children root-node)))]
    (doseq [node (ast/find-nodes ast/call? root-node)]
      (let [head (ast/head-sym node)
            args (ast/args node)]
        ;; `(+auth 'metabase.cards.api)`, `(+auth metabase.pulse.api/alert-routes)`: a router wrapper applied to a
        ;; namespace, or to a var that leads to one. Wrappers are named with a leading `+` by convention, and
        ;; `(ns-handler *ns* +auth)` applies its trailing arguments the same way. Collected for
        ;; [[handler-wrappers]], which answers whether a namespace's endpoints sit behind authentication at all.
        (when (and head (str/starts-with? (name head) "+"))
          (vswap! wraps conj {:wrapper (name head) :targets (handler-targets args ns-sym)}))
        (when (= "ns-handler" (some-> head name))
          (doseq [mw (rest args) :let [mw (ast/unmeta mw)] :when (ast/symbol-node? mw)]
            (vswap! wraps conj {:wrapper (name (n/sexpr mw)) :targets (handler-targets (take 1 args) ns-sym)})))
        ;; `(->> (ns-handler *ns*) +auth +require-premium-feature)`: each `+` step wraps the seed
        (when (contains? threading-heads head)
          (let [targets (delay (handler-targets (take 1 args) ns-sym))]
            (doseq [step  (rest args)
                    :let  [w (thread-target step)]
                    :when (and w (str/starts-with? (name w) "+"))]
              (vswap! wraps conj {:wrapper (name w) :targets @targets}))))
        ;; `(h2x/like-substring q)`: what comes out carries none of `q`'s structure, so a usage inside is not one
        ;; taint should follow into the enclosing call's argument or binding. See [[propagate]].
        (when (taint/sanitizing-call? node vocab/propagation-sanitizers)
          (vswap! sanitized conj (assoc (meta node) :filename filename)))
        ;; `(:metabase-user-id request)`: what the session middleware wrote into the request is the middleware's
        ;; -- an integer, a flag -- not the client's, so the current user's id and flags carry no request taint
        (when-let [[_ k] (ast/accessor node)]
          (when (contains? vocab/session-keys k)
            (vswap! sanitized conj (assoc (meta node) :filename filename))))
        ;; `(validate-url! url) (http/get url)`: a validating assertion as a statement throws on a bad value, so
        ;; the forms after it in the same body see a validated one. A guard, like a conditional's, over the rest
        ;; of the enclosing form -- and only the rest: `(sink url) (validate-url! url)` validated nothing in time.
        ;; A throwing guard -- `(when-not (contains? allowed unit) (throw ...))` -- is the same assertion spelled
        ;; inline, and vouches for the same forms; see [[throwing-guard-checks]].
        (let [cs (vec (ast/children node))]
          (doseq [[i c] (map-indexed vector cs)
                  :let  [c      (ast/unmeta c)
                         checks (when (and (pos? i) (ast/call? c) (< (inc i) (count cs)))
                                  (if (vocab/assertion-validator? (ast/head-sym c))
                                    [c]
                                    (throwing-guard-checks c)))]
                  :when (seq checks)
                  :let  [b0 (meta (nth cs (inc i)))
                         bn (meta (peek cs))]]
            (vswap! guards conj {:checks (mapv #(assoc (meta %) :filename filename) checks)
                                 :body   {:filename filename
                                          :row     (:row b0)     :col     (:col b0)
                                          :end-row (:end-row bn) :end-col (:end-col bn)}})))
        ;; `(-> {...} (sql/format))`: the value is the last step's, so the sanitizer at the end of a thread
        ;; sanitizes the whole thread -- every earlier step is its input. Recorded by the last step's position so
        ;; a resolved sanitizer there is honoured too, see [[resolved-sanitized-regions]].
        (when (contains? vocab/value-threads head)
          (when-let [{:keys [head pos]} (tail-head node)]
            (vswap! thread-tails conj {:pos (assoc pos :filename filename) :region (assoc (meta node) :filename filename)})
            (let [step (some-> (last args) ast/unmeta)]
              (when (or (taint/sanitizer? head vocab/propagation-sanitizers)
                        (and step (taint/sanitizing-call? step vocab/propagation-sanitizers)))
                (vswap! sanitized conj (assoc (meta node) :filename filename))))))
        ;; `(t2/select-one :model/Card id)`: the model, so a read of it can be labelled `:app-db/Card`. Recorded
        ;; for every call by position; the engine pairs it with clj-kondo's resolution of the head.
        (when-let [m (let [a (some-> (first args) ast/unmeta)
                           a (if (and (ast/vector-node? a) (seq (ast/children a))) (first (ast/children a)) a)]
                       (when (and a (ast/keyword-node? a) (= "model" (namespace (n/sexpr a))))
                         (name (n/sexpr a))))]
          (vswap! model-args assoc (assoc (select-keys (meta node) [:row :col]) :filename filename) m))
        ;; `(api/read-check :model/Card id)`, `(mi/can-write? card)`: whatever is handed to an authorization check
        ;; is checked from here on, labelled with the model when the check names one. Recorded as the argument
        ;; regions; [[propagate]] labels the bindings used inside them.
        (when (and head (re-find vocab/object-checks (name head)))
          (let [model (let [a (some-> (first args) ast/unmeta)]
                        (when (and a (ast/keyword-node? a) (= "model" (namespace (n/sexpr a))))
                          (name (n/sexpr a))))
                label (if model (keyword "checked" model) :checked)]
            (doseq [a (if model (rest args) args)
                    :let [a (ast/unmeta a)]]
              ;; `(read-check :model/Card (:card_id body))` checks `body`'s `:card_id`, not `body`: the mark is
              ;; scoped to the key, so `(:dashboard_id body)` two lines down is still unchecked
              (if-let [[m k] (ast/accessor a)]
                (vswap! checks conj {:region (assoc (meta (ast/unmeta m)) :filename filename)
                                     :label  (taint/key-scoped label k)})
                (vswap! checks conj {:region (assoc (meta a) :filename filename) :label label})))))
        ;; `(t2/select-one :model/Bookmark :card_id id :user_id api/*current-user-id*)`, `(delete-bookmark! model
        ;; id api/*current-user-id*)`: a call handed the current user's id alongside an id is scoped to that user,
        ;; which authorizes the id by construction. Every other argument is checked as `:checked/owner`, and the
        ;; call reaches the pseudo-function [[dev.security-lint.vocabulary/owner-scoped-query]], so an endpoint
        ;; rule asking for an authorization on the path finds one. Not a log line, an event or a metric.
        (when (and head (seq args)
                   (not (re-find vocab/not-a-scope (or (namespace head) (name head))))
                   (not (contains? vocab/not-a-scope-fns (symbol (name head))))
                   (not (re-find vocab/object-checks (name head)))
                   ;; a function call, not a form that binds or defines: `(let [uid *current-user-id*] ...)`
                   ;; scopes nothing by its body
                   (not (vocab/binding-head? head))
                   (not (contains? tail-through (symbol (name head))))
                   (not (contains? threading-heads head))
                   (not (re-find #"^(def|fn\*?$|with-|doto$|reify$|proxy$|extend-)" (name head))))
          (let [user-ref? (fn [a] (and (ast/symbol-node? a)
                                       (contains? vocab/current-user-refs (name (n/sexpr a)))))
                ;; the ref itself, or inside a data literal -- a HoneySQL map, a keyword-argument vector -- but
                ;; not inside a nested call, whose own arguments are its own business
                literal?  (fn [a] (or (ast/map-node? a) (ast/vector-node? a) (= :set (n/tag a))))
                holds?    (fn holds? [a]
                            (let [a (ast/unmeta a)]
                              (or (user-ref? a)
                                  (and (literal? a) (some holds? (ast/children a))))))
                scoped?   (some holds? args)]
            (when scoped?
              ;; keyed one column in, at the head symbol: clj-kondo resolves the call at the paren, and that
              ;; resolution must not replace the pseudo-function
              (vswap! sites conj {:head vocab/owner-scoped-query
                                  :pos  {:filename filename :row (:row (meta node)) :col (inc (:col (meta node)))}})
              (doseq [a    args
                      :let [a (ast/unmeta a)]
                      :when (not (user-ref? a))]
                (vswap! checks conj {:region (assoc (meta a) :filename filename) :label :checked/owner})))))
        ;; `(defmulti ^{:taint/source :warehouse} describe-table ...)`: a declared origin, resolved by the graph
        ;; to every implementation
        (when (and head (contains? #{"defmulti" "defn" "defn-" "defenterprise"} (name head)))
          (when-let [label (meta-value (first args) vocab/origin-meta-key)]
            (when-let [nm (fn-name-sym args)]
              (vswap! origin-fns conj {:fn (symbol (str ns-sym) (str nm)) :label label}))))
        ;; a setting's getter reads the application database: settings managers are not superusers. A setting
        ;; typed as a number, a boolean or a timestamp returns one whatever was stored -- the setter and the
        ;; getter coerce -- so its getter is no origin for the rules about a value's shape, or any other.
        (when (= "defsetting" (some-> head name))
          (when-let [nm (fn-name-sym args)]
            (let [t (some-> (ast/kwargs args) (get :type) ast/->str)]
              (when-not (contains? vocab/scalar-setting-types t)
                (vswap! origin-fns conj {:fn (symbol (str ns-sym) (str nm)) :label :app-db/setting})))))
        (cond
          (defn-head? head)
          (when-let [nm (fn-name-sym args)]
            (let [;; `(defmethod driver/execute-query :postgres ...)` implements a multimethod that lives
                  ;; elsewhere; joining the namespace to the written name produced a symbol nothing ever called.
                  ;; The name's position lets the engine swap in clj-kondo's resolution of it.
                  name-pos (when (= "defmethod" (name head))
                             (assoc (select-keys (meta (ast/unmeta (first args))) [:row :col]) :filename filename))
                  fq       (symbol (str ns-sym) (str nm))]
              (vswap! fns conj (cond-> {:fn fq :region (assoc (meta node) :filename filename)}
                                 name-pos (assoc :name-pos name-pos)))
              ;; what the function returns: the regions of its tail forms, so a call to it can carry their taint
              (doseq [body (bodies args), t (some-> (last body) tail-forms)
                      :let [qualifier (methodical-qualifier head args)]]
                (vswap! tails conj (cond-> {:fn fq :region (assoc (meta t) :filename filename)
                                            ;; the shape of what it returns, for [[param-shapes]], and the shape
                                            ;; under each key when it is a map literal -- what a caller that
                                            ;; destructures the return, `{:keys [to-insert]}`, gets
                                            :shape (arg-shape filename t)
                                            :key-shapes (let [t* (ast/unmeta t)]
                                                          (when (and (ast/map-node? t*)
                                                                     (every? (fn [[k _]] (ast/keyword-node? (ast/unmeta k)))
                                                                             (ast/map-entries t*)))
                                                            (into {} (for [[k v] (ast/map-entries t*)]
                                                                       [(n/sexpr (ast/unmeta k)) (arg-shape filename v)]))))}
                                     ;; the call the value comes from, for [[sanitizing-fns]]
                                     (tail-head t) (assoc :head (tail-head t))
                                     name-pos     (assoc :name-pos name-pos)))
                ;; what it returns *under each key*, as a term over the tail's structure -- see [[key-term]].
                ;; A methodical `:around` wraps the rest of the chain: its tails are what a caller sees, and
                ;; what its `next-method` call hands in is what the primaries and the `:after`s see.
                (vswap! tail-terms conj (cond-> {:fn fq :term (key-term filename {} t)}
                                          qualifier (assoc :qualifier qualifier)
                                          name-pos  (assoc :name-pos name-pos))))
              ;; `(defenterprise f "doc" ee.ns [x] ...)` dispatches to `ee.ns/f` when EE is enabled -- by name, at
              ;; runtime. The namespace symbol sits right there, so that dynamic edge is modelled exactly: the OSS
              ;; function "calls" its EE counterpart. The site is keyed at the namespace symbol's own position,
              ;; which clj-kondo never reports as a var, so resolution leaves the qualified head as written.
              (when (str/starts-with? (name head) "defenterprise")
                (when-let [ee-ns (some (fn [a] (let [a (ast/unmeta a)]
                                                 (when (and (ast/symbol-node? a) (not= a (ast/unmeta (first args))))
                                                   a)))
                                       (take-while #(not (ast/vector-node? (ast/unmeta %))) (rest args)))]
                  (vswap! sites conj {:head (symbol (str (n/sexpr ee-ns)) (str nm))
                                      :pos  (assoc (select-keys (meta ee-ns) [:row :col]) :filename filename)})))
              ;; `-main`, and a `^:command` fn dispatched from the command line, start execution on their own
              (when-let [kind (or (get vocab/entry-fn-names (str nm))
                                  (some vocab/entry-fn-meta (meta-keys (first args))))]
                (vswap! entries conj (assoc (meta node) :filename filename :kind kind :name (str fq))))
              (doseq [al (arglists args)]
                (when enforced-ns?
                  (let [typed (taint/typed-param-regions al filename)]
                    (vswap! numeric into (:numeric typed))
                    (vswap! strings into (:string typed))
                    (vswap! registry into (:registry typed))))
                (let [;; A methodical `:after` method's last parameter is what the primary *returned* -- not an
                      ;; argument at all: the caller's arguments never reach it, and the primary's return is what
                      ;; it holds. Fed from those returns in [[propagate*]]. (`:around` and `:before` take the
                      ;; call's arguments as a primary does; `next-method` is an implicit binding, not a
                      ;; parameter.)
                      qualifier (methodical-qualifier head args)
                      recs      (volatile! [])]
                  (loop [i 0, slots (ast/children al), rest? false]
                    (when-let [slot (first slots)]
                      (cond
                        (= "&" (ast/->str slot))
                        (recur i (next slots) true)

                        ;; `[id :- :int]` -- the annotation and its schema are not parameters
                        (= ":-" (ast/->str slot))
                        (recur i (nnext slots) rest?)

                        :else
                        (let [region (assoc (meta slot) :filename filename)
                              ;; `{:keys [table-id file]}`: what each key of a map argument lands in
                              keys   (not-empty (into {} (for [[k sym] (ast/destructured-keys slot)]
                                                           [k (assoc (meta sym) :filename filename)])))]
                          (vswap! recs conj (cond-> {:fn fq :index i :region region}
                                              rest?    (assoc :rest? true)
                                              keys     (assoc :keys keys)
                                              name-pos (assoc :name-pos name-pos)))
                          (when (or (contains? request-param-names (ast/->str slot))
                                    (request-destructuring? slot))
                            (vswap! sources conj region))
                          (recur (inc i) (next slots) false)))))
                  (doseq [rec (if (and (= :after qualifier) (seq @recs))
                                (update @recs (dec (count @recs)) assoc :holds-return? true)
                                @recs)]
                    (vswap! params conj rec))))))

          ;; An anonymous fn contributes no parameter *slots* -- nothing can call it by name -- but its
          ;; parameters can still be a trust boundary.
          (contains? fn-heads head)
          (when-let [al (arglist args)]
            (doseq [slot (ast/children al)]
              (when (or (contains? request-param-names (ast/->str slot))
                        (request-destructuring? slot))
                (vswap! sources conj (assoc (meta slot) :filename filename)))))

          ;; A conditional guarded by a validating test protects the forms under it. Recording that is what lets a
          ;; correctly defended site stop being reported forever, rather than being re-reviewed every run.
          (contains? guard-heads head)
          (let [test   (first args)
                body   (guarded-forms (name head) args)
                checks (when test (positive-checks test))]
            (when (and (seq body) (seq checks))
              (let [b0 (meta (first body))
                    bn (meta (last body))]
                (vswap! guards conj {:checks (mapv #(assoc (meta %) :filename filename) checks)
                                     :body   {:filename filename
                                              :row      (:row b0)     :col     (:col b0)
                                              :end-row  (:end-row bn) :end-col (:end-col bn)}})))
            ;; `(when superuser? ...)`, `(if api/*is-superuser?* ...)`: the branch is a superuser's whoever reached
            ;; the function -- middleware that runs for anonymous callers and writes a setting only under this
            ;; flag, say. What is under it grades as a superuser's, see [[min-privilege-entry]].
            (when (and test (seq body) (superuser-test? test))
              (let [b0 (meta (first body))
                    bn (meta (last body))]
                (vswap! privilege-guards conj {:privilege :superuser
                                               :body      {:filename filename
                                                           :row      (:row b0)     :col     (:col b0)
                                                           :end-row  (:end-row bn) :end-col (:end-col bn)}}))))

          ;; `(api.macros/ns-handler *ns* api/+check-superuser ...)` wraps every endpoint in the namespace with
          ;; middleware. That is authorization the closure cannot otherwise see -- it is applied by the router,
          ;; not called from the endpoint -- and the codebase's own API-doc generator has the same blind spot.
          (= "ns-handler" (some-> head name))
          (doseq [a (rest args) :let [a (ast/unmeta a)] :when (ast/symbol-node? a)]
            (vswap! ns-middleware conj (n/sexpr a)))

          ;; a Quartz job, a queue consumer, a lifecycle hook, a setting: the whole form is an entry point
          (get vocab/entry-forms (some-> head name))
          (vswap! entries conj (assoc (meta node) :filename filename :kind (get vocab/entry-forms (name head))
                                      :name (entry-name node)))

          ;; a record, type or protocol extension: its method bodies are live, and nothing attributes their calls
          (contains? vocab/live-body-forms (some-> head name))
          (vswap! entries conj (assoc (meta node) :filename filename :kind :protocol :name (entry-name node)))

          (vocab/binding-head? head)
          (when-let [bv (first args)]
            (when (ast/vector-node? bv)
              (let [seq-form? (contains? vocab/seq-binding-forms (symbol (name head)))
                    record!   (fn record! [b init]
                                (let [b* (ast/unmeta b)]
                                  (cond
                                    ;; `:let [x 1]` inside a `for`'s binding vector: bindings like a `let`'s
                                    (and (ast/keyword-node? b*) (= :let (n/sexpr b*)))
                                    (when (ast/vector-node? (ast/unmeta init))
                                      (doseq [[b2 init2] (partition 2 (ast/children (ast/unmeta init)))]
                                        (record! b2 init2)))

                                    ;; `:when x`, `:while x`: no binding
                                    (ast/keyword-node? b*)
                                    nil

                                    :else
                                    (do
                                      (vswap! inits conj (cond-> {:bind   (assoc (meta b) :filename filename)
                                                                  ;; `[cid (:card_id body)]`: a check on `cid` later vouches
                                                                  ;; for `body`'s `:card_id`, not for `body`
                                                                  :key    (second (ast/accessor (ast/unmeta init)))
                                                                  :region (assoc (meta init) :filename filename)
                                                                  ;; `[m {:a 1}]`: the local has the literal's shape; `[m
                                                                  ;; other]` its init's. Only a plain symbol binds the whole
                                                                  ;; value.
                                                                  :shape  (when (ast/symbol-node? b*) (arg-shape filename init))
                                                                  ;; what the value holds under each key, for [[key-term]]
                                                                  ;; evaluation of a local named in a tail; an element of a
                                                                  ;; `for` is not its collection, so only the region
                                                                  :kterm  (if seq-form?
                                                                            {:any (assoc (meta init) :filename filename)}
                                                                            (key-term filename {} init))}
                                                           ;; `[{:keys [a]} init]`: what each key lands in
                                                           (ast/map-node? b*)
                                                           (assoc :keys (into {} (for [[k sym] (ast/destructured-keys b)]
                                                                                   [k (assoc (meta sym) :filename filename)])))))
                                      ;; `(for [[k v] m] ...)`: `v` is one of `m`'s values. A second record for `v`
                                      ;; alone, so its shape can be followed; the taint the first record carries to
                                      ;; both names is unchanged.
                                      (when (and seq-form? (ast/vector-node? b*) (= 2 (count (ast/children b*))))
                                        (let [v (second (ast/children b*))]
                                          (when (ast/symbol-node? (ast/unmeta v))
                                            (vswap! inits conj {:bind   (assoc (meta v) :filename filename)
                                                                :region (assoc (meta init) :filename filename)
                                                                :shape  {:vals-of (arg-shape filename init)}}))))))))]
                (doseq [[b init] (partition 2 (ast/children bv))]
                  (record! b init)))))

          :else nil)
        ;; a defendpoint parameter vector is the other trust boundary
        (when-let [dp (taint/defendpoint-params node)]
          (vswap! sources conj (assoc (meta dp) :filename filename))
          ;; the bindings a request schema pins to a number or a string, so a rule about a value's shape can
          ;; leave the ones that cannot have that shape out
          (let [typed (taint/typed-param-regions dp filename)]
            (vswap! numeric into (:numeric typed))
            (vswap! strings into (:string typed))
            (vswap! registry into (:registry typed))
            ;; the keys of a request map under a closed schema are the schema's: `closed-schemas` holds for
            ;; every `defendpoint`, and only there -- a `mu/defn` schema is neither enforced nor checked closed
            (vswap! keyed into (:keyed typed)))
          (vswap! entries conj (assoc (meta node) :filename filename :kind :http :name (entry-name node)
                                      ;; `:put`, as written, for [[vocab/elevated-endpoint?]]
                                      :method (some-> (first args) ast/unmeta ast/->str))))
        ;; A threading macro passes its seed into each step, which the plain call extraction below cannot see:
        ;; `(-> request :url h)` looks like a three-argument call to `->`. Record a synthetic call per step so the
        ;; seed's taint reaches the function each step names.
        (when-let [slot (get threading-heads head)]
          (when-let [seed (first args)]
            (let [seed-region (assoc (meta seed) :filename filename)]
              (doseq [[i step] (map-indexed vector (rest args))
                      :let [target (thread-target step)
                            spos   (assoc (select-keys (meta step) [:row :col]) :filename filename)]
                      :when target]
                ;; `(-> x helper)` names helper without a call node of its own
                (when (ast/symbol-node? (ast/unmeta step))
                  (vswap! sites conj {:head target :pos spos}))
                (vswap! calls conj {:head   target
                                    :index  slot
                                    :pos    spos
                                    :region seed-region
                                    ;; the seed's shape, as far as the steps before this one keep it
                                    :shape  (thread-shape filename seed (take i (rest args)))})))))
        ;; `(apply f a b coll)` calls f with a and b in its first positions and the collection spread over the
        ;; rest; `(m/mapply f m)` calls f with the map as its trailing keyword arguments, so the map lands in the
        ;; last parameter -- `[& {:keys [dashboard card]}]`, or a plain trailing map. Recorded as calls to `f` at
        ;; the function argument's position, where clj-kondo resolves the name, so the callee's parameters carry
        ;; what was handed in and a check inside it vouches for the caller's arguments.
        (when (contains? vocab/executes-first-arg (some-> head name))
          (when-let [f (thread-target (first args))]
            (let [pos    (assoc (select-keys (meta (first args)) [:row :col]) :filename filename)
                  passed (rest args)]
              (doseq [[i a] (map-indexed vector passed)
                      :let  [last? (= i (dec (count passed)))]
                      rec   (arg-records filename f (if last? :last i) pos a)]
                (vswap! calls conj rec)))))
        ;; `(mapv render items)`: taint in a collection argument reaches `render`'s first parameter.
        (when (contains? higher-order-heads head)
          (when-let [f (thread-target (first args))]
            ;; The position must be the function *argument*, not the enclosing call: clj-kondo resolves the
            ;; enclosing position to `clojure.core/mapv`, and it is the named function we need to reach.
            (let [pos (assoc (select-keys (meta (first args)) [:row :col]) :filename filename)]
              ;; the function value is called by map/filter/etc., so it is a callee for reachability too --
              ;; `(filter mi/can-read? xs)` is how list endpoints authorize, and it is not a call node
              (vswap! sites conj {:head f :pos pos})
              (doseq [coll (rest args)]
                (vswap! calls conj {:head   f
                                    :index  0
                                    :pos    pos
                                    :region (assoc (meta coll) :filename filename)})))))
        ;; `(requiring-resolve 'metabase.foo/bar)` is a call by name -- but the name is a literal right there, so
        ;; the edge is exact. clj-kondo reports nothing for a quoted symbol, so the site keyed at the quote's
        ;; position resolves to the head as written. 159 such sites; startup and CLI dispatch run through them.
        (when (contains? #{"requiring-resolve" "resolve" "ns-resolve"} (some-> head name))
          (doseq [a args
                  :let [a (ast/unmeta a)]
                  :when (= :quote (n/tag a))
                  :let [sym (some-> (first (ast/children a)) ast/unmeta)]
                  :when (and sym (ast/symbol-node? sym) (qualified-symbol? (n/sexpr sym)))]
            (vswap! sites conj {:head (n/sexpr sym)
                                :pos  (assoc (select-keys (meta a) [:row :col]) :filename filename)})))
        ;; `(apply f xs)` executes f now: a call edge, which counts toward "does this endpoint execute a check".
        ;; `(partial f x)` and `(comp f g)` only produce something that would: a reference, which widens what is
        ;; reachable from an entry but must not clear a finding about a check that may never run.
        (let [nm (some-> head name)]
          (when-let [[fn-args value?] (cond
                                        (contains? vocab/executes-first-arg nm) [(take 1 args) false]
                                        (contains? vocab/wraps-first-arg nm)    [(take 1 args) true]
                                        (contains? vocab/wraps-every-arg nm)    [args true])]
            (doseq [a fn-args :let [t (thread-target a)] :when t]
              (vswap! sites conj (cond-> {:head t
                                          :pos  (assoc (select-keys (meta (ast/unmeta a)) [:row :col]) :filename filename)}
                                   value? (assoc :value? true))))))
        ;; One record per call *site*, for the call graph. This is separate from the per-argument `:calls`
        ;; below on purpose: a nullary call has no arguments and would otherwise vanish from the graph, which
        ;; is exactly what happened to `(b)` before this existed. Definition forms are not calls.
        ;;
        ;; A `#(f % x)` literal is keyed one column past the `#` the node starts at: that is where clj-kondo
        ;; resolves `f`; the `#` itself it reports as `clojure.core/fn*`, and a site keyed there resolved to that
        ;; and dropped the edge -- every sync step wrapped in a literal read as called by nothing.
        (when (and head (not (defn-head? head)))
          (vswap! sites conj {:head   head
                              :pos    (cond-> (assoc (select-keys (meta node) [:row :col]) :filename filename)
                                        (= :fn (n/tag node)) (update :col inc))
                              ;; the whole call, so a site resolved to a sanitizer can become a sanitized region
                              :region (assoc (meta node) :filename filename)}))
        ;; every call, including the binding forms above, contributes argument regions -- keyed as the site is
        (when head
          (let [pos (cond-> (assoc (select-keys (meta node) [:row :col]) :filename filename)
                      (= :fn (n/tag node)) (update :col inc))]
            (doseq [[i a] (map-indexed vector args)
                    rec   (arg-records filename head i pos a)]
              (vswap! calls conj rec))))))
    ;; Namespace load is an entry point: everything in src loads at startup. A top-level `def` runs its
    ;; initializer then, and a bare top-level call runs outright. Definition forms and the entry/live-body forms
    ;; handled above are excluded, as is a def that only wraps a body it does not run.
    (doseq [nd (ast/children root-node)
            :when (ast/call? nd)
            :let [head (some-> (ast/head-sym nd) name)]
            :when (and head
                       (not (defn-head? (ast/head-sym nd)))
                       (not (contains? vocab/definition-forms head))
                       (not (contains? vocab/entry-forms head))
                       (not (contains? vocab/live-body-forms head))
                       (not (taint/defendpoint-params nd))
                       (not (and (#{"def" "defonce"} head)
                                 (contains? vocab/not-run-at-load
                                            (some-> (last (ast/args nd)) ast/unmeta ast/head-sym)))))]
      (vswap! entries conj (assoc (meta nd) :filename filename :kind :startup :name (entry-name nd))))
    ;; `(def alert-routes (ns-handler 'metabase.pulse.api.alert))`: a var standing for a handler. What a wrapper
    ;; applied to the var wraps is whatever the definition names.
    (doseq [nd (ast/children root-node)
            :when (and (ast/call? nd) (contains? #{"def" "defonce"} (some-> (ast/head-sym nd) name)))
            :let [nm (some-> (first (ast/args nd)) ast/unmeta)]
            :when (and nm (ast/symbol-node? nm))]
      (vswap! handler-defs conj {:var     (symbol (str ns-sym) (str (n/sexpr nm)))
                                 :targets (handler-targets (rest (ast/args nd)) ns-sym)}))
    (let [ns-form (first (filter #(and (ast/call? %) (= 'ns (ast/head-sym %))) (ast/children root-node)))]
      {:ns ns-sym :params @params :inits @inits :calls @calls :sources @sources
       :fns @fns :entries @entries :guards @guards :privilege-guards @privilege-guards :call-sites @sites :ns-middleware @ns-middleware
       :wraps @wraps :handler-defs @handler-defs
       :tail-terms @tail-terms
       :numeric-regions @numeric :string-regions @strings :registry-regions @registry :keyed-regions @keyed
       :sanitized @sanitized
       :origin-fns @origin-fns :model-args @model-args :tails @tails :checks @checks :thread-tails @thread-tails
       ;; so value references inside the ns form (:refer) are not mistaken for uses
       :ns-region (some-> ns-form meta (assoc :filename filename))})))

;;; ----------------------------------------------- propagation -------------------------------------------------

(defn- index-by-row
  "Group `xs` by filename and then by row.

  Regions span a handful of lines, so bucketing by row turns \"is there a tainted use in here\" from a scan of
  every local usage in the codebase into a lookup of a few rows. Without it the fixpoint re-scans all ~150k
  usages for every region on every iteration, which dominates the whole run."
  [xs]
  (reduce (fn [acc {:keys [filename row] :as x}]
            (update-in acc [filename row] (fnil conj []) x))
          {}
          xs))

(defn- in-rows
  "Entries of a row index that fall on the rows `region` spans."
  [idx {:keys [filename row end-row]}]
  (when-let [by-row (get idx filename)]
    (if (= row end-row)
      (get by-row row)
      (mapcat #(get by-row %) (range row (inc (or end-row row)))))))

(defn- binding-ids-in-region
  [local-idx region]
  (into #{} (keep (fn [{:keys [id row col]}] (when (within? region row col) id)))
        (in-rows local-idx region)))

(defn source-binding-ids
  "Binding ids declared inside any trust-boundary region in `tables`."
  [tables locals]
  (let [local-idx (index-by-row locals)]
    (into #{} (mapcat #(binding-ids-in-region local-idx %))
          (mapcat :sources (vals tables)))))

(defn source-labels
  "The request sources as `{id #{label ...}}`, the seed for [[propagate]].

  Every request binding carries `:request`. The ones a `defendpoint` schema does not pin to a number also carry
  `:request/untyped` (they may arrive as a string, a map or a vector), and the ones it pins to neither a number
  nor a string -- nor a registry schema, which is closed and typed by construction -- also carry
  `:request/structured` (they may arrive as a HoneySQL clause). A `defendpoint` schema is enforced in production,
  so `id :- ms/PositiveInt` really is a number by the time the handler runs, and a rule about what Toucan does
  with a non-number has nothing to say about it."
  [tables locals]
  (let [local-idx (index-by-row locals)
        ids-in    (fn [k] (into #{} (mapcat #(binding-ids-in-region local-idx %)) (mapcat k (vals tables))))
        numeric   (ids-in :numeric-regions)
        registry  (ids-in :registry-regions)
        strings   (ids-in :string-regions)]
    (into {} (for [id (source-binding-ids tables locals)]
               [id (cond-> #{:request}
                     (not (or (numeric id) (registry id)))             (conj :request/untyped)
                     (not (or (numeric id) (registry id) (strings id))) (conj :request/structured))]))))

(defn resolve-multimethods
  "Rewrite each `defmethod`'s `:fn` to the multimethod it implements.

  `name-resolution` maps a symbol's own position to the var clj-kondo resolved it to. After this, a call to
  `metabase.driver/execute-reducible-query` reaches every driver's implementation and taints each one's
  parameters -- an over-approximation, and the sound direction. Before it, the 1,275 functions in `driver` were
  2.7% reachable."
  [tables name-resolution]
  (let [fix (fn [{:keys [name-pos] :as rec}]
              (if-let [fq (and name-pos (get name-resolution name-pos))]
                (assoc rec :fn fq)
                rec))
        ;; an implementation of an entry multimethod -- an event handler -- is itself an entry point
        entries-of (fn [fns]
                     (for [{:keys [fn region name-pos]} fns
                           :when name-pos
                           :let [kind (get vocab/entry-multimethods fn)]
                           :when kind]
                       (assoc region :kind kind :name (str "defmethod " fn))))]
    (into {} (for [[f t] tables
                   :let [t (-> t
                               (update :fns #(mapv fix %))
                               (update :params #(mapv fix %))
                               ;; what an implementation returns is what a call to the multimethod returns
                               (update :tails #(mapv fix %))
                               (update :tail-terms #(mapv fix %)))]]
               [f (update t :entries into (entries-of (:fns t)))]))))

(defn add-value-reference-sites
  "Every reference to a var that is not a call -- handed to `comp`, `partial` or `apply`, stored in a map or a
  def, `#'f` -- becomes a site, so the graph treats a function whose address is taken as callable.

  This is the standard sound approximation for higher-order code and the largest single source of unreached
  functions: 1,511 root functions were referenced only this way. clj-kondo reports every such reference and marks
  the calls among them with `:arity`, so nothing is parsed; references inside the ns form (`:refer`) are skipped."
  [tables var-usages]
  (let [ns-region-of (into {} (for [[f t] tables] [f (:ns-region t)]))
        sites (for [u var-usages
                    ;; no :arity means not a call. A macro reference has none either but is never a runtime
                    ;; value, and a defmethod's name is a definition, not a use.
                    :when (and (:to u) (:name u) (nil? (:arity u)) (not (:macro u)) (not (:defmethod u)))
                    :let [f (:filename u) nsr (get ns-region-of f)]
                    :when (and (contains? tables f)
                               (not (and nsr (within? nsr (:row u) (:col u)))))]
                {:filename f
                 :site {:head   (symbol (str (:to u)) (str (:name u)))
                        :pos    {:filename f :row (:row u) :col (:col u)}
                        ;; a reference, not an execution: it widens what a finding is reachable *from*, but
                        ;; must not satisfy an endpoint rule asking whether a check is *executed*
                        :value? true}})]
    (reduce (fn [ts {:keys [filename site]}] (update-in ts [filename :call-sites] conj site))
            tables
            sites)))

(def privilege-order
  "The least an actor must hold to start at an entry, least first: no account, any account, an elevated grant, a
  superuser. The rules' own severities know nothing about it: a splice reached only past `check-superuser` is the
  same code as one an anonymous public link reaches, and a very different finding."
  [:anonymous :session :elevated :superuser])

(def ^:private privilege-rank (into {} (map-indexed (fn [i p] [p i])) privilege-order))

(defn- superuser-name? [nm] (str/starts-with? nm "check-superuser"))

(defn- elevated-name?
  "A check a non-superuser can pass by holding a grant: an application permission (settings, monitoring,
  subscriptions) or the data-analyst flag."
  [nm]
  (or (= nm "check-has-application-permission") (str/starts-with? nm "check-data-analyst")))

(defn- entry-privilege
  "The least an actor needs to start at `entry`, an `:http` entry: what the router wrapped its namespace in
  (`ns-wrappers`), what the namespace's own `ns-handler` wraps every endpoint in (`ns-middleware`), and the checks
  within two call hops of the body (`nearby`) -- where this codebase keeps them."
  [{:keys [ns-wrappers ns-middleware nearby ns method]}]
  (let [wrapper-names (into #{} (map name) (concat ns-wrappers ns-middleware))
        nearby-names  (into #{} (map name) nearby)]
    (cond
      (or (some #(str/starts-with? % "+check-superuser") wrapper-names) (some superuser-name? nearby-names))
      :superuser

      (or (some #(str/starts-with? % "+check-has-application-permission") wrapper-names)
          (some elevated-name? nearby-names)
          ;; a grant the graph cannot see by name, see [[vocab/elevated-endpoints]]
          (vocab/elevated-endpoint? ns method))
      :elevated

      (some #(re-find vocab/authenticating-wrappers %) wrapper-names)
      :session

      :else
      :anonymous)))

(declare entry-neighbourhood)

(defn- handler-fn-kind
  "The entry kind of a request-taking function that is not an endpoint form: `:middleware` for Ring middleware,
  which runs on every request before any session is checked, and `:http` for any other -- a helper handed the
  request by an endpoint."
  [fq]
  (if (str/starts-with? (str fq) "metabase.server.middleware") :middleware :http))

(defn- handler-fn-privilege
  "As [[handler-fn-kind]]: middleware starts an anonymous path; a helper is credited with the session the
  endpoints that call it hold."
  [fq]
  (if (= :middleware (handler-fn-kind fq)) :anonymous :session))

(defn reachable-regions
  "Regions of code an HTTP request can reach.

  Every finding today is weighted the same whether an attacker can get to it or not. Walking the call graph
  *forward* from the endpoints answers that, and it re-scores every rule at once rather than needing one rule
  each.

  Entry points are `defendpoint` forms and functions that take a Ring request. The result is the set of regions --
  the entries themselves plus every function transitively called from one."
  [{:keys [tables resolve]}]
  (let [all-fns    (mapcat :fns (vals tables))
        all-calls  (mapcat :call-sites (vals tables))
        entries    (mapcat :entries (vals tables))
        ns-of      (into {} (for [[f t] tables] [f (:ns t)]))
        resolve-to (fn [{:keys [head pos]}]
                     (or (get resolve pos)
                         (when-not (qualified-symbol? head)
                           (when-let [nsym (get ns-of (:filename pos))]
                             (symbol (str nsym) (str head))))
                         head))
        ;; every region a symbol names: after multimethod resolution, twenty implementations share one symbol,
        ;; and a map from symbol to *one* region marked only the last of them reachable
        regions-of (reduce (fn [acc {:keys [fn region]}] (update acc fn (fnil conj []) region)) {} all-fns)
        ;; Everything below is scoped per file. Scanning every function in the codebase for each of a few hundred
        ;; thousand call sites is quadratic and exhausts memory long before it finishes.
        fns-by-file    (group-by #(:filename (:region %)) all-fns)
        enclosing-fn   (fn [{:keys [filename row col]}]
                         (some (fn [{:keys [fn region]}]
                                 (when (within? region row col) fn))
                               (get fns-by-file filename)))
        ;; a fn whose parameters are a trust boundary is itself an entry
        handler-fns (into #{} (keep enclosing-fn) (mapcat :sources (vals tables)))
        ;; caller -> callees
        build-edges (fn [calls]
                      (persistent!
                       (reduce (fn [acc call]
                                 (if-let [caller (enclosing-fn (:pos call))]
                                   (assoc! acc caller (conj (get acc caller #{}) (resolve-to call)))
                                   acc))
                               (transient {})
                               calls)))
        ;; every reference, for deciding what a finding is reachable *from* (over-approximation is safe there)
        edges      (build-edges all-calls)
        ;; executions only, for deciding whether an endpoint *runs* a check (over-approximation would hide a
        ;; missing one -- six model-read findings vanished when a referenced check counted as executed)
        call-edges (build-edges (remove :value? all-calls))
        ;; frontier BFS: expand only what the last round added. Re-expanding the whole seen-set each round was
        ;; harmless at closures of ~90 functions; once multimethod dispatch pulls every driver into a closure it
        ;; is not.
        closure*   (fn [edges seeds]
                     (loop [seen (set seeds), frontier (set seeds)]
                       (if (empty? frontier)
                         seen
                         (let [next (into #{} (comp (mapcat #(get edges %)) (remove seen)) frontier)]
                           (recur (into seen next) next)))))
        closure    (partial closure* edges)
        ;; each endpoint form keeps its own seeds, so a rule can ask what *this* endpoint reaches rather
        ;; than what any endpoint reaches
        calls-by-file (group-by #(:filename (:pos %)) all-calls)
        ;; scoped to the entry's own file -- the third time a whole-codebase scan per position has appeared in
        ;; this file, and at 744 endpoints x 192k sites it was 2.8s of a 3.2s function
        entry-recs (for [e entries]
                     (assoc e :seeds (into #{} (comp (filter #(and (not (:value? %))
                                                                   (within? e (:row (:pos %)) (:col (:pos %)))
                                                                   ;; the site at the entry's own start is the
                                                                   ;; defendpoint form itself, not something it calls
                                                                   (not= [(:row e) (:col e)]
                                                                         [(:row (:pos %)) (:col (:pos %))])))
                                                     (map resolve-to))
                                           (get calls-by-file (:filename e)))))
        ;; one closure per entry kind, so a finding can say what reaches it: a request, a job, a queue...
        kinds      (into #{:http :middleware} (map :kind) entries)
        refs-in    (fn [e] (into #{} (comp (filter #(and (:value? %)
                                                         (within? e (:row (:pos %)) (:col (:pos %)))))
                                           (map resolve-to))
                                 (get calls-by-file (:filename e))))
        seeds-for  (fn [kind]
                     (into (into #{} (filter #(= kind (handler-fn-kind %))) handler-fns)
                           (comp (filter #(= kind (:kind %))) (mapcat #(into (:seeds %) (refs-in %))))
                           entry-recs))
        reached    (into {} (for [k kinds] [k (closure (seeds-for k))]))
        kinds-of   (reduce (fn [acc [k fqs]] (reduce #(update %1 %2 (fnil conj #{}) k) acc fqs)) {} reached)
        ;; the least an actor needs at each http entry, from the router's wrappers, the namespace's own
        ;; middleware and the checks two hops into the body -- what `entry-privilege` reads
        wrappers   (handler-wrappers tables)
        middleware (into {} (for [[f t] tables] [f (:ns-middleware t)]))
        entry-recs (for [e entry-recs]
                     (if (= :http (:kind e))
                       (assoc e :privilege (entry-privilege {:ns-wrappers   (get wrappers (get ns-of (:filename e)) #{})
                                                             :ns-middleware (get middleware (:filename e) #{})
                                                             :nearby        (entry-neighbourhood {:call-edges call-edges} e 2)
                                                             :ns            (get ns-of (:filename e))
                                                             :method        (:method e)}))
                       e))
        ;; one closure per privilege level, as per kind above, so a finding can say the least that reaches it
        ;; seed -> the name of an entry that seeds it, so a finding can say which entry set its grade
        seeds-at   (fn [p]
                     (into (into {} (comp (filter #(= p (handler-fn-privilege %))) (map (fn [fq] [fq (str fq)]))) handler-fns)
                           ;; `POST /` is one of forty; the namespace says which
                           (for [e entry-recs :when (= p (:privilege e)), fq (into (:seeds e) (refs-in e))]
                             [fq (str (:name e) " in " (get ns-of (:filename e)))])))
        ;; multi-source BFS over executions only, each function labelled with the first entry to reach it. The
        ;; reference closure of any endpoint holds most of the codebase -- a permission check reaches the event
        ;; system, which reaches everything -- and graded a third of all findings as anonymous because the login
        ;; endpoint's closure held them. What an endpoint *runs* is the question here.
        ;; The walk stops at an event dispatch: `publish-event!` resolves to every handler, and the handlers reach
        ;; the whole model layer, so the login endpoint graded a third of the tree as anonymous through them. A
        ;; handler is an entry of its own kind (`:event`), graded as a background task -- what it runs is decided
        ;; by what was stored, not by who fired the event.
        labelled   (fn [seeds]
                     (loop [seen seeds, frontier (apply dissoc seeds (keys vocab/entry-multimethods))]
                       (if (empty? frontier)
                         seen
                         (let [next (into {} (for [[fq from] frontier, callee (get call-edges fq)
                                                   :when (and (not (contains? seen callee))
                                                              (not (contains? vocab/entry-multimethods callee)))]
                                               [callee from]))]
                           (recur (merge next seen) next)))))
        reached-at (into {} (for [p privilege-order] [p (labelled (seeds-at p))]))
        ;; fq -> {privilege entry-name}
        privs-of   (reduce (fn [acc [p fq->entry]] (reduce (fn [acc [fq from]] (assoc-in acc [fq p] from)) acc fq->entry))
                           {} reached-at)
        regions    (concat (for [e entry-recs] (cond-> (assoc e :kinds #{(:kind e)})
                                                 (:privilege e) (assoc :privileges {(:privilege e) (str (:name e) " in " (get ns-of (:filename e)))})))
                           (for [[fq ks] kinds-of, r (get regions-of fq)]
                             (assoc r :kinds ks :privileges (get privs-of fq {}))))
        ;; for [[flows-to]]: every entry that can start a path, with everything it seeds, plus the request-taking
        ;; functions that start an http path without being an entry form; `:i` is the index into the vector
        flow-entries (into [] (map-indexed (fn [i e] (assoc e :i i)))
                           (concat (for [e entry-recs] (assoc e :flow-seeds (into (:seeds e) (refs-in e))))
                                   (for [fq handler-fns :let [r (first (get regions-of fq))] :when r]
                                     (assoc r :kind (handler-fn-kind fq) :name (str fq) :flow-seeds #{fq}))))]
    {;; grouped by file so a lookup does not scan every reachable region in the codebase
     :by-file (group-by :filename regions)
     :edges      edges
     :call-edges call-edges
     :entries    (vec entry-recs)
     :ns-middleware-by-file middleware
     :wrappers-by-ns wrappers
     ;; {filename [{:privilege :superuser :body region}]}: branches a superuser flag guards
     :privilege-guards-by-file (into {} (for [[f t] tables] [f (:privilege-guards t)]))
     ;; for [[flows-to]]: every entry that can start a path, with everything it seeds, plus the request-taking
     ;; functions that start an http path without being an entry form
     :flow-entries flow-entries
     :flow-entries-by-file (group-by :filename flow-entries)
     ;; seed function -> the flow entries it starts, by index into `:flow-entries`
     :entries-by-seed (delay (reduce (fn [acc {:keys [i flow-seeds]}]
                                       (reduce #(update %1 %2 (fnil conj []) i) acc flow-seeds))
                                     {}
                                     flow-entries))
     ;; the backward walks of [[flows-to]], by the function walked from
     :hops-cache  (atom {})
     :regions-of  regions-of
     :fns-by-file fns-by-file
     ;; callee -> callers, built on first use: only the reports need it
     :reverse-edges (delay (persistent!
                            (reduce (fn [acc [caller callees]]
                                      (reduce #(assoc! %1 %2 (conj (get %1 %2 #{}) caller)) acc callees))
                                    (transient {})
                                    edges)))}))

(defn entries
  "The endpoint forms found by [[reachable-regions]], each a region carrying its own `:seeds`."
  [reach]
  (:entries reach))

(defn entry-closure
  "Every function one endpoint form *executes*, transitively -- along call edges only, so a check that is merely
  referenced somewhere does not count as run. Frontier BFS, as in [[reachable-regions]]."
  [{:keys [call-edges]} {:keys [seeds]}]
  (loop [seen (set seeds), frontier (set seeds)]
    (if (empty? frontier)
      seen
      (let [next (into #{} (comp (mapcat #(get call-edges %)) (remove seen)) frontier)]
        (recur (into seen next) next)))))

(defn entry-neighbourhood
  "As [[entry-closure]], stopped after `depth` hops: what an endpoint calls, what those call, and no further.

  The full closure of a typical endpoint holds most of the codebase -- a permission check reaches the event
  system, which reaches everything -- so a rule asking \"does this endpoint do X\" gets the same answer for every
  endpoint. Two hops is where the endpoint's own helpers live."
  [{:keys [call-edges]} {:keys [seeds]} depth]
  (loop [seen (set seeds), frontier (set seeds), n depth]
    (if (or (empty? frontier) (zero? n))
      seen
      (let [next (into #{} (comp (mapcat #(get call-edges %)) (remove seen)) frontier)]
        (recur (into seen next) next (dec n))))))

(defn reachable-from
  "The kinds of entry point from which execution can reach `pos`: a subset of #{:http :middleware :job :mq :cli
  :event :startup ...}. Empty means nothing modelled reaches it."
  [{:keys [by-file]} {:keys [filename row col]}]
  (into #{} (mapcat :kinds) (filter #(within? % row col) (get by-file filename))))

(declare min-privilege-entry)

(defn min-privilege
  "The least an actor needs to reach `pos`: the lowest [[privilege-order]] level among the http entries whose
  closure holds it; `:background` when only a job, an event, a queue or startup reaches it -- no request at all,
  so no actor, and the taint origins say who planted what it runs; nil when nothing modelled reaches it."
  [reach pos]
  (:privilege (min-privilege-entry reach pos)))

(defn min-privilege-entry
  "As [[min-privilege]], with the entry that set it: `{:privilege :anonymous :entry \"GET /oembed\"}`."
  [{:keys [by-file privilege-guards-by-file]} {:keys [filename row col]}]
  (let [regions (filter #(within? % row col) (get by-file filename))
        privs   (into {} (mapcat :privileges) regions)
        guarded (some #(when (within? (:body %) row col) (:privilege %)) (get privilege-guards-by-file filename))]
    (cond
      (and guarded (seq privs))            {:privilege guarded :entry "a branch the superuser flag guards"}
      (seq privs)                          (let [p (apply min-key privilege-rank (keys privs))]
                                             {:privilege p :entry (get privs p)})
      (some (comp seq :kinds) regions)     {:privilege :background}
      :else                                nil)))

(defn reachable?
  "Whether anything modelled reaches `pos`."
  [reach pos]
  (boolean (seq (reachable-from reach pos))))

(defn- walk-back
  "The function holding `pos`, and a breadth-first walk backwards from it over every reference: for each function
  that can reach it, the next hop towards it and the distance. Cached per holding function: a thousand findings in
  a few hundred functions cost a few hundred walks."
  [{:keys [reverse-edges fns-by-file regions-of hops-cache]} {:keys [filename row col]}]
  (let [holder (some (fn [{:keys [fn region]}] (when (within? region row col) {:fn fn :region region}))
                     (get fns-by-file filename))
        target (:fn holder)
        walk   (fn [target]
                 (loop [hops {target nil}, depth {target 0}, frontier [target], d 1]
                   (if (empty? frontier)
                     {:hops hops :depth depth}
                     (let [[hops depth next] (reduce (fn [[hs ds nx] f]
                                                       (reduce (fn [[hs ds nx] caller]
                                                                 (if (contains? hs caller)
                                                                   [hs ds nx]
                                                                   [(assoc hs caller f) (assoc ds caller d) (conj nx caller)]))
                                                               [hs ds nx]
                                                               (get @reverse-edges f)))
                                                     [hops depth []]
                                                     frontier)]
                       (recur hops depth next (inc d))))))
        {:keys [hops depth]} (when target
                               (or (get @hops-cache target)
                                   (let [w (walk target)]
                                     (swap! hops-cache assoc target w)
                                     w)))
        ;; the last step is the function holding `pos`, at the region that holds it -- twenty defmethods share
        ;; one symbol, and the first region by that name is usually some other driver's
        step   (fn [fq] (let [r (if (= fq target) (:region holder) (first (get regions-of fq)))]
                          {:name (str fq) :filename (:filename r) :row (:row r) :col (:col r)}))]
    {:target target
     :hops   hops
     :depth  depth
     ;; the path from a function the walk visited down to the holder
     :from   (fn [seed] (->> (iterate hops seed) (take-while some?) (mapv step)))}))

(defn flows-to
  "How execution gets to `pos`, per entry kind:

      {:http {:count 3                      ; entries of this kind that reach it
              :entries [\"GET /a\" ...]      ; the first few, shortest path first
              :path [step ...]}}            ; one shortest path: the entry, then each function, ending at the
                                            ; function holding `pos`. Each step has :name :filename :row :col.

  A breadth-first walk backwards from the function holding `pos` over every reference (see [[walk-back]]); an
  entry reaches `pos` when one of its seeds was visited, and the path follows the hops from that seed. A
  position directly inside an entry form has a one-step path. Empty when nothing modelled reaches `pos` -- see
  [[callers-of]] for what the report says then.

  The entries are found from the visited functions rather than by testing every entry."
  [{:keys [flow-entries entries-by-seed flow-entries-by-file] :as reach} {:keys [filename row col] :as pos}]
  (let [{:keys [hops depth from]} (walk-back reach pos)
        direct  (into #{} (comp (filter #(within? % row col)) (map :i)) (get flow-entries-by-file filename))
        ;; in entry order, so that ties between equally short paths resolve the same way every run
        indexes (into (sorted-set) (concat direct (when hops (mapcat #(get @entries-by-seed %) (keys hops)))))
        reached (for [i indexes
                      :let [e    (flow-entries i)
                            path (if (contains? direct i)
                                   []
                                   (from (first (sort-by depth (filter #(contains? hops %) (:flow-seeds e))))))]
                      ;; a request-taking function is its own seed: the entry step already names it
                      :let  [path (if (= (:name e) (:name (first path))) (rest path) path)]]
                  {:entry e
                   :path  (into [{:name (:name e) :kind (:kind e) :filename (:filename e) :row (:row e) :col (:col e)}]
                                path)})]
    (into {} (for [[kind rs] (group-by #(:kind (:entry %)) reached)
                   :let [rs (sort-by (comp count :path) rs)]]
               [kind {:count   (count rs)
                      :entries (into [] (comp (map #(:name (:entry %))) (distinct) (take 5)) rs)
                      :path    (:path (first rs))}]))))

(defn callers-of
  "For a position no entry point reaches, how the code is used anyway:

      {:count 2                             ; functions that reach it and that nothing calls -- the roots
       :cyclic? false                        ; true when the chain ends in a loop rather than at a root
       :path [step ...]}                    ; from the farthest root down to the function holding `pos`

  The same backwards walk as [[flows-to]]; a root is a visited function nothing but itself calls -- one arity of
  a `defn` delegating to another is not what calls it. A function nothing calls is its own root, with a one-step
  path. When every caller loops back, there is no root and the farthest visited function is named instead, with
  `:cyclic?`. nil for a position outside every function.

  This is what a finding shows in place of a flow when no entry point was found: the linter did see the callers,
  and a reader wants to know that `apply-transform!` is where the graph ran out, not that the chain was never
  looked at. A root is where the *analysis* stops -- a call through a var or a multimethod it does not model is
  invisible here -- so the report words it as callers it cannot follow, not as code nothing calls."
  [{:keys [reverse-edges] :as reach} pos]
  (let [{:keys [hops depth from]} (walk-back reach pos)
        roots (when hops (filter #(empty? (disj (set (get @reverse-edges %)) %)) (keys hops)))
        ;; the farthest caller, which is a root unless the chain loops
        pick  (first (sort-by (juxt (comp - depth) str) (or (seq roots) (keys hops))))]
    (when pick
      {:count   (count roots)
       :cyclic? (not (contains? (set roots) pick))
       :path    (from pick)})))

(defn sanitized-positions
  "Usage positions that a validating guard has already vouched for.

  If a conditional tests a tainted value with an allow-list check, uses of that value inside the conditional are
  not worth reporting. `metabase.ai-tracing.api/trace-file` is the case that motivated this: it matches the id
  against an anchored regex and checks the resolved path's parent before opening anything, and was reported
  anyway.

  `tainted` is the propagated label map, or `:all` for the any-local policy, under which every local counts and
  so every local a guard checks is vouched for."
  [{:keys [tables local-usages tainted]}]
  (let [usage-idx (index-by-row local-usages)
        tainted?  (if (= :all tainted) (constantly true) #(contains? tainted %))]
    (reduce
     (fn [acc {:keys [checks body]}]
       ;; ids a validator was actually applied to -- inside the validator call, not merely somewhere in the test
       (let [checked (into #{} (for [check checks
                                     {:keys [id row col]} (in-rows usage-idx check)
                                     :when (and (tainted? id) (within? check row col))]
                                 id))]
         (if (empty? checked)
           acc
           (reduce (fn [acc {:keys [id row col filename]}]
                     (if (and (contains? checked id) (within? body row col))
                       (update acc filename (fnil conj #{}) [row col])
                       acc))
                   acc
                   (in-rows usage-idx body)))))
     {}
     (mapcat :guards (vals tables)))))

(defn origin-of
  "The label a call to `fq-sym` carries, or nil: from the vocabulary, its prefixes, and the origins the code
  declared with `^{:taint/source ...}` (`declared` is `{fq-sym label}`)."
  [declared fq-sym]
  (or (get declared fq-sym)
      (get vocab/origin-functions fq-sym)
      (let [s (str fq-sym)]
        (some (fn [[prefix label]] (when (str/starts-with? s prefix) label)) vocab/origin-prefixes))))

(defn sanitizing-fns
  "The functions whose return is sanitized, by fully qualified symbol: every tail form is a call to a sanitizer
  -- one of [[dev.security-lint.vocabulary/resolved-sanitizers]] as `resolve` resolves it, a name in
  `propagation-sanitizers`, or another function this finds -- so `(defn- drop-sql [t] (sql/format ...))` is as
  much a sanitizer as `sql/format` is, and a call to it clears what it was handed. Fixpoint over the tails, since
  a wrapper of a wrapper counts. A function with a tail that is not a call, or one tail out of two that builds by
  hand, is not one."
  [tables resolve]
  (let [tails   (group-by :fn (mapcat :tails (vals tables)))
        ;; `fn` -> the head of each tail, as `resolve` sees it; nil for a tail that is no call
        heads   (into {} (for [[fq ts] tails]
                           [fq (for [{:keys [head region]} ts]
                                 (when head
                                   (let [pos (assoc (:pos head) :filename (:filename region))]
                                     [(get resolve pos) (:head head)])))]))
        clean?  (fn [known [fq head]]
                  (or (and fq (contains? known fq))
                      (taint/sanitizer? head vocab/propagation-sanitizers)))]
    (loop [known vocab/resolved-sanitizers]
      (let [known' (into known (for [[fq hs] heads
                                     :when (and (seq hs) (every? some? hs) (every? #(clean? known %) hs))]
                                 fq))]
        (if (= known known') (apply disj known vocab/resolved-sanitizers) (recur known'))))))

(defn resolved-sanitized-regions
  "The regions of every call that resolves to one of `fqs` -- [[dev.security-lint.vocabulary/resolved-sanitizers]]
  and what [[sanitizing-fns]] found -- the `:extra-sanitized` input of [[propagate]]. A sanitizer that is the last
  step of a thread sanitizes the whole thread: its earlier steps are the sanitizer's input."
  [tables var-usages fqs]
  (let [regions (into {} (for [t (vals tables), {:keys [pos region]} (:call-sites t)] [pos region]))
        threads (into {} (for [t (vals tables), {:keys [pos region]} (:thread-tails t)] [pos region]))]
    (vec (for [{:keys [filename row col to name]} var-usages
               :when (and to name (contains? fqs (symbol (str to) (str name))))
               :let  [pos {:filename filename :row row :col col}
                      r   (or (get threads pos) (get regions pos))]
               :when r]
           r))))

(defn origin-calls
  "Every call site that resolves to an origin function, as `{:filename :row :col :label}`, the `:origins` input
  of [[propagate]]. A Toucan read of a named model is refined to `:app-db/<Model>`.

  A call to an object check -- `(api/read-check :model/Card id)` -- is an origin too, twice over: it returns the
  object, which was read from the application database, and that object is checked. Both labels."
  [tables var-usages]
  (let [declared   (into {} (for [t (vals tables), {:keys [fn label]} (:origin-fns t)] [fn label]))
        model-args (into {} (mapcat :model-args) (vals tables))]
    (vec (for [{:keys [filename row col to name]} var-usages
               :when (and to name)
               :let  [pos    {:filename filename :row row :col col}
                      label  (origin-of declared (symbol (str to) (str name)))
                      check? (re-find vocab/object-checks (str name))]
               :when (or label check?)
               :let  [model (get model-args pos)]
               l     (concat (when label [(if (and model (= :app-db label)) (keyword "app-db" model) label)])
                             (when check? [(if model (keyword "checked" model) :checked)]))]
           (assoc pos :label l)))))

(defn- origin-idx
  "Origin call sites by (file, row): `{filename {row [{:row :col :end-row :end-col :label} ...]}}`."
  [origins]
  (reduce (fn [acc {:keys [filename row end-row] :as o}]
            (reduce #(update-in %1 [filename %2] (fnil conj []) o)
                    acc
                    (range row (inc (or end-row row)))))
          {}
          origins))

(defn- checks-backward
  "Carry the `:checked` labels *backward* through call arguments: a check applied inside a callee vouches for the
  value the caller passed in. `(defn save! [card] (api/write-check card) ...)` checks the caller's `card` too,
  and `(create! body)` checks the caller's `body` when `create!` read-checks `(:card_id body)`.

  Only the check labels flow this way -- taint flows with the data, from caller to callee -- and only from a
  check *applied in the callee* (`checked` is the check marks themselves), never from a check label that
  reached the callee's parameter forward from some other caller: `(sink card) (sink card-id)` must not make
  `card-id` checked because `card` was. Fixpoint over the call records, keyed by callee: a round looks only at
  the calls of functions whose parameters gained a check. Returns `{id #{check-label}}`."
  [checked {:keys [local-idx usage-idx calls slots-for resolve-call locals inits params]}]
  (let [check?        (fn [l] (= :checked (taint/label-kind l)))
        checks-of     (fn [t id] (into #{} (filter check?) (get t id)))
        params-by-id  (into {} (for [{:keys [id filename row col]} locals] [id {:filename filename :row row :col col}]))
        ;; binding id -> the region it was initialized from: a check on `(t2/select-one :model/Card id)`'s
        ;; result vouches for `id`, the fetched object standing for the id that fetched it
        init-of       (into {} (for [{:keys [bind region key]} inits, id (binding-ids-in-region local-idx bind)]
                                 [id [region key]]))
        by-i          (into {} (map (juxt :i identity)) calls)
        calls-by-fq   (group-by resolve-call calls)
        fn-of-id      (into {} (for [{:keys [fn region]} params, id (binding-ids-in-region local-idx region)]
                                 [id fn]))
        ;; callee param binding id -> the calls that feed it, built for the callees whose params carry a check as
        ;; those turn up: resolving every call in the codebase to find the few that feed a checked parameter was
        ;; a third of the propagation's time
        index-fns     (fn [cbp fqs]
                        (persistent!
                         (reduce (fn [acc fq]
                                   (reduce (fn [acc {:keys [index i] :as call}]
                                             (reduce (fn [acc slot]
                                                       (reduce (fn [acc id] (assoc! acc id (conj (get acc id #{}) i)))
                                                               acc
                                                               (slot-binding-ids local-idx slot call)))
                                                     acc
                                                     (slots-for fq index)))
                                           acc
                                           (get calls-by-fq fq)))
                                 (transient cbp)
                                 fqs)))]
    (loop [t checked, fresh (into #{} (filter #(seq (checks-of t %))) (keys t)), cbp {}, indexed #{}]
      (if (empty? fresh)
        t
        (let [new-fns (into #{} (comp (keep fn-of-id) (remove indexed)) fresh)
              cbp     (index-fns cbp new-fns)
              pairs (concat
                     (for [id    fresh
                           :let  [ls (checks-of t id)]
                           i     (get cbp id)
                           :let  [call (by-i i)]
                           {uid :id row :row col :col} (in-rows usage-idx (:region call))
                           :when (and (within? (:region call) row col) (contains? params-by-id uid))]
                       [uid ls])
                     (for [id    fresh
                           :let  [ls (checks-of t id), [region key] (get init-of id)]
                           :when region
                           {uid :id row :row col :col} (in-rows usage-idx region)
                           :when (within? region row col)]
                       [uid (if key (into #{} (map #(taint/key-scoped % key)) ls) ls)]))
              [t' fresh'] (reduce (fn [[t fresh] [id ls]]
                                    (let [old (get t id #{}), new (into old ls)]
                                      (if (= old new) [t fresh] [(assoc t id new) (conj fresh id)])))
                                  [t #{}]
                                  pairs)]
          (recur t' fresh' cbp (into indexed new-fns)))))))

(declare propagate*)

(def ^:private max-chase-fanout
  "How many build sites [[param-shapes]] will report in place of one forwarding call. Past this the forwarding call
  is the more useful finding: a reviewer can read one line and follow it, where twenty alerts are a wall."
  10)

(def ^:private max-chase-depth
  "How many forwarding calls [[param-shapes]] walks out through before reporting where it stands. Chains this long
  are already unusual; the cap is a backstop for graphs the visited set does not cut."
  8)

(defn- wrap-vals
  "The labels of a map whose values carry `labels`: `#{:shape/keyed}` becomes `#{:shape/vals-keyed}`, and a
  level deeper for each nesting -- `:shape/vals-vals-keyed` for a map of maps of literal rows."
  [labels]
  (into #{} (map #(keyword "shape" (str "vals-" (name %)))) labels))

(defn- unwrap-vals
  "The labels of one value of a map carrying `labels`: one `vals-` off each; a label with none -- a keyed
  literal, an opaque map -- says nothing about its values, so the value is opaque."
  [labels]
  (into #{} (map (fn [l]
                   (let [nm (name l)]
                     (if (str/starts-with? nm "vals-")
                       (keyword "shape" (subs nm 5))
                       :shape/opaque))))
        labels))

(defn- opaque-labels?
  "Whether shape `labels` say anything but keyed: opaque, or a map whose keys are values."
  [labels]
  (boolean (some #(not= :shape/keyed %) labels)))

(defn- param-shapes
  "`{param-id #{:shape/keyed}}`: the shape (see [[arg-shape]]) of what each parameter receives, over every call
  that feeds it. A bare parameter handed on -- `(defn create! [m] (insert! m))` -- passes its own shape along;
  one nothing feeds, or that a request bound, is opaque when handed on -- unless a closed `defendpoint` schema
  declared its keys, which makes it keyed at the boundary. A bare `let` local handed on has its init's shape --
  `(let [revision {:before b :after a}] (insert! revision))` is keyed -- followed back through locals bound to
  locals; a call has the shape of the callee's tails. A parameter no call feeds gets nothing.

  Not a taint label: a shape is a fact about the argument as written at the call, and moving it with the values
  would say a map built from a parameter's fields has that parameter's shape. A destructured parameter's `name`
  inside `{:name name}` is not what makes the map keyed or not.

  Its `:feeders` are the calls that handed a parameter a map of unknown keys, by the parameter they feed, each
  walked out past the calls that only forward what they were given, to the call that built the map."
  [{:keys [calls slot-ids resolve-call params-by-fn param-ids inits bind-ids keyed-ids tails usage-at resolve
           ns-of local-idx]}]
  (let [;; request bindings under a closed schema: keyed at the boundary, before any call
        boundary (into {} (for [id keyed-ids] [id #{:shape/keyed}]))
        ;; the call a binding's init is, or reads a key off: `(f x)`, `(:k (f x))`
        init-call (fn [{:keys [kterm]}]
                    (cond
                      (and (:call kterm) (:head (:call kterm))) [(:call kterm) nil]
                      (and (:key-of kterm) (:call (:key-of kterm)) (:head (:call (:key-of kterm))))
                      [(:call (:key-of kterm)) (:key kterm)]))
        call-ref  (fn [{:keys [head pos]}] {:ref (assoc pos :head head)})
        ;; a local bound by `let`: its init's term. `[{:keys [a]} (f x)]` and `[a (:a (f x))]` bind `a` to what
        ;; `f` returns under `:a`.
        bound    (into {}
                       (concat
                        (for [{:keys [i shape] :as init} inits
                              :let  [ids (bind-ids i)
                                     [c k] (init-call init)]
                              :when (= 1 (count ids))
                              :let  [term (cond
                                            (and c k) {:key-ref (call-ref c) :k k}
                                            :else     shape)]
                              :when term]
                          [(first ids) term])
                        (for [{:keys [keys] :as init} inits
                              :when keys
                              :let  [[c k] (init-call init)]
                              :when (and c (nil? k))
                              [key region] keys
                              :when (not= key :as)
                              :let  [ids (vec (binding-ids-in-region local-idx region))]
                              :when (= 1 (count ids))]
                          [(first ids) {:key-ref (call-ref c) :k key}])))
        ;; what a function returns: its tails' terms, keyed when every one is
        tails-by-fn (group-by :fn tails)
        returns  (into {} (for [[fq ts] tails-by-fn]
                            [fq {:all (vec (keep :shape ts))}]))
        ;; what a term holds under a key: a literal's entry, what a called function returns under it, one of
        ;; the branches'; a keyed or opaque map says nothing about its values
        key-of-term (fn key-of-term [term k]
                      (cond
                        (nil? term)     nil
                        (:literal term) (get (:literal term) k)
                        (:ref term)     {:key-ref term :k k}
                        (:all term)     {:all (vec (keep #(key-of-term % k) (:all term)))}
                        :else           :opaque))
        ;; and under each key of a function's return: each tail's entry when it is a literal -- none when the
        ;; literal lacks the key: nil there, no map -- else what the tail's own term holds under it
        key-returns (fn [fq k]
                      {:all (vec (keep (fn [{:keys [key-shapes shape]}]
                                         (if key-shapes (get key-shapes k) (key-of-term shape k)))
                                       (get tails-by-fn fq)))})
        feeds    (for [{:keys [i shape pos region] :as call} calls
                       :when (and shape (not (:key call)) (contains? params-by-fn (resolve-call call)))
                       :let  [to (slot-ids i)]
                       :when (seq to)]
                   ;; `:pos` is the call itself, `:fq` what it calls and `:region` the argument handed over: a
                   ;; rule that reports where a map is handed over, rather than where it is written, needs the
                   ;; call, and grades it by what that argument carried
                   {:to to :term shape :pos pos :fq (resolve-call call) :region region})
        fed      (into #{} (mapcat :to) feeds)
        ;; what each parameter was handed, as terms, for what it holds under a key
        feeds-by-id (reduce (fn [acc {:keys [to term]}] (reduce #(update %1 %2 (fnil conj []) term) acc to)) {} feeds)
        ;; `#{}` is not yet known -- a fed parameter whose callers are still being resolved, a cycle -- and a
        ;; round that meets it waits; nil is no map. Anything not keyed in a union makes it opaque: `(merge {:a 1}
        ;; body)` has body's keys too, and so does a merge with a map whose keys are values.
        combine  (fn [ls]
                   (cond (empty? ls)               nil
                         (some empty? ls)          #{}
                         (some opaque-labels? ls)  #{:shape/opaque}
                         :else                     #{:shape/keyed}))
        resolve-fq (fn [{:keys [filename row col head]}]
                     (or (get resolve {:filename filename :row row :col col})
                         (when-not (qualified-symbol? head)
                           (when-let [nsym (get ns-of filename)]
                             (symbol (str nsym) (str head))))
                         head))]
    (loop [m {}]
      (let [;; what a function or a binding holds under a key, once per round: the walk through feeds and tails
            ;; fans out, and without this a parameter fed by hundreds of calls was walked once per path
            key-memo  (atom {})
            eval-term (fn eval-term [term seen]
                        (cond
                          (nil? term)      nil
                          (keyword? term)  #{(keyword "shape" (name term))}
                          (:literal term)  #{:shape/keyed}
                          (:all term)      (combine (keep #(eval-term % seen) (:all term)))
                          (:map-vals term) (some-> (eval-term (:map-vals term) seen) wrap-vals)
                          (:vals-of term)  (some-> (eval-term (:vals-of term) seen) unwrap-vals)
                          ;; what a function returns under a key, or what a local holds under it
                          (:key-ref term)  (let [{:keys [filename row col] :as r} (:ref (:key-ref term))
                                                 k    (:k term)
                                                 id   (get usage-at [filename row col])
                                                 fq   (when-not id (resolve-fq r))
                                                 mk   (if id [:id id k] [:key fq k])
                                                 memo (fn [f]
                                                        (cond
                                                          (contains? seen mk)      #{}
                                                          (contains? @key-memo mk) (get @key-memo mk)
                                                          :else
                                                          (let [ls (f (conj seen mk))]
                                                            (swap! key-memo assoc mk ls)
                                                            ls)))]
                                             (cond
                                               (and id (contains? bound id))
                                               (memo #(eval-term (key-of-term (get bound id) k) %))

                                               ;; a parameter: under the key, what each call handed it holds there
                                               (and id (contains? feeds-by-id id))
                                               (memo #(eval-term {:all (mapv (fn [t] (key-of-term t k)) (get feeds-by-id id))} %))

                                               id
                                               #{:shape/opaque}

                                               (contains? tails-by-fn fq)
                                               (memo #(eval-term (key-returns fq k) %))

                                               :else
                                               #{:shape/opaque}))
                          :else
                          (let [{:keys [filename row col] :as r} (:ref term)]
                            (if-let [id (get usage-at [filename row col])]
                              ;; a local
                              (cond
                                (contains? seen [:id id])   #{}
                                (contains? boundary id)     (get boundary id)
                                (contains? param-ids id)    (if (contains? fed id) (get m id #{}) #{:shape/opaque})
                                (contains? bound id)        (eval-term (get bound id) (conj seen [:id id]))
                                :else                       #{:shape/opaque})
                              ;; a function: what it returns, when the graph holds it
                              (let [fq (resolve-fq r)]
                                (cond
                                  (contains? seen [:fn fq]) #{}
                                  (contains? returns fq)    (eval-term (get returns fq) (conj seen [:fn fq]))
                                  :else                     #{:shape/opaque}))))))
            m' (reduce (fn [m {:keys [to term]}]
                         (let [ls (eval-term term #{})]
                           (if (seq ls)
                             (reduce #(update %1 %2 (fnil into #{}) ls) m to)
                             m)))
                       m
                       feeds)]
        (if (= m m')
          (let [;; which calls contributed the opaque half, by the parameter they feed
                direct  (reduce (fn [acc {:keys [to term pos fq region]}]
                                  (if (opaque-labels? (eval-term term #{}))
                                    (reduce #(update %1 %2 (fnil conj []) {:pos pos :fq fq :term term :region region}) acc to)
                                    acc))
                                {}
                                feeds)
                ;; the parameter an argument merely passes through, when it does: `(batch! rows)` in a function
                ;; whose own `rows` parameter that is, or `(batch! (partition-all n rows))`, which keeps its
                ;; elements. `(batch! (build-rows x))` passes nothing through -- the keys are chosen right there.
                through (fn through [term]
                          (when-let [{:keys [filename row col]} (:ref term)]
                            (when-let [id (get usage-at [filename row col])]
                              (cond
                                (contains? param-ids id) id
                                (contains? bound id)     (through (get bound id))
                                :else                    nil))))
                ;; A call that only forwards is not where a fix goes. Walk out to the calls that feed *its*
                ;; parameter, and stop at the first that builds the map. Bounded three ways, and each bound is
                ;; load-bearing on a real tree: the parameters already visited, a depth, and a fan-out past which
                ;; the forwarding call is the better report -- twenty alerts from one line help nobody. Results are
                ;; cached per parameter; a parameter reached along two different paths keeps the first path's
                ;; loop-cutting, which can only move where a finding in a cycle is reported.
                cache   (atom {})
                drop-t  (fn [f] (dissoc f :term))]
            (letfn [(expand [f seen depth]
                      (let [q (when (< depth max-chase-depth) (through (:term f)))]
                        (if (and q (not (contains? seen q)) (seq (get direct q)))
                          (let [out (feeders-of q (conj seen q) (inc depth))]
                            (if (and (seq out) (<= (count out) max-chase-fanout)) out [(drop-t f)]))
                          [(drop-t f)])))
                    (feeders-of [q seen depth]
                      (if (contains? @cache q)
                        (get @cache q)
                        ;; a call forwarding a parameter already being chased is the recursion, not a place a map
                        ;; is built; unless it is the only one, and then it is all there is
                        (let [fs  (remove #(contains? seen (through (:term %))) (get direct q))
                              out (when (seq fs)
                                    (into [] (comp (mapcat #(expand % seen depth)) (distinct)) fs))]
                          (swap! cache assoc q out)
                          out)))]
              {;; a map whose keys are values, handed on whole, is opaque to a rule about keys; only the walk
               ;; above tells its values apart, so the `vals-` labels stop here
               :shapes  (merge (into {} (for [[id ls] m]
                                          [id (into #{} (map #(if (str/starts-with? (name %) "vals-") :shape/opaque %)) ls)]))
                               boundary)
               :feeders (into {} (for [[id fs] direct]
                                   [id (into [] (comp (mapcat #(expand % #{id} 0)) (distinct)) fs)]))}))
          (recur m'))))))

(defn propagate
  "Grow `:sources` to a fixpoint over the call graph, carrying labels. See [[propagate*]], of which this returns
  the `:tainted` half."
  [opts]
  (:tainted (propagate* opts)))

(defn propagate*
  "Grow `:sources` to a fixpoint over the call graph, carrying labels.

  Two rules, applied until nothing changes:

    a binding initialized from a tainted value is tainted
    a parameter that receives a tainted argument is tainted

  Taint is a set of labels naming the boundary a value crossed -- `:request`, `:app-db`, `:warehouse` -- and a
  value that received two sources carries both. `:sources` is `{id #{label}}`; a bare set of ids is read as
  `:request`. `:origins` lists the calls to origin functions -- a Toucan select, a driver describe, an HTTP fetch --
  as regions with a `:label`; a binding initialized from one, or a parameter receiving one, is tainted with it.
  The result is `{id #{label}}`.

  A third rule carries taint *out* of a function: what a function returns is what its tail forms *generate* --
  an origin call there, a call to another function that generates, a local bound from either -- and a binding
  initialized from a call to it, `(let [card (things.db/card id)] ...)`, carries that too. This is how a row
  read in a `db.clj` helper reaches the endpoint that called the helper. What arrives through a parameter is
  deliberately not passed back out; see `generative` below.

  Driven by a work-list: each round looks only at the inits and call arguments whose region shares a row with a
  usage of an id whose labels grew in the *previous* round, or with a call to a function whose return labels
  grew. Rescanning everything every round cost 24 rounds x 500k region checks -- twelve million -- for a result
  that only ever changes near the new usages.

  `:resolve` optionally maps a call's `{:filename :row :col}` to the fully qualified symbol it refers to; without
  it a call is assumed to name a function in its own namespace, which is enough for same-file flows.

  Returns `{:tainted {id #{label}} :return-sites [{:filename :row :col :labels}]}` -- the second being every
  call site whose callee returns tainted data, so a sink can see `(sink (:name (fetch id)))` with no binding in
  between."
  [{:keys [tables locals local-usages sources resolve origins extra-sanitized]}]
  (let [sources        (if (map? sources) sources (into {} (map (fn [id] [id #{:request}])) sources))
        local-idx      (index-by-row locals)
        usage-idx      (index-by-row local-usages)
        ;; the bindings handed to an authorization check are checked: a source of the `:checked` labels, kept
        ;; apart from the rest because only these -- and not a check label that arrived forward from some other
        ;; caller -- may flow backward to a caller's argument
        check-sources  (reduce (fn [acc {:keys [region label]}]
                                 (reduce (fn [acc {:keys [id row col]}]
                                           (if (within? region row col) (update acc id (fnil conj #{}) label) acc))
                                         acc
                                         (in-rows usage-idx region)))
                               {}
                               (mapcat :checks (vals tables)))
        sources        (merge-with into sources check-sources)
        ;; every record gets an integer identity: the work-list holds and hashes those, not 510k maps
        number         (fn [recs] (vec (map-indexed (fn [i r] (assoc r :i i)) recs)))
        all-inits      (number (mapcat :inits (vals tables)))
        all-calls      (number (mapcat :calls (vals tables)))
        all-tails      (number (mapcat :tails (vals tables)))
        all-tail-terms (mapcat :tail-terms (vals tables))
        ;; every region a key term names -- a literal's value, a symbol, a call, a form not understood --
        ;; analyzed once like a tail is, so evaluating a term is lookups
        leaf-recs      (number (for [r (into #{} (concat (mapcat #(term-regions (:term %)) all-tail-terms)
                                                         (mapcat #(term-regions (:kterm %)) all-inits)))]
                                 {:region r}))
        origin-idx     (origin-idx origins)
        ;; sanitizing calls by (file, row), so a usage inside one is skipped when its enclosing region is judged
        sanitized-idx  (reduce (fn [acc {:keys [filename row end-row] :as r}]
                                 (reduce #(update-in %1 [filename %2] (fnil conj []) r)
                                         acc
                                         (range row (inc (or end-row row)))))
                               {}
                               (concat (mapcat :sanitized (vals tables)) extra-sanitized))
        all-params     (mapcat :params (vals tables))
        ;; a methodical `:after` method's last parameter holds what the primary returned: no argument reaches it
        holders        (filter :holds-return? all-params)
        fed-params     (remove :holds-return? all-params)
        params-by-key  (group-by (juxt :fn :index) fed-params)
        params-by-fn   (group-by :fn all-params)
        rest-by-fn     (into {} (for [[f ps] (group-by :fn fed-params)
                                      :let [r (filter :rest? ps)]
                                      :when (seq r)]
                                  [f r]))
        slots-for      (fn [fq index]
                         (let [ps (get params-by-fn fq)
                               ;; `->>` threads into the last position, whose number depends on the callee
                               index (if (= :last index)
                                       (when (seq ps) (apply max (map :index ps)))
                                       index)]
                           (when index
                             (concat (get params-by-key [fq index])
                                     ;; a rest parameter collects every argument from its own position onward
                                     (filter #(<= (:index %) index) (get rest-by-fn fq))))))
        ns-of          (into {} (for [[f t] tables] [f (:ns t)]))
        resolve-call   (fn [{:keys [head pos]}]
                         (or (get resolve pos)
                             (when-not (qualified-symbol? head)
                               (when-let [nsym (get ns-of (:filename pos))]
                                 (symbol (str nsym) (str head))))
                             head))
        ;; every resolved call site by callee, for the return rule; resolved once
        all-sites      (for [t (vals tables), {:keys [pos] :as site} (:call-sites t)]
                         (assoc pos :fq (resolve-call site)))
        sites-by-fq    (group-by :fq all-sites)
        sites-idx      (index-by-row all-sites)
        sanitized?     (fn [filename row col]
                         (boolean (some #(within? % row col) (get-in sanitized-idx [filename row]))))
        ;; What a region holds that never changes: the usage ids inside it, the callees called inside it and the
        ;; origin labels inside it, each outside any sanitizing call. Computed once per record, so the work-list
        ;; is lookups on these rather than scans of the region's rows every round. Returns `{:static [{:ids
        ;; :fqs :olabels} ...]}` aligned with `recs`, with `:by-usage {id #{i}}` and `:by-fq {fq #{i}}` inverted.
        analyze-recs   (fn [recs]
                         (let [inside  (fn [region] (fn [{:keys [row col]}]
                                                      (and (within? region row col)
                                                           (not (sanitized? (:filename region) row col)))))
                               static  (mapv (fn [{:keys [region]}]
                                               {:ids     (into [] (comp (filter (inside region)) (map :id))
                                                               (in-rows usage-idx region))
                                                :fqs     (into [] (comp (filter (inside region)) (map :fq))
                                                               (in-rows sites-idx region))
                                                :olabels (into #{} (comp (filter (inside region))
                                                                         (mapcat #(let [l (:label %)] (if (sequential? l) l [l]))))
                                                               (in-rows origin-idx region))})
                                             recs)
                               invert  (fn [k]
                                         (persistent!
                                          (reduce (fn [acc [i st]]
                                                    (reduce (fn [acc x] (assoc! acc x (conj (get acc x #{}) i))) acc (get st k)))
                                                  (transient {})
                                                  (map-indexed vector static))))]
                           {:static static :by-usage (invert :ids) :by-fq (invert :fqs)}))
        inits*         (analyze-recs all-inits)
        calls*         (analyze-recs all-calls)
        tails*         (analyze-recs all-tails)
        leaves*        (analyze-recs leaf-recs)
        leaf-static    (into {} (map-indexed (fn [i {:keys [region]}] [region ((:static leaves*) i)]) leaf-recs))
        touched        (fn [m ks] (into #{} (mapcat #(get m %)) ks))
        ;; the bindings an init record binds, and the callee parameters a call record feeds -- each resolved once
        bind-ids       (mapv (fn [{:keys [bind]}] (vec (binding-ids-in-region local-idx bind))) all-inits)
        slot-cache     (atom {})
        slot-ids       (fn [i]
                         (or (get @slot-cache i)
                             (let [{:keys [index] :as call} (all-calls i)
                                   ids (into [] (mapcat #(slot-binding-ids local-idx % call))
                                             (slots-for (resolve-call call) index))]
                               (swap! slot-cache assoc i ids)
                               ids)))
        ;; Taint moves as deltas. A round is handed what grew last round -- `fresh {id #{label}}` for bindings,
        ;; `fresh-fns {fq #{label}}` for returns -- and hands each new label to the records that contain the
        ;; usage or the call, and on to what those bind or feed. The union is the same as recomputing every
        ;; label carried into each touched record, at the cost of the new labels alone: recomputing was the
        ;; bulk of the run, most of it re-deriving what a busy binding already carried.
        from-inits     (fn [fresh fresh-fns]
                         (for [[m by] [[fresh (:by-usage inits*)] [fresh-fns (:by-fq inits*)]]
                               [k delta] m
                               i (get by k)
                               id (bind-ids i)]
                           [id delta]))
        from-calls     (fn [fresh fresh-fns]
                         (for [[m by] [[fresh (:by-usage calls*)] [fresh-fns (:by-fq calls*)]]
                               [k delta] m
                               i (get by k)
                               id (slot-ids i)]
                           [id delta]))
        ;; What a function *generates*: the labels born inside it -- origin calls and return-tainted calls in
        ;; its tail, and locals bound from those -- never a label that arrived through a parameter. A return
        ;; summary that included parameters would be the union over every caller, and one generic pass-through
        ;; helper (`(defn touch [obj] ... obj)`) then hands every caller every label in the codebase: measured,
        ;; 656 findings each carrying all 110 models. Passing an argument's taint back out is not modelled;
        ;; the caller still holds the argument.
        ;;
        ;; A local is followed to its init through the binding form that holds it, so a destructured
        ;; `[{:keys [name]} (t2/select-one ...)]` is born from the read as much as a plain `[card ...]` is.
        init-i-of-id   (into {} (for [{:keys [bind i]} all-inits, id (binding-ids-in-region local-idx bind)]
                                  [id i]))
        ;; `static` describes one record: a tail, or an init reached through a local the tail names
        generative     (fn generative [returns {:keys [ids fqs olabels]} seen]
                         (as-> olabels labels
                           (into labels (mapcat #(get returns %)) fqs)
                           ;; a tail that names a local bound in this function: what that binding was born from
                           (into labels (comp (keep init-i-of-id)
                                              (remove seen)
                                              (mapcat #(generative returns ((:static inits*) %) (conj seen %))))
                                 ids)))
        from-tails     (fn [returns tails]
                         ;; nothing generates until an origin call or a returning function exists
                         (when (or (seq origin-idx) (seq returns))
                           (for [i     tails
                                 :let  [ls (generative returns ((:static tails*) i) #{})]
                                 :when (seq ls)]
                             [(:fn (all-tails i)) ls])))
        ;; ---- what a function returns under each key: the key terms of its tails, evaluated ----
        usage-at       (into {} (for [{:keys [id filename row col]} local-usages] [[filename row col] id]))
        ;; a function's tails by how a reader reaches them: `:outer` is what a call to it returns -- its
        ;; `:around` methods' tails when it has any, else every method's -- and `:inner` what the chain under an
        ;; `:around` returns: primaries and `:after`s. A `:before` returns nothing anyone sees.
        terms-by-fn    (let [by-fn (group-by :fn (remove #(= :before (:qualifier %)) all-tail-terms))]
                         (into {} (for [[fq ts] by-fn
                                        :let [around (filter #(= :around (:qualifier %)) ts)
                                              inner  (remove #(= :around (:qualifier %)) ts)]]
                                    [fq {:outer (if (seq around) around inner) :inner inner}])))
        ;; an `:after` method's last parameter: the multimethod's return, by the ids each key lands in
        holder-ids     (fn [{:keys [region keys]}]
                         (if keys
                           {:all (some->> (get keys :as) (binding-ids-in-region local-idx))
                            :by-key (into {} (for [[k r] keys :when (not= k :as)]
                                               [k (binding-ids-in-region local-idx r)]))}
                           {:all (binding-ids-in-region local-idx region)}))
        holder-slots   (for [h holders] (assoc (holder-ids h) :fn (:fn h)))
        ;; a holder's id named in a term is the return itself: `result` in `(assoc result :x 1)`, or one key
        ;; of it: `auth-identity` in `(f auth-identity)` when destructured as `{:keys [auth-identity]}`
        holder-of-id   (into {} (concat (for [{:keys [fn all]} holder-slots, id all] [id [fn :all]])
                                        (for [{:keys [fn by-key]} holder-slots, [k ids] by-key, id ids] [id [fn k]])))
        ;; the key a destructured local was taken from its init under: `a` in `[{:keys [a]} (f)]`
        key-of-id      (into {} (for [{:keys [keys]} all-inits, [k r] keys, :when (not= k :as)
                                      id (binding-ids-in-region local-idx r)]
                                  [id k]))
        ;; which parameter of which function a local id is, for what a function passes through
        param-of-id    (into {} (for [{:keys [fn index region keys]} all-params
                                      id (if keys
                                           (some->> (get keys :as) (binding-ids-in-region local-idx))
                                           (binding-ids-in-region local-idx region))]
                                  [id [fn index]]))
        ;; `{fq #{i}}`: the argument positions a function's return may be, or contain, as they were: `(defn
        ;; gate [_ result] result)` passes its second; a call to it passes on what its second argument was.
        ;; A fixpoint over every function, so a helper that hands to a helper is followed.
        passes         (let [struct (fn struct [passes fq term seen]
                                      (cond
                                        (nil? term) #{}
                                        (:local term) (let [id (get usage-at ((juxt :filename :row :col) (:local term)))
                                                            [f i] (get param-of-id id)]
                                                        (if (= f fq) #{i} #{}))
                                        (:merge term) (into #{} (mapcat #(struct passes fq % seen)) (:merge term))
                                        (:over term) (struct passes fq (:over term) seen)
                                        (:add term) (struct passes fq (:add term) seen)
                                        (:without term) (struct passes fq (:without term) seen)
                                        (:only term) (struct passes fq (:only term) seen)
                                        (:call term) (let [self?  (:self (:call term))
                                                           callee (if self? fq (resolve-call (:call term)))
                                                           mk     [callee (if self? :inner :outer)]]
                                                       (if (contains? seen mk)
                                                         #{}
                                                         (into #{} (for [i (get passes mk #{})
                                                                         :let [a (nth (:args term) i nil)]
                                                                         :when a
                                                                         j (struct passes fq a (conj seen mk))]
                                                                     j))))
                                        :else #{}))]
                         ;; `{[fq mode] #{i}}`
                         (loop [passes {} n 0]
                           (let [passes' (into {} (for [[fq modes] terms-by-fn
                                                        [mode ts] modes
                                                        :let [ps (into #{} (mapcat #(struct passes fq (:term %) #{[fq mode]})) ts)]
                                                        :when (seq ps)]
                                                    [[fq mode] ps]))]
                             (if (or (= passes passes') (>= n 8)) passes' (recur passes' (inc n))))))
        gen-leaf       (fn [returns region] (generative returns (get leaf-static region) #{}))
        ;; `(kr fq k)`: what `fq` returns under key `k` -- `:all` for the whole -- from the terms of its tails
        ;; (every implementation's, for a multimethod). Memoized for a round; a cycle contributes nothing.
        kr-memo        (atom {})
        ev-memo        (atom {})
        eval-key       (fn eval-key [returns fq term k seen]
                         (letfn [(memo [mk f]
                                   (cond
                                     (contains? seen mk)     #{}
                                     (contains? @kr-memo mk) (get @kr-memo mk)
                                     :else
                                     (let [ls (f (conj seen mk))]
                                       (swap! kr-memo assoc mk ls)
                                       ls)))
                                 (kr [callee k mode]
                                   (memo [callee k mode]
                                         (fn [seen]
                                           (into #{} (mapcat #(eval-key returns callee (:term %) k seen))
                                                 (get-in terms-by-fn [callee mode])))))
                                 ;; what an `:after` method's parameter holds under `k`: the chain under the
                                 ;; `:around`s, as each `next-method` call in them invokes it -- with what that
                                 ;; call hands in -- or, with no `:around`, the chain called bare
                                 (held [hfn k]
                                   (memo [hfn k :held]
                                         (fn [seen]
                                           (let [around (filter #(= :around (:qualifier %)) (get-in terms-by-fn [hfn :outer]))
                                                 calls  (mapcat #(self-calls-in (:term %)) around)]
                                             (if (seq calls)
                                               (into #{} (mapcat #(eval-key returns hfn % k seen)) calls)
                                               (eval-key returns hfn {:call {:self true} :args []} k seen))))))
                                 (leaf [region]
                                   (let [ls (gen-leaf returns region)]
                                     (when *trace-keys*
                                       (*trace-keys* {:fn fq :key k :region region :labels ls}))
                                     ls))
                                 ;; a subterm shared by several branches of a threading form is evaluated once
                                 (ev [term k]
                                   (if (or (:local term) (:any term) (nil? term))
                                     (eval-key returns fq term k seen)
                                     (let [mk [fq term k]]
                                       (if (contains? @ev-memo mk)
                                         (get @ev-memo mk)
                                         (let [ls (eval-key returns fq term k seen)]
                                           (swap! ev-memo assoc mk ls)
                                           ls)))))]
                           (cond
                             (nil? term) #{}
                             (:lit term) (let [m (:lit term)]
                                           (if (= k :all)
                                             (into #{} (mapcat #(ev % :all)) (vals m))
                                             (some-> (get m k) (ev :all))))
                             (:any term) (leaf (:any term))
                             (:local term) (let [id (get usage-at ((juxt :filename :row :col) (:local term)))]
                                             (cond
                                               ;; the return of the chain under the `:around`s (or one key of it),
                                               ;; whatever key is asked
                                               (contains? holder-of-id id)
                                               (let [[hfn hk] (get holder-of-id id)] (held hfn (if (= hk :all) k hk)))

                                               ;; a local bound in this function: its init's term, under the key it
                                               ;; was destructured from when it was
                                               (contains? init-i-of-id id)
                                               (let [i     (get init-i-of-id id)
                                                     kterm (:kterm (all-inits i))
                                                     k'    (get key-of-id id k)]
                                                 (if kterm
                                                   (memo [:init i k'] (fn [seen] (eval-key returns fq kterm k' seen)))
                                                   (leaf (:local term))))

                                               :else
                                               (leaf (:local term))))
                             (:key-of term) (ev (:key-of term) (:key term))
                             (:over term) (let [{:keys [over keys]} term]
                                            (cond (= k :all)          (into (ev over :all) (mapcat #(ev % :all)) (vals keys))
                                                  (contains? keys k)  (ev (get keys k) :all)
                                                  :else               (ev over k)))
                             (:add term) (let [{:keys [add keys]} term]
                                           (cond (= k :all)          (into (ev add :all) (mapcat #(ev % :all)) (vals keys))
                                                 (contains? keys k)  (into (ev (get keys k) :all) (ev add k))
                                                 :else               (ev add k)))
                             (:without term) (let [{:keys [without keys]} term]
                                               (if (contains? keys k) #{} (ev without k)))
                             (:only term) (let [{:keys [only keys]} term]
                                            (cond (= k :all)         (into #{} (mapcat #(ev only %)) keys)
                                                  (contains? keys k) (ev only k)
                                                  :else              #{}))
                             (:merge term) (into #{} (mapcat #(ev % k)) (:merge term))
                             (:held term) (held fq (:held term))
                             (:call term) (let [self?  (:self (:call term))
                                                callee (if self? fq (resolve-call (:call term)))
                                                mode   (if self? :inner :outer)]
                                            (if (or (contains? terms-by-fn callee) (contains? params-by-fn callee))
                                              (into (kr callee k mode)
                                                    (mapcat (fn [i] (some-> (nth (:args term) i nil) (ev k))))
                                                    (get passes [callee mode]))
                                              ;; a callee the graph does not hold: what the call generates
                                              (leaf (:region term))))
                             :else #{})))
        ;; What an `:after` method's parameter holds under `k`: the chain under the `:around`s, as each
        ;; `next-method` call in them invokes it -- with what that call hands in -- or, with no `:around`, the
        ;; chain called bare.
        held           (fn [returns fq k] (eval-key returns fq {:held k} :all #{}))
        from-holders   (fn [returns]
                         (reset! kr-memo {})
                         (reset! ev-memo {})
                         (concat
                          (for [{:keys [fn all]} holder-slots
                                id all
                                :let [ls (held returns fn :all)]
                                :when (seq ls)]
                            [id ls])
                          (for [{:keys [fn by-key]} holder-slots
                                [k ids] by-key
                                :let [ls (held returns fn k)]
                                :when (seq ls)
                                id ids]
                            [id ls])))
        ;; `pairs` are `[k #{label}]`; returns the grown map and what grew, `{k #{new label}}`
        grow           (fn [m pairs]
                         (reduce (fn [[m fresh :as acc] [k ls]]
                                   (let [old (get m k #{}), new (into old ls)]
                                     (if (= old new)
                                       acc
                                       [(assoc m k new)
                                        (update fresh k (fnil into #{}) (remove old ls))])))
                                 [m {}]
                                 pairs))
        ;; stored taint enters wherever an origin call sits, before any usage exists to drive the work-list
        with-origins   (fn [{:keys [static]}] (keep-indexed (fn [i {:keys [olabels]}] (when (seq olabels) i)) static))
        [seeded fresh0]   (grow sources (concat (for [i (with-origins inits*), id (bind-ids i)] [id (:olabels ((:static inits*) i))])
                                                (for [i (with-origins calls*), id (slot-ids i)] [id (:olabels ((:static calls*) i))])))
        ;; every source binding is fresh with all it carries
        fresh0            (into {} (for [id (into (set (keys sources)) (keys fresh0))] [id (get seeded id)]))
        [returns0 fresh-fns0] (grow {} (from-tails {} (into (set (with-origins tails*)) (touched (:by-usage tails*) (keys fresh0)))))
        ;; the returns known before the loop reach their holders before it
        [seeded fresh-held] (grow seeded (from-holders returns0))
        fresh0            (merge-with into fresh0 fresh-held)]
    (loop [tainted seeded, returns returns0, fresh fresh0, fresh-fns fresh-fns0]
      (if (and (empty? fresh) (empty? fresh-fns))
        ;; `(api/write-check card)` names no model, so its mark is a bare `:checked`; but `card` was read from the
        ;; application database as a Card, and that is what the check was about. Once the origins are known the
        ;; mark is joined by one per model the value was read as -- a parameter may hold rows of several -- and
        ;; before the marks flow backward, so the id that fetched the row is checked as that model too. The bare
        ;; mark stays: the same parameter may also hold a value read from no model, and its check is not less.
        (let [refine        (fn [ls]
                              (if (contains? ls :checked)
                                (into ls (for [l ls
                                               :when (and (= :app-db (taint/label-kind l)) (namespace l)
                                                          (not= "setting" (name l)))]
                                           (keyword "checked" (name l))))
                                ls))
              tainted       (into {} (for [[id ls] tainted] [id (refine ls)]))
              check-sources (into {} (for [[id ls] check-sources]
                                       [id (if (contains? ls :checked)
                                             (into ls (filter #(= :checked (taint/label-kind %))) (get tainted id))
                                             ls)]))
              shapes*       (param-shapes {:calls all-calls :slot-ids slot-ids :local-idx local-idx
                                           :inits all-inits :bind-ids bind-ids :tails all-tails
                                           :keyed-ids (into #{} (mapcat #(binding-ids-in-region local-idx %))
                                                            (mapcat :keyed-regions (vals tables)))
                                           :usage-at (into {} (for [{:keys [id filename row col]} local-usages]
                                                                [[filename row col] id]))
                                           :resolve resolve :ns-of ns-of
                                           :resolve-call resolve-call :params-by-fn params-by-fn
                                           :param-ids (into #{} (mapcat #(binding-ids-in-region local-idx (:region %)))
                                                            all-params)})]
          {:shape-feeders (:feeders shapes*)
           :tainted      (merge-with into tainted
                                     (:shapes shapes*)
                                     (checks-backward check-sources
                                                      {:local-idx local-idx :usage-idx usage-idx :calls all-calls
                                                       :slots-for slots-for :resolve-call resolve-call :locals locals
                                                       :inits all-inits :params all-params}))
           :return-sites (vec (for [[fq ls] returns, site (get sites-by-fq fq)]
                                (assoc (dissoc site :fq) :labels ls)))})
        (let [[tainted' fresh'] (grow tainted (concat (from-inits fresh fresh-fns)
                                                      (from-calls fresh fresh-fns)
                                                      ;; holders re-evaluated each round: few, and what they
                                                      ;; hold depends on returns that grow anywhere
                                                      (from-holders returns)))
              tails   (into (touched (:by-usage tails*) (keys fresh')) (touched (:by-fq tails*) (keys fresh-fns)))
              [returns' fresh-fns'] (grow returns (from-tails returns tails))]
          (recur tainted' returns' fresh' fresh-fns'))))))
