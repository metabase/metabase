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
  "Whether [row col] falls inside `region`."
  [{:keys [row col end-row end-col]} r c]
  (and row
       (or (> r row) (and (= r row) (>= c col)))
       (or (< r end-row) (and (= r end-row) (<= c end-col)))))

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

(def ^:private threading-heads vocab/threading-slots)

(declare binding-ids-in-region)

(defn- arg-records
  "The `:calls` records for one argument: the argument itself, and for a map literal one more per keyword entry,
  keyed, so `(f {:table-id id :file file})` hands `id` to the `table-id` of a callee that destructures the map and
  `file` to its `file`, rather than both to both. See `slot-binding-ids`."
  [filename head index pos a]
  (let [a (ast/unmeta a)]
    (cons {:head head :index index :pos pos :region (assoc (meta a) :filename filename) :map? (ast/map-node? a)}
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
     if if-not cond case try prog1})

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
          "cond"          (mapcat tail-forms (take-nth 2 (rest args)))
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
        fns (volatile! []) entries (volatile! []) guards (volatile! []) sites (volatile! [])
        ns-middleware (volatile! #{}) wraps (volatile! []) handler-defs (volatile! [])
        numeric (volatile! []) strings (volatile! []) registry (volatile! []) sanitized (volatile! [])
        origin-fns (volatile! []) model-args (volatile! {}) tails (volatile! []) checks (volatile! [])
        thread-tails (volatile! [])
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
        (let [cs (vec (ast/children node))]
          (doseq [[i c] (map-indexed vector cs)
                  :let  [c (ast/unmeta c)]
                  :when (and (pos? i) (ast/call? c) (vocab/assertion-validator? (ast/head-sym c))
                             (< (inc i) (count cs)))
                  :let  [b0 (meta (nth cs (inc i)))
                         bn (meta (peek cs))]]
            (vswap! guards conj {:checks [(assoc (meta c) :filename filename)]
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
              (doseq [body (bodies args), t (some-> (last body) tail-forms)]
                (vswap! tails conj (cond-> {:fn fq :region (assoc (meta t) :filename filename)}
                                     ;; the call the value comes from, for [[sanitizing-fns]]
                                     (tail-head t) (assoc :head (tail-head t)))))
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
                        (vswap! params conj (cond-> {:fn fq :index i :region region}
                                              rest?    (assoc :rest? true)
                                              keys     (assoc :keys keys)
                                              name-pos (assoc :name-pos name-pos)))
                        (when (or (contains? request-param-names (ast/->str slot))
                                  (request-destructuring? slot))
                          (vswap! sources conj region))
                        (recur (inc i) (next slots) false))))))))

          ;; An anonymous fn contributes no parameter *slots* -- nothing can call it by name -- but its
          ;; parameters can still be a trust boundary.
          (contains? fn-heads head)
          (when-let [al (arglist args)]
            (doseq [slot (ast/children al)]
              (when (or (contains? request-param-names (ast/->str slot))
                        (request-destructuring? slot))
                (vswap! sources conj (assoc (meta slot) :filename filename)))))

          ;; A conditional guarded by a validating test protects the forms under it. Recording that is what lets a
          ;; correctly defended site stop being reported forever, rather than being re-triaged every run.
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
              (doseq [[b init] (partition 2 (ast/children bv))]
                (vswap! inits conj {:bind   (assoc (meta b) :filename filename)
                                    ;; `[cid (:card_id body)]`: a check on `cid` later vouches for `body`'s
                                    ;; `:card_id`, not for `body`
                                    :key    (second (ast/accessor (ast/unmeta init)))
                                    :region (assoc (meta init) :filename filename)}))))

          :else nil)
        ;; a defendpoint parameter vector is the other trust boundary
        (when-let [dp (taint/defendpoint-params node)]
          (vswap! sources conj (assoc (meta dp) :filename filename))
          ;; the bindings a request schema pins to a number or a string, so a rule about a value's shape can
          ;; leave the ones that cannot have that shape out
          (let [typed (taint/typed-param-regions dp filename)]
            (vswap! numeric into (:numeric typed))
            (vswap! strings into (:string typed))
            (vswap! registry into (:registry typed)))
          (vswap! entries conj (assoc (meta node) :filename filename :kind :http :name (entry-name node))))
        ;; A threading macro passes its seed into each step, which the plain call extraction below cannot see:
        ;; `(-> request :url h)` looks like a three-argument call to `->`. Record a synthetic call per step so the
        ;; seed's taint reaches the function each step names.
        (when-let [slot (get threading-heads head)]
          (when-let [seed (first args)]
            (let [seed-region (assoc (meta seed) :filename filename)]
              (doseq [step (rest args)
                      :let [target (thread-target step)
                            spos   (assoc (select-keys (meta step) [:row :col]) :filename filename)]
                      :when target]
                ;; `(-> x helper)` names helper without a call node of its own
                (when (ast/symbol-node? (ast/unmeta step))
                  (vswap! sites conj {:head target :pos spos}))
                (vswap! calls conj {:head   target
                                    :index  slot
                                    :pos    spos
                                    :region seed-region})))))
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
        (when (and head (not (defn-head? head)))
          (vswap! sites conj {:head   head
                              :pos    (assoc (select-keys (meta node) [:row :col]) :filename filename)
                              ;; the whole call, so a site resolved to a sanitizer can become a sanitized region
                              :region (assoc (meta node) :filename filename)}))
        ;; every call, including the binding forms above, contributes argument regions
        (when head
          (let [pos (assoc (select-keys (meta node) [:row :col]) :filename filename)]
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
       :fns @fns :entries @entries :guards @guards :call-sites @sites :ns-middleware @ns-middleware
       :wraps @wraps :handler-defs @handler-defs
       :numeric-regions @numeric :string-regions @strings :registry-regions @registry :sanitized @sanitized
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
                   :let [t (-> t (update :fns #(mapv fix %)) (update :params #(mapv fix %)))]]
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
        closure    (fn [seeds]
                     (loop [seen (set seeds), frontier (set seeds)]
                       (if (empty? frontier)
                         seen
                         (let [next (into #{} (comp (mapcat #(get edges %)) (remove seen)) frontier)]
                           (recur (into seen next) next)))))
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
        kinds      (into #{:http} (map :kind) entries)
        refs-in    (fn [e] (into #{} (comp (filter #(and (:value? %)
                                                         (within? e (:row (:pos %)) (:col (:pos %)))))
                                           (map resolve-to))
                                 (get calls-by-file (:filename e))))
        seeds-for  (fn [kind]
                     (into (if (= :http kind) handler-fns #{})
                           (comp (filter #(= kind (:kind %))) (mapcat #(into (:seeds %) (refs-in %))))
                           entry-recs))
        reached    (into {} (for [k kinds] [k (closure (seeds-for k))]))
        kinds-of   (reduce (fn [acc [k fqs]] (reduce #(update %1 %2 (fnil conj #{}) k) acc fqs)) {} reached)
        regions    (concat (for [e entries] (assoc e :kinds #{(:kind e)}))
                           (for [[fq ks] kinds-of, r (get regions-of fq)] (assoc r :kinds ks)))
        ;; for [[flows-to]]: every entry that can start a path, with everything it seeds, plus the request-taking
        ;; functions that start an http path without being an entry form; `:i` is the index into the vector
        flow-entries (into [] (map-indexed (fn [i e] (assoc e :i i)))
                           (concat (for [e entry-recs] (assoc e :flow-seeds (into (:seeds e) (refs-in e))))
                                   (for [fq handler-fns :let [r (first (get regions-of fq))] :when r]
                                     (assoc r :kind :http :name (str fq) :flow-seeds #{fq}))))]
    {;; grouped by file so a lookup does not scan every reachable region in the codebase
     :by-file (group-by :filename regions)
     :edges      edges
     :call-edges call-edges
     :entries    (vec entry-recs)
     :ns-middleware-by-file (into {} (for [[f t] tables] [f (:ns-middleware t)]))
     :wrappers-by-ns (handler-wrappers tables)
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
  "The kinds of entry point from which execution can reach `pos`: a subset of #{:http :job :mq :cli :event
  :startup}. Empty means nothing modelled reaches it."
  [{:keys [by-file]} {:keys [filename row col]}]
  (into #{} (mapcat :kinds) (filter #(within? % row col) (get by-file filename))))

(defn reachable?
  "Whether anything modelled reaches `pos`."
  [reach pos]
  (boolean (seq (reachable-from reach pos))))

(defn flows-to
  "How execution gets to `pos`, per entry kind:

      {:http {:count 3                      ; entries of this kind that reach it
              :entries [\"GET /a\" ...]      ; the first few, shortest path first
              :path [step ...]}}            ; one shortest path: the entry, then each function, ending at the
                                            ; function holding `pos`. Each step has :name :filename :row :col.

  A breadth-first walk backwards from the function holding `pos` over every reference, recording for each
  function the next hop towards `pos`; an entry reaches `pos` when one of its seeds was visited, and the path
  follows the hops from that seed. A position directly inside an entry form has a one-step path. Empty when
  nothing modelled reaches `pos`.

  The walk is cached per holding function, and the entries are found from the visited functions rather than
  by testing every entry: a thousand findings in a few hundred functions cost a few hundred walks."
  [{:keys [reverse-edges fns-by-file regions-of flow-entries entries-by-seed flow-entries-by-file hops-cache]}
   {:keys [filename row col]}]
  (let [holder  (some (fn [{:keys [fn region]}] (when (within? region row col) {:fn fn :region region}))
                      (get fns-by-file filename))
        target  (:fn holder)
        ;; function -> the function it was reached from, one hop closer to the target, and its distance
        walk    (fn [target]
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
        step    (fn [fq] (let [r (if (= fq target) (:region holder) (first (get regions-of fq)))]
                           {:name (str fq) :filename (:filename r) :row (:row r) :col (:col r)}))
        from    (fn [seed] (->> (iterate hops seed) (take-while some?) (mapv step)))
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

(defn sanitized-positions
  "Usage positions that a validating guard has already vouched for.

  If a conditional tests a tainted value with an allow-list check, uses of that value inside the conditional are
  not worth reporting. `metabase.ai-tracing.api/trace-file` is the case that motivated this: it matches the id
  against an anchored regex and checks the resolved path's parent before opening anything, and was reported
  anyway."
  [{:keys [tables local-usages tainted]}]
  (let [usage-idx (index-by-row local-usages)]
    (reduce
     (fn [acc {:keys [checks body]}]
       ;; ids a validator was actually applied to -- inside the validator call, not merely somewhere in the test
       (let [checked (into #{} (for [check checks
                                     {:keys [id row col]} (in-rows usage-idx check)
                                     :when (and (contains? tainted id) (within? check row col))]
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
        origin-idx     (origin-idx origins)
        ;; sanitizing calls by (file, row), so a usage inside one is skipped when its enclosing region is judged
        sanitized-idx  (reduce (fn [acc {:keys [filename row end-row] :as r}]
                                 (reduce #(update-in %1 [filename %2] (fnil conj []) r)
                                         acc
                                         (range row (inc (or end-row row)))))
                               {}
                               (concat (mapcat :sanitized (vals tables)) extra-sanitized))
        all-params     (mapcat :params (vals tables))
        params-by-key  (group-by (juxt :fn :index) all-params)
        params-by-fn   (group-by :fn all-params)
        rest-by-fn     (into {} (for [[f ps] params-by-fn
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
        [returns0 fresh-fns0] (grow {} (from-tails {} (into (set (with-origins tails*)) (touched (:by-usage tails*) (keys fresh0)))))]
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
                                             ls)]))]
          {:tainted      (merge-with into tainted
                                     (checks-backward check-sources
                                                      {:local-idx local-idx :usage-idx usage-idx :calls all-calls
                                                       :slots-for slots-for :resolve-call resolve-call :locals locals
                                                       :inits all-inits :params all-params}))
           :return-sites (vec (for [[fq ls] returns, site (get sites-by-fq fq)]
                                (assoc (dissoc site :fq) :labels ls)))})
        (let [[tainted' fresh'] (grow tainted (concat (from-inits fresh fresh-fns) (from-calls fresh fresh-fns)))
              tails   (into (touched (:by-usage tails*) (keys fresh')) (touched (:by-fq tails*) (keys fresh-fns)))
              [returns' fresh-fns'] (grow returns (from-tails returns tails))]
          (recur tainted' returns' fresh' fresh-fns'))))))
