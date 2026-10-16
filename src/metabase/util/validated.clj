(ns metabase.util.validated
  "Validity is a function of a value *and the context it is used in*.

  An email can be well formed and still not be valid to send: the recipient may never have opted in, or it may have
  gone out already. That same email can be valid to preview, and previewing has a check that sending does not -- the
  viewer must be allowed to see it. So a type declares every check once, groups them into *purposes*, and each call
  site asks one question with an explicit context:

    (v/check  email {:purpose ::sending :db db :now now})        ; true, or a report of what failed
    (v/check! email {:purpose ::previewing :viewer-id 2})        ; email, or throws

  Nothing is validated unless a call site asks. Constructors, `assoc` and methods never run checks, so no value is
  proof of anything: the proof is that the call site ran the checker. That is why an effect belongs behind a
  capability -- see `Capabilities` below -- rather than behind a value that claims to have been validated.

  ## Declaring a type

  A type implements [[Validatable]]. [[checks]] returns every check, with its doc and what it waits on; [[purposes]]
  maps each purpose to the checks it requires. `::intrinsic` is the purpose \"valid as itself\", and every type
  declares it. All of a type's validity rules live in its definition.

    (defrecord Address [address]
      v/Validatable
      (checks [_]
        {::well-formed {:doc \"looks like an email address\"
                        :f   (fn [{:keys [address]} _fetched]
                               (boolean (re-matches #\".+@.+\" address)))}})
      (purposes [_]
        {::v/intrinsic #{::well-formed}}))

  A check's `:f` takes two arguments -- the value, and what its fetches read -- and passes by returning exactly
  `true`. Anything else is the failure, reported under the check's name; exceptions propagate, so a check may throw
  the 403 an existing permission check already throws.

    {:doc         \"what this check means\"        ; required, and shown in the report
     :f           (fn [value fetched] ...)         ; required
     :after       #{::other-check ::v/parts}       ; checks and gates this one waits on
     :fetches     #{::some-fetch}                  ; fetches, by name, handed to `:f` as `fetched`
     :status-code 409}                             ; what [[check!]] throws when this is what failed

  A check never sees the context. Everything beyond the value reaches a check through a fetch it declared, so
  \"reads only its value\" is a fact about a check's arguments rather than a claim it makes about itself: a pass can
  be remembered safely, and a failure is reported as contextual exactly when the check waits on a fetch.

  ## Reading the world

  A check that reads the world declares a fetch and implements [[ExternallyValidatable]]. A fetch reads the world
  only through the context, never through a closed-over global, and takes the keys of every value in the call at
  once, so one fetch is one call with duplicate keys removed.

    v/ExternallyValidatable
    (fetches [_]
      {::sent-at {:after #{::id}                          ; checks over what it reads
                  :key   :id                              ; one key per value; `:keys` for many
                  :f     (fn [ids ctx] ...)}})            ; the batch of distinct keys -> anything `get`-able

  `:f` returns something a key looks up in: a map of key to value, or a set. A `:key` fetch hands `:f` of the check
  that value; a `:keys` fetch hands it a map of this value's keys to what came back; a fetch declaring neither is
  read once per call and handed over whole, with `nil` for its keys.

  A parameter of the question -- who is asking, what the clock says -- is read the same way, by a fetch with no keys
  of its own. [[from-context]] is that fetch:

    (fetches [_]
      {::viewer (v/from-context :viewer-id)})

  So the context is reachable from exactly one place in a type, and reading it is declared where reading the
  database is declared. A clock is a world read like any other, which is why it belongs here too: a check that read
  one directly would have its stale answer remembered.

  ## Purposes

  A purpose names what it requires *beyond* the value being valid as itself: every purpose includes `::intrinsic`,
  the same way a holder runs every part's intrinsic checks whatever it is being validated for. A purpose may also
  name another purpose to include its checks.

    (purposes [_]
      {::v/intrinsic #{::id ::to ::subject ::body}
       ::sending     #{::consented ::not-yet-sent}
       ::previewing  #{::viewer-may-see}})

  There is no default purpose, so a check can never silently run nothing: a context with no `:purpose`, or a purpose
  the type does not declare, is an error. Whatever a purpose leaves out, its checks' own dependencies are always run.

  ## Parts

  A field holding a Validatable value, directly or in a collection, adds that value's `::intrinsic` checks to its
  holder's, named by the path to it: `[:to 0 ::well-formed]`. A malformed Address fails every purpose of the Email
  that holds it, just as a malformed Email does, and nobody has to remember to check either. `::parts` is a gate over every part of a value, so a check
  that reads a part waits on `::parts` the way it waits on any other check.

  Parts are found by walking the record's own fields and the collections in them, so a field holding a large tree is
  walked on every call.

  ## Capabilities

  This namespace has no opinion about effects, because the guarantee is structural: application code holds a
  capability -- a `reify` closing over the transport -- whose operations refuse a context whose purpose is not the
  one they perform, and call [[check!]] before they act. Then the public API offers no way to send unchecked, and a
  second sending path has to be added deliberately, where review can see it.

    (defn mailer [transport]
      (reify Mailer
        (send! [_ ctx email]
          (when-not (= (:purpose ctx) ::sending)
            (throw (ex-info \"not a sending context\" {:error ::wrong-purpose :purpose (:purpose ctx)})))
          (deliver! transport ctx (v/check! email ctx)))))

  ## What is remembered

  A check with no fetches reads only its value, so it is remembered when it passes, by the identity of that value:
  a part is not re-checked because its holder changed, and an unchanged value is not re-checked at all. Failures are
  never remembered, and a check that waits on a fetch always runs -- a remembered pass never stands in for asking.

  ## What is not here

  The record opinions -- qualified field keys, `dissoc` keeping the type, the qualified print tag -- are a separate
  primitive, and a type may use plain `defrecord` and still be Validatable. Two things from the design are still
  open and so absent: a protocol by which a record type remembers passes in a bitmask slot and invalidates them per
  field, and an arglist syntax (`defchecks`) that would let a macro check dependency names at compile time instead of
  at first use. `check-all!` is likewise open, and not defined: a caller that wants per-value failures reads the
  results of [[check-all]]."
  (:require
   [metabase.util.i18n :refer [tru]])
  (:import
   (com.google.common.collect MapMaker)
   (java.util.concurrent ConcurrentHashMap ConcurrentMap)))

(set! *warn-on-reflection* true)

;; `::rejected` means that only checks reading something beyond the value failed; `::invalid` means a check on the value itself did. Both
;; derive from `::check-failed`, so a caller matches either with `isa?`.
(derive ::invalid ::check-failed)
(derive ::rejected ::check-failed)

(defprotocol Validatable
  "What a type requires of itself. All of its validity rules live in its definition; the library owns the functions
  that enforce them, so a type cannot forget to validate."
  (checks [record]
    "Every check of this type, as a map of check name to a check map. See the namespace docstring for the keys. Must
    be a function of the type, not of the instance: it is read once per class.")
  (purposes [record]
    "A map of purpose name to the set of checks that purpose requires beyond `::intrinsic`, which every purpose
    includes. A name that is another purpose includes that purpose's checks. `::intrinsic` itself is required: it is
    what this type is to be valid as itself, and what a holder runs over this value when it is a part."))

(defprotocol ExternallyValidatable
  "What a type reads from the world. Optional: a type with no fetches does not implement it."
  (fetches [record]
    "Every fetch of this type, as a map of fetch name to a fetch map. See the namespace docstring for the keys. Must
    be a function of the type, not of the instance: it is read once per class."))

(defn- validatable? [x]
  ;; `satisfies?` is an `instance?` check against the protocol's interface for the common case, a record that
  ;; implements the protocol inline.
  (satisfies? Validatable x))

(defn field
  "A check that `pred` holds of the `k` field of the value. The whole of a check that needs no detail in its report:

    {::subject (v/field :subject (complement str/blank?))}"
  ([k pred]
   (field k pred (str "a valid " (name k))))
  ([k pred doc]
   {:doc doc
    :f   (fn [value _fetched] (boolean (pred (get value k))))}))

(defn from-context
  "A fetch that reads `k` of the context: where a parameter of the question goes, such as who is asking or what the
  clock says. It has no keys of its own, so it is read once per call.

    (fetches [_] {::viewer (v/from-context :viewer-id)})

  A check that waits on it is contextual like any other: it runs every time, and its failure is reported as
  contextual."
  [k]
  {:f (fn [_keys ctx] (get ctx k))})

;;; --------------------------------------------------- what ran ----------------------------------------------------

(defn- trace!
  "Record `event` when the context carries a `::trace` atom. For tests that assert what ran, and what was fetched."
  [ctx event]
  (when-let [t (::trace ctx)]
    (swap! t conj event)))

;;; ----------------------------------------------- remembered passes -----------------------------------------------

(defonce ^:private ^ConcurrentMap passes
  ;; value -> atom holding the set of names of the pure checks it has passed. Guava's weak keys compare with
  ;; `identical?`, so this is keyed by the value in hand rather than by an equal value built elsewhere: no hashing of
  ;; a whole record on every lookup, and a value is garbage collected like any other.
  (.makeMap (.weakKeys (MapMaker.))))

(defn- passes-atom [value]
  (or (.get passes value)
      (let [a (atom #{})]
        (or (.putIfAbsent passes value a) a))))

;;; ------------------------------------------------- declarations ---------------------------------------------------

(defn- bad-declaration! [value problems]
  (throw (ex-info (str "Invalid validity declarations on " (.getName (class value)))
                  {:error       ::bad-declaration
                   :status-code 500
                   :type        (class value)
                   :problems    (vec problems)})))

(defn- declaration-problems
  "Everything wrong with one type's declarations, as strings. Read once per class, so an unknown dependency or a cycle
  is reported at first use rather than from the middle of a run."
  [check-map fetch-map purpose-map]
  (let [check-names  (set (keys check-map))
        fetch-names  (set (keys fetch-map))
        known-after  (conj check-names ::parts)
        dep-problems (fn [owner nm deps allowed what]
                       (for [d deps :when (not (contains? allowed d))]
                         (str owner " " nm " waits on " what " " d ", which is not declared")))
        ;; a misspelled key would otherwise mean a dependency that is silently never waited on
        stray-keys   (fn [owner nm decl allowed]
                       (for [k (remove allowed (keys decl))]
                         (str owner " " nm " declares " k ", which means nothing here"
                              (when (= :context k)
                                (str ", and a check cannot read the context: declare a fetch instead, such as"
                                     " (v/from-context :viewer-id)")))))]
    (concat
     (when (contains? check-names ::parts)
       [(str "check " ::parts " is reserved: it names the gate over a value's parts")])
     (for [nm (filter check-names fetch-names)]
       (str nm " is both a check and a fetch"))
     (when-not (contains? purpose-map ::intrinsic)
       [(str "no " ::intrinsic " purpose: every type declares what it is to be valid as itself")])
     (mapcat (fn [[nm {:keys [doc f after fetches] :as decl}]]
               (concat (when-not (string? doc) [(str "check " nm " has no :doc")])
                       (when-not (ifn? f) [(str "check " nm " has no :f")])
                       (stray-keys "check" nm decl #{:doc :f :after :fetches :status-code})
                       (dep-problems "check" nm after known-after "check")
                       (dep-problems "check" nm fetches fetch-names "fetch")))
             check-map)
     (mapcat (fn [[nm {:keys [f after], k :key, ks :keys, :as decl}]]
               (concat (when-not (ifn? f) [(str "fetch " nm " has no :f")])
                       (when (and k ks) [(str "fetch " nm " declares both :key and :keys")])
                       (stray-keys "fetch" nm decl #{:doc :f :after :key :keys})
                       (dep-problems "fetch" nm after known-after "check")))
             fetch-map)
     (mapcat (fn [[purpose names]]
               (for [nm names :when (not (or (contains? check-names nm) (contains? purpose-map nm)))]
                 (str "purpose " purpose " requires " nm ", which is neither a check nor a purpose")))
             purpose-map))))

(defn- expand-purposes
  "`purpose-map` with every purpose resolved to a set of check names: a name that is a check is a check, a name that
  is another purpose brings in that purpose's checks, and every purpose includes `::intrinsic`, because a value that
  is not valid as itself is not valid for anything -- the same rule a holder already applies to its parts. So a
  purpose declares only what it needs *beyond* being well formed."
  [value check-map purpose-map]
  (letfn [(expand [purpose seen]
            (when (contains? seen purpose)
              (bad-declaration! value [(str "purpose " purpose " includes itself")]))
            (reduce (fn [acc nm]
                      (if (contains? check-map nm)
                        (conj acc nm)
                        (into acc (expand nm (conj seen purpose)))))
                    #{}
                    (get purpose-map purpose)))]
    (let [intrinsic (expand ::intrinsic #{})]
      (into {} (map (fn [[purpose _]] [purpose (into intrinsic (expand purpose #{}))])) purpose-map))))

(defonce ^:private ^ConcurrentHashMap declarations
  ;; class -> {:checks ... :fetches ... :purposes ...}, validated once.
  (ConcurrentHashMap.))

(defn- declarations-of [value]
  (let [k (class value)]
    (or (.get declarations k)
        (let [check-map  (checks value)
              fetch-map  (when (satisfies? ExternallyValidatable value) (fetches value))
              purpose-map (purposes value)]
          (when-let [problems (seq (declaration-problems check-map fetch-map purpose-map))]
            (bad-declaration! value problems))
          (let [d {:checks   check-map
                   :fetches  fetch-map
                   :purposes (expand-purposes value check-map purpose-map)}]
            (.put declarations k d)
            d)))))

;;; ------------------------------------------------- the check graph ------------------------------------------------

(defn- node-key
  "What a check, fetch or gate of the value at `path` is called in a report. A name on the value itself keeps its own
  name; one on a part is named by the path to it, as `[:to 0 ::well-formed]`."
  [path nm]
  (if (seq path) (conj path nm) nm))

(defn- parts
  "Pairs of `[path part]` for every Validatable reachable from the record fields of `value`, through the collections
  in them, to any depth. A part's own parts are collected too, under the longer path. A segment is a field or map
  key, an index into a sequential, or, for a set, the member itself."
  [value]
  (letfn [(descend [acc path v]
            (cond
              (validatable? v)  (own-fields (conj acc [path v]) path v)
              (map? v)          (reduce-kv (fn [a k x] (descend a (conj path k) x)) acc v)
              (set? v)          (reduce (fn [a x] (descend a (conj path x) x)) acc v)
              (sequential? v)   (first (reduce (fn [[a i] x] [(descend a (conj path i) x) (inc i)]) [acc 0] v))
              :else             acc))
          (own-fields [acc path v]
            (reduce-kv (fn [a k x] (descend a (conj path k) x)) acc v))]
    (own-fields [] [] value)))

(defn- check-node [path decls value nm]
  (let [{:keys [doc f after fetches status-code]} (get (:checks decls) nm)
        ;; nothing but the value reaches a check except through a fetch, so this is a fact rather than a claim
        contextual (boolean (seq fetches))]
    {:key         (node-key path nm)
     :name        nm
     :path        path
     :doc         doc
     :f           f
     :value       value
     :after       (into #{} (map #(node-key path %)) after)
     :fetches     (into {} (map (fn [fnm] [fnm (node-key path fnm)])) fetches)
     :contextual  contextual
     :pure        (not contextual)
     :status-code status-code}))

(defn- fetch-node [path decls value nm]
  (let [{:keys [f after], k :key, ks :keys} (get (:fetches decls) nm)]
    {:key     (node-key path nm)
     :name    nm
     :f       f
     ;; every value whose fetch is this one of this type is fetched together
     :group   [nm f]
     :value   value
     :after   (into #{} (map #(node-key path %)) after)
     :mode    (cond ks :many k :one :else :shared)
     :keys-fn (cond ks   (fn [v] (vec (ks v)))
                    k    (fn [v] [(k v)])
                    :else (constantly nil))}))

(defn- gate-node
  "The `::parts` gate of the value at `path`: it passes once every check over every part under `path` has."
  [path check-nodes]
  {:key   (node-key path ::parts)
   :path  path
   :gate  true
   :after (into #{}
                (keep (fn [[k node]]
                        (let [p (:path node)]
                          (when (and (> (count p) (count path))
                                     (= path (subvec p 0 (count path))))
                            k))))
                check-nodes)})

(defn- unknown-purpose! [value purpose]
  (throw (ex-info (str (.getName (class value)) " declares no " purpose " purpose")
                  {:error       ::unknown-purpose
                   :status-code 500
                   :type        (class value)
                   :purpose     purpose})))

(defn- plan
  "Everything to run over `value` for `purpose`: the purpose's own checks, every part's intrinsic checks, whatever
  those wait on, the fetches they read, and a `::parts` gate wherever one is waited on."
  [value purpose]
  (let [root-decls (declarations-of value)
        seeds      (concat (for [nm (or (get-in root-decls [:purposes purpose])
                                        (unknown-purpose! value purpose))]
                             [[] root-decls value nm])
                           (for [[path part] (parts value)
                                 :let [decls (declarations-of part)]
                                 nm (get-in decls [:purposes ::intrinsic])]
                             [path decls part nm]))]
    ;; Walk out from the seeds: a check pulls in the checks and fetches it waits on, and a fetch pulls in the checks
    ;; over what it reads, so a purpose that names only some of a chain still runs all of it.
    (loop [[seed & more] seeds
           check-nodes   {}
           fetch-nodes   {}]
      (if-not seed
        (let [gates (into {}
                          (comp (mapcat (fn [[_ node]] (:after node)))
                                (filter #(and (vector? %) (= ::parts (peek %))))
                                (distinct)
                                (map (fn [k] [k (gate-node (pop k) check-nodes)])))
                          (concat check-nodes fetch-nodes))
              root-gate (when (some (fn [[_ node]] (contains? (:after node) ::parts))
                                    (concat check-nodes fetch-nodes))
                          {::parts (gate-node [] check-nodes)})]
          {:value value
           :nodes (merge check-nodes gates root-gate)
           :fetch-nodes fetch-nodes})
        (let [[path decls part nm] seed]
          (cond
            (contains? (:fetches decls) nm)
            (let [node (fetch-node path decls part nm)]
              (if (contains? fetch-nodes (:key node))
                (recur more check-nodes fetch-nodes)
                (recur (concat more (for [dep (:after (get (:fetches decls) nm))] [path decls part dep]))
                       check-nodes
                       (assoc fetch-nodes (:key node) node))))

            (contains? (:checks decls) nm)
            (let [node (check-node path decls part nm)]
              (if (contains? check-nodes (:key node))
                (recur more check-nodes fetch-nodes)
                (let [decl (get (:checks decls) nm)]
                  (recur (concat more (for [dep (concat (remove #{::parts} (:after decl)) (:fetches decl))]
                                        [path decls part dep]))
                         (assoc check-nodes (:key node) node)
                         fetch-nodes))))

            ;; `::parts`, which is a gate rather than a declaration
            :else (recur more check-nodes fetch-nodes)))))))

;;; ---------------------------------------------------- running -----------------------------------------------------

(defn- resolved? [state k]
  (contains? (:status state) k))

(defn- fetch-resolved? [state k]
  (contains? (:fetch-status state) k))

(defn- ready?
  "Whether everything `node` waits on has resolved, one way or the other."
  [state node]
  (and (every? #(resolved? state %) (:after node))
       (every? #(fetch-resolved? state %) (vals (:fetches node)))))

(defn- causes
  "The checks that failed and so stop a node from running: the failed ones among what it waits on, and whatever is
  behind a blocked check or a skipped fetch. Empty when it may run."
  [state check-ks fetch-ks]
  (into (reduce (fn [acc k]
                  (case (get (:status state) k)
                    :failed  (conj acc k)
                    :blocked (into acc (get (:causes state) k))
                    acc))
                #{}
                check-ks)
        (mapcat (fn [k]
                  (when (= :skipped (get (:fetch-status state) k))
                    (get (:causes state) k))))
        fetch-ks))

(defn- block
  "Mark `k` blocked by `cs`, and note under each of those failures what it blocked. A gate is left out of the report:
  a failure lists the checks that would have run, not the plumbing between them."
  [state plan k cs]
  (cond-> (-> state
              (assoc-in [:status k] :blocked)
              (assoc-in [:causes k] cs))
    (not (:gate (get-in plan [:nodes k])))
    (update :failures (fn [failures]
                        (reduce (fn [fs cause] (update-in fs [cause :blocked] (fnil conj []) k))
                                failures
                                cs)))))

(defn- run-check [state plan ctx k]
  (let [node (get-in plan [:nodes k])]
    (cond
      (:gate node)
      (assoc-in state [:status k] :passed)

      (and (:pure node) (contains? @(passes-atom (:value node)) (:name node)))
      (assoc-in state [:status k] :passed)

      :else
      (let [fetched (into {} (map (fn [[nm fk]] [nm (get (:fetched state) fk)])) (:fetches node))
            _       (trace! ctx k)
            result  ((:f node) (:value node) fetched)]
        (if (true? result)
          (do
            (when (:pure node)
              (swap! (passes-atom (:value node)) conj (:name node)))
            (assoc-in state [:status k] :passed))
          (-> state
              (assoc-in [:status k] :failed)
              (assoc-in [:failures k] (cond-> {:doc (:doc node) :returned result}
                                        (:contextual node)  (assoc :contextual true)
                                        (:status-code node) (assoc :status-code (:status-code node))))))))))

(defn- advance-checks
  "Run or block every check that can resolve without a new fetch."
  [state plan ctx]
  (loop [state state]
    (let [ready (for [[k node] (:nodes plan)
                      :when    (and (not (resolved? state k)) (ready? state node))]
                  k)]
      (if (empty? ready)
        state
        (recur (reduce (fn [s k]
                         (let [node (get-in plan [:nodes k])
                               cs   (causes s (:after node) (vals (:fetches node)))]
                           (if (seq cs)
                             (block s plan k cs)
                             (run-check s plan ctx k))))
                       state
                       ready))))))

(defn- run-fetches
  "One round of fetching over every value in the call: each fetch whose checks have resolved is one call, with the
  keys of every value that needs it, duplicates removed. A fetch over a value whose checks failed is not made, so a
  malformed value is never asked about."
  [states plans ctx]
  (let [ready (for [i     (range (count plans))
                    fnode (vals (:fetch-nodes (nth plans i)))
                    :when (and (not (fetch-resolved? (nth states i) (:key fnode)))
                               (ready? (nth states i) fnode))]
                [i fnode])
        skip? (fn [[i fnode]] (seq (causes (nth states i) (:after fnode) nil)))
        states (reduce (fn [ss [i fnode]]
                         (update ss i #(-> %
                                           (assoc-in [:fetch-status (:key fnode)] :skipped)
                                           (assoc-in [:causes (:key fnode)] (causes % (:after fnode) nil)))))
                       states
                       (filter skip? ready))]
    (reduce (fn [ss entries]
              (let [per    (for [[i fnode] entries] [i fnode ((:keys-fn fnode) (:value fnode))])
                    fnode  (second (first entries))
                    shared (= :shared (:mode fnode))
                    ks     (when-not shared (vec (distinct (mapcat (fn [[_ _ ks]] ks) per))))
                    _      (trace! ctx (if shared
                                              [:fetched (:name fnode)]
                                              [:fetched (:name fnode) (count ks)]))
                    result ((:f fnode) ks ctx)]
                (reduce (fn [ss [i fnode ks]]
                          (let [fetched (case (:mode fnode)
                                          :shared result
                                          :one    (get result (first ks))
                                          :many   (into {} (map (juxt identity #(get result %))) ks))]
                            (update ss i #(-> %
                                              (assoc-in [:fetched (:key fnode)] fetched)
                                              (assoc-in [:fetch-status (:key fnode)] :fetched)))))
                        ss
                        per)))
            states
            (vals (group-by (fn [[_ fnode]] (:group fnode)) (remove skip? ready))))))

(defn- complete? [state plan]
  (every? #(resolved? state %) (keys (:nodes plan))))

(defn- run [plans ctx]
  (loop [states (vec (repeat (count plans) {}))]
    (let [states (mapv #(advance-checks %1 %2 ctx) states plans)]
      (if (every? true? (map complete? states plans))
        states
        (let [fetched (run-fetches states plans ctx)]
          (when (= fetched states)
            ;; Dependencies are acyclic -- `declarations-of` rejects a cycle -- so this cannot happen.
            (throw (ex-info "Checks are pending with nothing left that can run"
                            {:error ::stuck :status-code 500})))
          (recur fetched))))))

;;; -------------------------------------------------- the question --------------------------------------------------

(defn- report [state]
  (let [failures (:failures state)]
    (if (empty? failures) true failures)))

(defn check-all
  "[[check]] over `values`, sharing one round of fetching: the results, in order, each `true` or that value's
  failures. Every value is checked for the one `:purpose` of `ctx`."
  [values ctx]
  (let [purpose (or (:purpose ctx)
                    (throw (ex-info "No :purpose in the context: a value is valid for something, or not at all"
                                    {:error ::no-purpose :status-code 500})))]
    (doseq [value values]
      (when-not (validatable? value)
        (throw (ex-info (str "Not Validatable: " (pr-str (class value)))
                        {:error ::not-validatable :status-code 500 :type (class value)}))))
    (mapv report (run (mapv #(plan % purpose) values) ctx))))

(defn check
  "Whether `value` is valid for the `:purpose` of `ctx`: `true`, or a map of what failed, keyed by check name -- by
  the path to it, for a check over a part. Each failure carries the check's `:doc`, what the check `:returned`,
  `:contextual true` when the check read the world or the context, and `:blocked` listing the checks that did not run
  because of it. Throws when the context names no purpose, when the type does not declare that purpose, or when
  `value` is not Validatable: those are mistakes in the call, not invalidity."
  [value ctx]
  (first (check-all [value] ctx)))

(defn check!
  "`value`, valid for the `:purpose` of `ctx`, or throws. The thrown `ex-data` carries the `:failures` of [[check]]
  under an `:error` of `::rejected`, when only context-dependent checks failed, or `::invalid`, when a check on the
  value itself did; both derive from `::check-failed`. Its `:status-code` is whatever the failing check declared, or
  400 for `::invalid` and 403 for `::rejected`."
  [value ctx]
  (let [result (check value ctx)]
    (if (true? result)
      value
      (let [failures   (vals result)
            contextual (every? :contextual failures)]
        (throw (ex-info (tru "Invalid {0}" (.getSimpleName (class value)))
                        {:error       (if contextual ::rejected ::invalid)
                         :status-code (or (some :status-code failures) (if contextual 403 400))
                         :type        (class value)
                         :purpose     (:purpose ctx)
                         :failures    result}))))))
