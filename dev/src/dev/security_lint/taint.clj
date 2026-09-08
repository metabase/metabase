(ns dev.security-lint.taint
  "A cheap approximation of taint tracking.

  There is no dataflow analysis here and there never will be -- clj-kondo doesn't do interprocedural analysis. What
  it does give us is the distinction that matters most in practice: whether a symbol appearing in a dangerous
  position is a *local* (a function parameter or let binding, so plausibly derived from a request) or a *var* (a
  namespace-level definition, so fixed at compile time).

  That one distinction is the difference between flagging `(format \"select * from %s\" user-table)` and flagging
  `(format \"select * from %s\" index-table-name)`. Without it the SQL rule reports every DDL statement in the
  codebase; with it, it reports the ones worth reading."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn sanitizer?
  "True if `sym` names a sanitizing function according to `patterns`.

  A pattern is either a regex matched against the symbol's name, or a symbol compared by name (so an alias like
  `u/quote-ident` matches a `quote-ident` pattern)."
  [sym patterns]
  (boolean
   (when (symbol? sym)
     (let [nm (name sym)]
       (some (fn [p]
               (if (instance? java.util.regex.Pattern p)
                 (re-find p nm)
                 (= nm (name p))))
             patterns)))))

(def ^:private mapping-fns
  "Calls that apply their first argument to every element: `(map h2x/like-substring tokens)` escapes each token."
  '#{map mapv keep mapcat run! pmap})

(defn sanitizing-call?
  "Whether `node` is a call whose value a sanitizer shaped: a call to one, or a mapping of one over a collection
  -- the escaper applied as a value, `(map h2x/like-substring tokens)`, sanitizes what comes out as much as
  `(h2x/like-substring token)` does."
  [node patterns]
  (boolean
   (when (ast/call? node)
     (let [head (ast/head-sym node)]
       (or (sanitizer? head patterns)
           (and head (contains? mapping-fns (symbol (name head)))
                (let [f (some-> (ast/arg node 0) ast/unmeta)]
                  (and f (ast/symbol-node? f) (sanitizer? (n/sexpr f) patterns)))))))))

(defn sanitizing-value?
  "[[sanitizing-call?]], or a thread whose last step is one: `(->> tokens (map h2x/like-substring))`; or an
  `and` whose last form is one, `(and (:include_csv card) (create-temp-file! \"csv\"))`, whose value is that
  form's or nil."
  [node patterns]
  (let [node (some-> node ast/unmeta)]
    (boolean
     (or (sanitizing-call? node patterns)
         (and (ast/call? node) (contains? vocab/value-threads (ast/head-sym node))
              (let [step (some-> (last (ast/args node)) ast/unmeta)]
                (and step
                     (if (ast/symbol-node? step)
                       (sanitizer? (n/sexpr step) patterns)
                       (sanitizing-call? step patterns)))))
         (and (ast/call? node) (= "and" (some-> (ast/head-sym node) name))
              (some-> (last (ast/args node)) (sanitizing-value? patterns)))))))

(def default-sanitizers
  "See [[dev.security-lint.vocabulary/sanitizers]], plus the validating assertions of
  [[dev.security-lint.vocabulary/assertion-validator]], whose value is the value they validated."
  (conj vocab/sanitizers vocab/assertion-validator))

(defn defendpoint-params
  "The parameter vector of a `defendpoint` form, or nil if `node` isn't one.

  Handles the optional `:- Schema` return annotation and the docstring, both of which sit between the route and
  the parameters."
  [node]
  (when (and (ast/call? node)
             (= "defendpoint" (some-> (ast/head-sym node) clojure.core/name)))
    (loop [[a & more] (ast/args node)]
      (cond
        (nil? a)                        nil
        ;; `:-` introduces a return schema; skip the schema along with the marker
        (= ":-" (ast/->str a))          (recur (rest more))
        ;; a route may be a vector -- `["/:id/x" :id #"\\d+"]` -- which starts with the path string; the
        ;; parameter vector never does. Eighteen endpoints use this form, six of them SCIM and one public.
        (and (ast/vector-node? a)
             (some-> (first (ast/children a)) ast/literal-string?))
        (recur more)
        (ast/vector-node? a)            a
        :else                           (recur more)))))

(defn- schema-kind
  "What a schema node pins a value to: `:numeric` (a number, a boolean, or a collection of those), `:string`,
  `:registry` (a named schema, closed and typed by construction), or nil for anything else -- a map written in
  place, `:any`. See
  [[dev.security-lint.vocabulary/numeric-schema-names]] and [[dev.security-lint.vocabulary/string-schema-names]]."
  [node]
  (let [node (ast/unmeta node)]
    (cond
      (ast/symbol-node? node)
      (let [nm (name (n/sexpr node))]
        (cond (contains? vocab/numeric-schema-names nm) :numeric
              (contains? vocab/string-schema-names nm)  :string))

      ;; `::api-keys.schema/id`, `::lib.schema.id/card`: a registry schema named for an id is one. Read from the
      ;; source text -- an auto-resolved keyword's sexpr is `:??_alias_??/name`, not the keyword written.
      (ast/keyword-node? node)
      (let [k (n/sexpr node)]
        (cond (contains? vocab/numeric-schema-keywords k) :numeric
              (contains? vocab/string-schema-keywords k)  :string
              (and (namespace k) (re-find #"(^|[-./])id$|schema\.id/" (ast/->str node))) :numeric
              ;; any other registry schema: closed and typed by construction (`closed-schemas` checks every one an
              ;; endpoint reaches), so what comes out of it has the shape the registry says, not any shape. The
              ;; lint cannot see which, and treats it as pinned rather than as open.
              (namespace k) :registry))

      (ast/vector-node? node)
      (let [[h & more] (ast/children node)
            kw         (when (ast/keyword-node? h) (n/sexpr h))
            ;; `[:maybe {:doc ...} :int]` -- an options map is not a schema
            more       (remove ast/map-node? more)
            kinds      (map schema-kind more)]
        (case kw
          (:maybe :and)               (some identity kinds)
          ;; a union of pinned schemas is pinned: `[:or ms/PositiveInt [:= :root]]` is a number or one literal,
          ;; and neither is a clause or a query. Numeric only when every branch is; a string branch makes it a
          ;; string, which is still raw SQL in Toucan's pk position.
          :or                         (when (and (seq kinds) (every? some? kinds))
                                        (cond (every? #(= :numeric %) kinds) :numeric
                                              (some #(= :string %) kinds)    :string
                                              :else                          :registry))
          ;; a collection of numbers is not a clause either; a collection of strings is neither
          (:sequential :set :vector)  (when (= :numeric (first kinds)) :numeric)
          ;; a value pinned to a finite set of literals cannot carry a wildcard, a clause or another table's
          ;; name, whatever the literals' type: pinned, like a registry schema
          (:enum :=)                  (when (every? #(ast/literal? %) more) :registry)
          ;; a map written in place whose every entry is pinned is pinned as a whole -- what comes out of it
          ;; has one of the shapes its entries name. One open entry opens the map.
          :map                        (let [entry-kinds (map (fn [e] (schema-kind (last (remove ast/map-node? (rest (ast/children (ast/unmeta e)))))))
                                                             (filter #(ast/vector-node? (ast/unmeta %)) more))]
                                        (when (and (seq entry-kinds) (every? some? entry-kinds)) :registry))
          nil))

      ;; `(ms/QueryVectorOf ms/PositiveInt)`: a query-string vector of whatever its argument pins
      (ast/call? node)
      (let [head (ast/head-sym node)]
        (when (and head (= "QueryVectorOf" (name head)))
          (schema-kind (ast/arg node 0))))

      :else nil)))

(defn- map-schema-entries
  "`{:id <schema> ...}` from a `[:map [:id S] ...]` schema node, looking through `[:maybe ...]`. Empty for any
  other shape."
  [node]
  (let [node (ast/unmeta node)]
    (if-let [[h & more] (when (ast/vector-node? node) (ast/children node))]
      (case (when (ast/keyword-node? h) (n/sexpr h))
        :map   (into {} (for [e     more
                              :let  [e (ast/unmeta e)]
                              :when (ast/vector-node? e)
                              :let  [[k & rest] (ast/children e)
                                     ;; `[:id {:optional true} S]`
                                     s (last (remove ast/map-node? rest))]
                              :when (and (ast/keyword-node? k) s)]
                          [(n/sexpr k) s]))
        :maybe (map-schema-entries (first (remove ast/map-node? more)))
        {})
      ;; `{:keys [a b]} :- ::foo/bar`: every key comes out of the registry schema
      (if (= :registry (schema-kind node))
        ::registry
        {}))))

(defn typed-param-regions
  "Regions of the bindings in a `defendpoint` parameter vector whose schema pins them, by what it pins them to:
  `{:numeric [region ...] :string [region ...] :registry [region ...]}`.

  `[{:keys [id name]} :- [:map [:id ms/PositiveInt] [:name :string]] body :- [:map [:x :any]] n :- pos-int?]`
  yields `id` and `n` under `:numeric` and `name` under `:string`. Everything else in the vector -- a key with an
  open schema, a whole map, a binding with no schema -- appears in neither, and a rule about a value's shape treats
  it as untyped."
  [dp filename]
  (let [slots (vec (ast/children dp))
        pairs (loop [i 0, acc []]
                (if (>= i (count slots))
                  acc
                  (let [slot   (nth slots i)
                        schema (when (and (< (+ i 2) (count slots)) (= ":-" (ast/->str (nth slots (inc i)))))
                                 (nth slots (+ i 2)))]
                    (recur (if schema (+ i 3) (inc i)) (conj acc [slot schema])))))]
    (reduce (fn [acc [node kind]]
              (update acc kind (fnil conj []) (assoc (meta node) :filename filename)))
            {}
            (for [[slot schema] pairs
                  :when schema
                  :let  [slot (ast/unmeta slot)]
                  [node kind] (cond
                                (ast/symbol-node? slot)
                                [[slot (schema-kind schema)]]

                                (ast/map-node? slot)
                                (let [entries (map-schema-entries schema)]
                                  (for [k     (some-> (ast/map-get slot :keys) ast/children)
                                        :let  [k (ast/unmeta k)]
                                        :when (ast/symbol-node? k)]
                                    [k (if (= ::registry entries)
                                         :registry
                                         (schema-kind (get entries (keyword (name (n/sexpr k))))))]))

                                :else nil)
                  :when kind]
              [node kind]))))

(defn numeric-param-regions
  "The `:numeric` regions of [[typed-param-regions]]."
  [dp filename]
  (get (typed-param-regions dp filename) :numeric []))

(defn- within?
  "Whether [row col] falls inside `region`, a node's position metadata."
  [{:keys [row col end-row end-col]} r c]
  (and (or (> r row) (and (= r row) (>= c col)))
       (or (< r end-row) (and (= r end-row) (<= c end-col)))))

(defn request-taint-positions
  "Positions of the local usages that trace back to a request.

  A binding declared inside a `defendpoint` parameter vector is a source; a usage of that binding is tainted. This
  is deliberately narrower than \"every local is a source\" -- an internal helper's parameter is not attacker
  controlled just because it is a parameter, which is what made the injection rules noisy."
  [root-node locals local-usages]
  (let [regions     (->> (ast/find-nodes defendpoint-params root-node)
                         (keep defendpoint-params)
                         (map meta)
                         (filter :row))
        source?     (fn [{:keys [row col]}]
                      (boolean (some #(within? % row col) regions)))
        tainted-ids (into #{} (comp (filter source?) (map :id)) locals)]
    (into #{}
          (comp (filter #(contains? tainted-ids (:id %)))
                (map (juxt :row :col)))
          local-usages)))

(defn all-local-positions
  "Positions of every local usage, but for the locals a name makes numeric (see
  [[dev.security-lint.vocabulary/numeric-local-name]]). The broader, noisier source policy."
  [local-usages]
  (into #{} (comp (remove #(vocab/numeric-local-name? (:name %))) (map (juxt :row :col))) local-usages))

(declare label-kind)

(def ^:private document-labels
  "Labels under which a map is whatever a client or a document made it, so a key of it has no type: an untyped
  request value, a parsed file, an external service's response."
  #{:request/untyped :file :external})

(defn- document?
  "Whether `labels` say the value may be whatever a client or a document made it, see [[document-labels]]."
  [labels]
  (boolean (some (fn [l] (or (contains? document-labels l) (contains? document-labels (label-kind l))))
                 (if (set? labels) labels #{}))))

(defn- client-shaped?
  "Whether `labels` say the value's shape is the client's: a request value no schema pins. (A rule asking about
  clause-shaped values sees only `:request/structured`, which the name convention does override: a `user-id`
  the client sent as a vector is the pk-position rule's finding, not the clause rule's.)"
  [labels]
  (boolean (contains? (if (set? labels) labels #{}) :request/untyped)))

(defn- stored-id-read?
  "Whether `node` reads an id column straight off a row: `(:card_id row)` or `(get row :card_id)` with `row` a
  local carrying none of the [[document-labels]]. Such a value is an integer -- see
  [[dev.security-lint.vocabulary/id-key?]] -- and not a leaf a shape rule should report. A `get-in` is a read
  inside a document, and a key of a request map is the client's -- except the keys the session middleware
  wrote there, [[dev.security-lint.vocabulary/session-keys]]."
  [locals node]
  (boolean
   (when (ast/call? node)
     (let [head (ast/head-sym node)]
       (when-not (and head (= "get-in" (name head)))
         (when-let [[m k] (ast/accessor node)]
           (let [m (ast/unmeta m)]
             (and (= :token (n/tag m))
                  (symbol? (n/sexpr m))
                  (let [labels (get locals ((juxt :row :col) (meta m)))]
                    (and (some? labels)
                         (or (contains? vocab/session-keys k)
                             (and (vocab/id-key? k) (not (document? labels))))))))))))))

(defn- local-usage? [locals node]
  (and (= :token (n/tag node))
       (symbol? (n/sexpr node))
       (let [{:keys [row col]} (meta node)]
         (contains? locals [row col]))))

(def stored-labels
  "The kinds of label for values that crossed a boundary other than the request: read from the application
  database, a warehouse, an external service or a file. Untyped by nature -- nothing pins their shape -- so every
  one of them counts for the rules about shape."
  #{:app-db :warehouse :external :file})

(defn label-kind
  "`:app-db/Card` is the kind `:app-db` refined by the model; a plain label is its own kind."
  [label]
  (keyword (or (namespace label) (name label))))

(defn untyped-label?
  "Whether a label says the value may be a string, a map or a vector."
  [label]
  (or (= :request/untyped label) (contains? stored-labels (label-kind label))))

(defn structured-label?
  "Whether a label says the value may be a HoneySQL clause: a keyword, a map or a vector."
  [label]
  (or (= :request/structured label) (contains? stored-labels (label-kind label))))

(defn check-label?
  "Whether a label records an authorization check rather than a boundary: `:checked/Card`, `:checked`, or the
  key-scoped `:checked.card_id/Card` -- a check on one key of a map, which vouches for that key alone."
  [label]
  (str/starts-with? (name (label-kind label)) "checked"))

(defn key-scoped
  "The check label `l`, scoped to key `k` of a map: `(key-scoped :checked/Card :card_id)` is
  `:checked.card_id/Card`. A key-scoped label already carrying a key is returned as it is."
  [l k]
  (cond
    (str/includes? (name (label-kind l)) ".") l
    (namespace l)                             (keyword (str "checked." (name k)) (name l))
    :else                                     (keyword (str "checked." (name k)))))

(defn check-key
  "The key a check label is scoped to, or nil for a check on the whole value."
  [l]
  (let [kind (name (label-kind l))]
    (when-let [i (str/index-of kind ".")]
      (keyword (subs kind (inc i))))))

(defn boundary-labels
  "`locals` without the check labels, and without the positions that carried nothing else."
  [locals]
  (into {} (keep (fn [[pos ls]]
                   (let [kept (into #{} (remove check-label?) ls)]
                     (when (seq kept) [pos kept]))))
        locals))

(defn select-labels
  "The positions of `locals` (`{pos #{label}}`) carrying a label that satisfies `pred`, with only those labels."
  [locals pred]
  (into {} (keep (fn [[pos ls]]
                   (let [kept (into #{} (filter pred) ls)]
                     (when (seq kept) [pos kept]))))
        locals))

(defn tainted-leaves
  "The local binding usages inside `node` that no sanitizer wraps.

  Descent stops at a sanitizing call, so `(quote-ident user-table)` contributes nothing even though `user-table`
  is a local. A local bound directly to a sanitizer's result is clean when the context carries `:local-inits`
  -- so `(let [w (like-pattern q)] [:like :name w])` is clean at the use of `w` under a rule that names
  `like-pattern`, while `(let [w (str q)] ...)` is not. [[tainted?]] asks whether there are any; a rule that
  names the leaves in its message wants them."
  ([ctx node] (tainted-leaves ctx node nil))
  ([ctx node {:keys [sanitizers]}]
   (let [sanitizers (or sanitizers default-sanitizers)
         locals     (:locals ctx)
         inits      (:local-inits ctx)]
     (letfn [(walk [nd seen]
               (cond
                 (nil? nd)                                    nil
                 (sanitizing-call? nd sanitizers)             nil
                 ;; `honey.sql/format` and the like, told apart from `clojure.core/format` by resolution
                 (and (ast/call? nd) (contains? (:sanitized-calls ctx) ((juxt :row :col) (meta nd))))
                 nil
                 ;; `(-> {...} (sql/format))`: the value is the last step's, so a sanitizer there covers the
                 ;; earlier steps, which are its input
                 (and (ast/call? nd) (contains? vocab/value-threads (ast/head-sym nd))
                      (let [step (some-> (last (ast/args nd)) ast/unmeta)]
                        (and step
                             (or (if (ast/symbol-node? step)
                                   (sanitizer? (n/sexpr step) sanitizers)
                                   (sanitizing-call? step sanitizers))
                                 (contains? (:sanitized-calls ctx) ((juxt :row :col) (meta step)))))))
                 nil

                 ;; a call to an origin function is a leaf of its own: what it returns crossed a boundary
                 (and (ast/call? nd) (get (:origin-calls ctx) ((juxt :row :col) (meta nd))))
                 [nd]

                 ;; `(:card_id row)`: an id column off a row is an integer
                 (stored-id-read? locals nd)
                 nil

                 (local-usage? locals nd)
                 (let [pos  ((juxt :row :col) (meta nd))
                       init (get inits pos)]
                   (cond
                     ;; `card-id` holding a stored value is a foreign key -- an integer -- whatever row it came
                     ;; off, and a `user-id` some caller filled from a document is still one; only the client's
                     ;; `card-id`, sent in whatever shape, is any shape
                     (and (vocab/numeric-local-name? (n/sexpr nd))
                          (not (client-shaped? (get locals pos))))
                     nil
                     (nil? init)          [nd]
                     (contains? seen pos) [nd]
                     ;; bound straight to a sanitizer's result: clean, whatever the rule's sanitizers are
                     (sanitizing-value? init sanitizers) nil
                     ;; bound straight to an id column of a row: an integer
                     (stored-id-read? locals init) nil
                     ;; otherwise the propagation that tainted this use already looked through the initializer,
                     ;; and may have seen what this walk cannot -- a call whose return is tainted
                     :else                [nd]))

                 (n/inner? nd)                                 (mapcat #(walk % seen) (ast/children nd))
                 :else                                         nil))]
       (walk node #{})))))

(defn local-inits
  "Position of each local usage -> the node its binding was initialized with, for the simple bindings in a file:
  `(let [x (f y)] ...)` maps every use of `x` to `(f y)`. Destructured bindings are left out; there the init
  is the whole map or vector, and a key of it is not the same thing.

  `calls` is every call node of the file (the engine's call index, so the tree is walked once); `locals` and
  `local-usages` are clj-kondo's for the file, which is what ties a use to its binding."
  [calls locals local-usages]
  (let [bind->init (into {}
                         (for [nd    calls
                               :let  [head (ast/head-sym nd)]
                               :when (vocab/binding-head? head)
                               :let  [bv (ast/arg nd 0)]
                               :when (ast/vector-node? bv)
                               [b init] (partition 2 (ast/children bv))
                               :let  [b (ast/unmeta b)]
                               :when (and init (ast/symbol-node? b))]
                           ;; a `with-open` binding is a stream or a reader, whatever opened it: the form itself
                           ;; stands as the init, so a rule can name `with-open` among its sanitizers
                           [((juxt :row :col) (meta b)) (if (= "with-open" (name head)) nd init)]))
        id->init   (into {} (keep (fn [{:keys [id row col]}]
                                    (when-let [init (get bind->init [row col])] [id init])))
                         locals)]
    (into {} (keep (fn [{:keys [id row col]}]
                     (when-let [init (get id->init id)] [[row col] init])))
          local-usages)))

(defn tainted?
  "True if `node` contains a local binding usage that isn't wrapped in a sanitizer. See [[tainted-leaves]]."
  ([ctx node] (tainted? ctx node nil))
  ([ctx node opts]
   (boolean (seq (tainted-leaves ctx node opts)))))

(defn origins
  "The labels of every boundary the values in `node` crossed: `#{:request :app-db/Card}` for a node that mixes a
  request value with a card's column. Empty when nothing in it is tainted. Under the `:any-local` policy every
  local carries `:local` and nothing else."
  ([ctx node] (origins ctx node nil))
  ([ctx node opts]
   (into #{} (comp (mapcat (fn [leaf]
                             (let [pos ((juxt :row :col) (meta leaf))]
                               (or (get (:origin-calls ctx) pos)
                                   (get (:locals ctx) pos #{:local})))))
                   (remove check-label?)
                   ;; the shape refinements are for selecting positions, not for saying where a value came from
                   (map #(if (#{:request/untyped :request/structured} %) :request %)))
         (tainted-leaves ctx node opts))))

(defn checks
  "The authorization checks the values in `node` passed through: `#{:checked/Card}` for an id handed to
  `(api/read-check :model/Card id)` anywhere on its way here, in this function or one it was passed to. Read
  from `:labels`, which carries every label at every usage, and from the origin calls -- a check function's
  own return is checked."
  [ctx node]
  (let [labels (:labels ctx)]
    (into #{} (comp (mapcat (fn [nd]
                              (let [pos ((juxt :row :col) (meta nd))]
                                (concat (get (:origin-calls ctx) pos) (get labels pos)))))
                    (filter check-label?))
          (ast/find-nodes (fn [nd] (or (ast/symbol-node? nd) (ast/call? nd))) node))))

(def pass-through-heads
  "Calls that hand a value on as it is: `(name unit)`, `(:schema target)`, `(str x)`. A value arriving through one
  of these is as raw as a bare local. A value arriving through any *other* call -- `(u.date/format t)`,
  `(datepart-token unit)` -- has been rendered or mapped by something, and the shape rules do not second-guess
  what: they report the value the code splices as it is, not every value a function might return."
  '#{name str get get-in first second nth})

(defn raw-value?
  "Whether `node` is an unsanitized local, or a pass-through call over one. See [[pass-through-heads]]."
  ([ctx node] (raw-value? ctx node nil))
  ([ctx node {:keys [sanitizers] :as opts}]
   (cond
     (ast/symbol-node? node)
     (tainted? ctx node opts)

     (ast/call? node)
     (let [head (ast/head-sym node)]
       (or
        ;; a value straight out of a boundary function: `(yaml/parse-string text)`, `(t2/select-one ...)`
        (boolean (get (:origin-calls ctx) ((juxt :row :col) (meta node))))
        (and (or (ast/keyword-node? (first (ast/children node)))
                 (and head (contains? pass-through-heads (symbol (name head)))))
             (not (sanitizer? head (or sanitizers default-sanitizers)))
             (boolean (some #(raw-value? ctx % opts) (ast/args node))))))

     :else false)))
