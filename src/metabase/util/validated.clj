(ns metabase.util.validated
  "A validated record is proof that every one of its checks passed for exactly that record.

  Declare a record's checks, and what they fetch from the world, in one `def` next to the record:

    (def ^:private rename-card-declaration
      {:checks [{:name  ::title-not-blank
                 :doc   \"The title is a non-blank string.\"
                 :kind  :pure
                 :reads [:title]
                 :f     (fn [title] (and (string? title) (not (str/blank? title))))}
                {:name  ::may-write-card
                 :doc   \"The current user may write the card.\"
                 :kind  :external
                 :reads [:card-id]
                 :f     (fn [card-id] (api/write-check :model/Card card-id) true)}]}

    (defrecord RenameCard [user-id card-id title]
      validated/Validatable
      (declaration [_] rename-card-declaration))

  A check receives exactly what it names: the fields under `:reads`, then the fetches under `:fetches`, in that
  order. It passes when it returns exactly `true`. Anything else is the failure, reported under its name. A `:pure`
  check reads only its arguments, and its pass is remembered; an `:external` one reads the world, and runs on every
  call. An external check may name `:fetches`. A [[parse-all]] calls each fetch once per record type, with each
  distinct tuple of arguments once. Nothing fetches and no external check runs until every pure check passes.

  Parse where the request is parsed. Who is acting is a field, like anything else the checks read:

    (validated/parse (->RenameCard api/*current-user-id* 1 \"New\"))

  The write takes the record and nothing else, and reads what it writes out of it:

    (defn rename-card! [rename]
      (let [^RenameCard rename (validated/validated RenameCard rename)]
        (t2/update! :model/Card (.-card-id rename) {:name (.-title rename)})))

  [[parse]] returns the record it was given and remembers that it did. [[validated]] refuses any record it does not
  remember: one built with the constructor, or one made by `assoc` on a parsed record.

  Before parsing, a record is a draft. [[check]] runs some of its checks and remembers which pure checks passed;
  [[assoc-field]] keeps those passes for every check that does not read the field it writes; [[parse]] runs only what
  is not already known to pass. External checks run on every call. See validated.md."
  (:require
   [clojure.set :as set]
   [metabase.util.i18n :refer [tru]])
  (:import
   (clojure.lang Reflector)
   (com.google.common.collect MapMaker)
   (java.lang.reflect Field Modifier)
   (java.util Map)))

(set! *warn-on-reflection* true)

(defprotocol Validatable
  "A record that can be validated."
  (declaration [record]
    "`{:checks [check ...], :fetches [fetch ...]}`. Return the same `def`ed map every time.

    A check is `{:name :doc :kind :reads :fetches :status-code :f}`. `:kind` is `:pure`, for a check that reads only
    its arguments, whose pass is remembered, or `:external`, for one that reads the world, which runs on every call.
    A pure check's pass is remembered for the record, so the fields it reads must be immutable values, and its `:f`
    must not read a global that can change, such as an atom. The check that an `:f` closes over no locals does not see
    globals. It also refuses `constantly`, `partial`, `comp`, `memoize` and `with-meta` on a fn, which close over
    their arguments: write a `fn`.
    Only an external check may name `:fetches`. `:status-code` is the HTTP status when this check is the first to
    fail; the default is 400 for a pure check and 403 for an external one.

    A fetch is `{:name :reads :f}`. Its `:f` takes every distinct tuple of the fields it reads, across all the records
    in the call, and returns a map from each tuple to what it fetched."))

;; Every record [[parse]] returned, by identity: Guava's weak keys compare with `identical?`, not `=`, so an equal
;; record built by hand is not in here. A secret in a field or in metadata would not do: either can be read out of one
;; parsed record and put into a forged one. Weak, so a record is garbage collected like any other value.
(defonce ^:private ^Map issued
  (.makeMap (.weakKeys (MapMaker.))))

;; Record -> `[plan mask]`: the pure checks it passed, one bit per check of that plan, by identity. Out of the record so
;; it cannot be forged, and lost on a plain `assoc`, which makes every check run again. The plan is kept so the bits
;; are read only against the plan that set them.
(defonce ^:private ^Map passed
  (.makeMap (.weakKeys (MapMaker.))))

;; Declaration -> its plan, by identity.
(defonce ^:private ^Map plans
  (.makeMap (.weakKeys (MapMaker.))))

;;; ------------------------------------------------ Plans ------------------------------------------------

(defn- bad-declaration! [record-class message data]
  (throw (ex-info (str (.getSimpleName ^Class record-class) ": " message)
                  (merge {:status-code 500, :record record-class} data))))

(defn- closed-over-locals
  "The locals `f` closes over. A check must close over none, or what it reads would not be what it declares."
  [f]
  (into []
        (comp (remove #(Modifier/isStatic (.getModifiers ^Field %)))
              (map #(.getName ^Field %)))
        (.getDeclaredFields (class f))))

(defn- record-fields [^Class record-class]
  (into #{} (map keyword) (Reflector/invokeStaticMethod record-class "getBasis" (object-array 0))))

(defn- validate-declaration! [record-class {:keys [checks fetches]}]
  (let [fields      (record-fields record-class)
        fetch-names (into #{} (map :name) fetches)
        names       (concat (map :name checks) (map :name fetches))]
    (when-let [dupes (seq (for [[n c] (frequencies names) :when (< 1 c)] n))]
      (bad-declaration! record-class "a check or fetch name is used twice" {:names dupes}))
    (doseq [{n :name, :keys [doc kind reads f], fs :fetches} (concat checks fetches)
            :let [check? (contains? (set (map :name checks)) n)]]
      (when-not (qualified-keyword? n)
        (bad-declaration! record-class "a check or fetch name must be a qualified keyword" {:name n}))
      (when-not (fn? f)
        (bad-declaration! record-class "a check or fetch needs an :f" {:name n}))
      (when (and check? (not (string? doc)))
        (bad-declaration! record-class "a check needs a :doc" {:name n}))
      (when (and check? (not (#{:pure :external} kind)))
        (bad-declaration! record-class "a check's :kind is :pure or :external" {:name n, :kind kind}))
      (when (and check? (= :pure kind) (seq fs))
        (bad-declaration! record-class "a :pure check cannot fetch" {:name n}))
      (when-let [unknown (seq (remove fields reads))]
        (bad-declaration! record-class "a check or fetch reads a field the record does not have"
                          {:name n, :unknown-fields unknown, :fields fields}))
      (when-let [unknown (seq (remove fetch-names fs))]
        (bad-declaration! record-class "a check names a fetch that is not declared" {:name n, :unknown-fetches unknown}))
      (when-let [locals (seq (closed-over-locals f))]
        (bad-declaration! record-class (str "an :f closes over locals. It must read only its arguments, so that what"
                                            " it reads is what it declares.")
                          {:name n, :locals locals})))
    (when (< 64 (count (filter #(= :pure (:kind %)) checks)))
      (bad-declaration! record-class "more than 64 pure checks" {}))))

(defn- reads-set [x] (set (:reads x)))

(defn- compile-plan
  "Order the checks, and work out what each waits on.

  - A pure check waits on every pure check that reads a proper subset of its fields: a check on one field (its shape)
    runs before a check relating it to another.
  - A fetch waits on every pure check, so malformed input never reads the database.
  - An external check waits on its fetches and on every pure check, so it never runs, or publishes a refusal, for
    malformed input.

  Pure checks run first, fewest fields first, then fetches, then external checks, each in declaration order."
  [record-class {:keys [checks fetches], :as decl}]
  (validate-declaration! record-class decl)
  (let [pure       (filterv #(= :pure (:kind %)) checks)
        external   (filterv #(= :external (:kind %)) checks)
        bit        (zipmap (map :name pure) (range))
        waits-on   (fn [pred] (into #{} (comp (filter pred) (map :name)) pure))
        pure'      (for [c pure
                         :let [rs (reads-set c)]]
                     (assoc c
                            :pure?   true
                            :bit     (bit (:name c))
                            :prereqs (waits-on #(and (not= (:name %) (:name c))
                                                     (set/subset? (reads-set %) rs)
                                                     (not= (reads-set %) rs)))))
        all-pure   (waits-on any?)
        fetches'   (for [fd fetches]
                     (assoc fd :prereqs all-pure))
        external'  (for [c external]
                     (assoc c :prereqs (into all-pure (:fetches c))))]
    {:record-class  record-class
     :fields        (record-fields record-class)
     :pure          (vec (sort-by (comp count :reads) pure'))
     :fetches       (vec fetches')
     :external      (vec external')
     :checks-by-name (into {} (map (juxt :name identity)) (concat pure' external'))
     :fetches-by-name (into {} (map (juxt :name identity)) fetches')
     :field-mask    (reduce (fn [m {:keys [reads], b :bit}]
                              (reduce #(update %1 %2 (fnil bit-or 0) (bit-set 0 b)) m reads))
                            {}
                            pure')}))

(defn- plan-for [record]
  (when-not (satisfies? Validatable record)
    (throw (ex-info (str "Not a Validatable record: " (type record)) {:status-code 500, :got (type record)})))
  (let [decl (declaration record)
        plan (or (.get plans decl)
                 (let [plan (compile-plan (class record) decl)]
                   (.put plans decl plan)
                   plan))]
    (when-not (identical? (class record) (:record-class plan))
      (bad-declaration! (class record) "shares its declaration with another record type"
                        {:other (:record-class plan)}))
    plan))

;;; ------------------------------------------------ Running ------------------------------------------------

(defn- needed
  "`names` and everything they wait on, transitively."
  [plan names]
  (loop [todo (vec names), seen #{}]
    (if-let [[n & more] (seq todo)]
      (if (seen n)
        (recur (vec more) seen)
        (let [x (or ((:checks-by-name plan) n)
                    ((:fetches-by-name plan) n)
                    (throw (ex-info (str "Unknown check " n) {:status-code 500
                                                               :record      (:record-class plan)
                                                               :check       n})))]
          (recur (into (vec more) (:prereqs x)) (conj seen n))))
      seen)))

(defn- remembered-mask
  "The pure checks `record` is known to pass under `plan`, one bit each."
  [record plan]
  (let [[remembered-plan mask] (.get passed record)]
    (if (identical? plan remembered-plan) (long mask) 0)))

(defn- start [record names]
  (let [plan (plan-for record)]
    {:record   record
     :plan     plan
     :needed   (needed plan (or names (keys (:checks-by-name plan))))
     :mask     (remembered-mask record plan)
     :fetched  {}
     :failed   {}     ; check name -> failure entry
     :order    []     ; failed check names, in the order they failed
     :roots    {}}))  ; blocked check or fetch name -> the failed checks that blocked it

(defn- roots-of
  "The failed checks behind `prereqs`, or nil when none failed."
  [st prereqs]
  (seq (distinct (mapcat #(if (contains? (:failed st) %) [%] (get-in st [:roots %])) prereqs))))

(defn- block [st n roots check?]
  (cond-> (assoc-in st [:roots n] roots)
    check? (as-> st (reduce #(update-in %1 [:failed %2 :blocked] (fnil conj []) n) st roots))))

(defn- run-check [st {n :name, :keys [prereqs f doc reads fetches], :as c}]
  (if-let [roots (roots-of st prereqs)]
    (block st n roots true)
    (let [remembered? (and (:pure? c) (bit-test (:mask st) (:bit c)))
          result      (if remembered?
                        true
                        (apply f (concat (map #(get (:record st) %) reads)
                                         (map #(get-in st [:fetched %]) fetches))))]
      (cond
        (not (true? result))
        (-> st
            (assoc-in [:failed n] {:doc doc, :returned result})
            (update :order conj n))

        (:pure? c)
        (update st :mask bit-set (:bit c))

        :else
        st))))

(defn- run-pure [st]
  (reduce run-check st (filter (comp (:needed st) :name) (get-in st [:plan :pure]))))

(defn- run-external [st]
  (reduce run-check st (filter (comp (:needed st) :name) (get-in st [:plan :external]))))

(defn- fetch-phase
  "Run every fetch the records need, each once across all of them, with each distinct tuple of arguments once."
  [sts]
  (let [wanted (for [[i st] (map-indexed vector sts)
                     fd     (get-in st [:plan :fetches])
                     :when  ((:needed st) (:name fd))]
                 {:i i, :fd fd, :roots (roots-of st (:prereqs fd))})
        sts    (reduce (fn [sts {:keys [i fd roots]}]
                         (cond-> sts roots (update i block (:name fd) roots false)))
                       sts wanted)
        tuple  (fn [{:keys [i fd]}] (mapv #(get (:record (nth sts i)) %) (:reads fd)))]
    (reduce
     (fn [sts [_ ws]]
       (let [{fd :fd} (first ws)
             tuples   (into [] (comp (map tuple) (distinct)) ws)
             result   ((:f fd) tuples)]
         (when-let [missing (seq (remove #(and (map? result) (contains? result %)) tuples))]
           (throw (ex-info (str "Fetch " (:name fd) " returned no entry for some of its arguments")
                           {:status-code 500, :fetch (:name fd), :missing missing})))
         (reduce (fn [sts w]
                   (assoc-in sts [(:i w) :fetched (:name fd)] (get result (tuple w))))
                 sts ws)))
     sts
     ;; one call per fetch per record type: the same fetch name on two record types is two fetches
     (group-by (fn [{:keys [i fd]}] [(get-in sts [i :plan :record-class]) (:name fd)])
               (remove :roots wanted)))))

(defn- finish
  "Remember the pure checks that passed, and return `true` or the failures."
  [{:keys [record plan mask failed]}]
  (if (zero? mask)
    (.remove passed record)
    (.put passed record [plan mask]))
  (if (empty? failed) true failed))

(defn- run-all [records names]
  (as-> (mapv #(start % names) records) sts
    (mapv run-pure sts)
    (fetch-phase sts)
    (mapv run-external sts)))

(defn check-all
  "Run the checks named in `names` against each record, with what they wait on, and return a vector aligned with
  `records`: `true`, or `{check-name {:doc :returned :blocked}}`. Each fetch is called once for all the records. A
  check that did not run because one it waits on failed is named under that check's `:blocked`.

  A pure check that passed is remembered for that record, and not run again."
  [records names]
  (mapv finish (run-all records names)))

(defn check
  "[[check-all]] for one record."
  [record names]
  (first (check-all [record] names)))

(defn passed-checks
  "The names of the pure checks `record` is known to pass."
  [record]
  (let [{:keys [pure], :as plan} (plan-for record)
        mask                     (remembered-mask record plan)]
    (into #{} (comp (filter #(bit-test mask (:bit %))) (map :name)) pure)))

(defn assoc-field
  "`record` with `field` set to `v`. The checks that do not read `field` keep any pass remembered for `record`. The
  result is a draft: it is not parsed, even when `record` was."
  [record field v]
  (let [{:keys [fields field-mask record-class], :as plan} (plan-for record)]
    (when-not (contains? fields field)
      (throw (ex-info (str (.getSimpleName ^Class record-class) " has no field " field)
                      {:status-code 500, :record record-class, :field field})))
    (let [result (assoc record field v)
          mask   (bit-and-not (remembered-mask record plan) (long (get field-mask field 0)))]
      ;; a declaration may vary with a field: the result's plan may not be the one these bits were set under
      (when (and (not (zero? mask)) (identical? plan (plan-for result)))
        (.put passed result [plan mask]))
      result)))

(defn- status-code [{:keys [plan order]}]
  (let [c ((:checks-by-name plan) (first order))]
    (or (:status-code c) (if (:pure? c) 400 403))))

(defn parse-all
  "Run every check against each record, with each fetch called once for all of them. Returns `records`, now parsed, or
  throws once with every failure, by index. The status is that of the first failure of the first record that failed:
  its check's `:status-code`, or 400 for a pure check and 403 for an external one. Exceptions out of a check or fetch
  propagate, so an external check that throws, like `api/write-check`, stops the call at the first record it refuses."
  [records]
  (let [sts      (run-all records nil)
        results  (mapv finish sts)
        failures (into (sorted-map) (keep-indexed (fn [i r] (when-not (true? r) [i r]))) results)]
    (when (seq failures)
      (let [st (nth sts (key (first failures)))]
        (throw (ex-info (tru "Invalid {0}" (.getSimpleName ^Class (get-in st [:plan :record-class])))
                        {:status-code (status-code st)
                         :failures    failures}))))
    (doseq [r records]
      (.put issued r true))
    records))

(defn parse
  "Run every check of `record`, skipping pure checks already known to pass. Returns `record`, now parsed, or throws: the
  first failure's `:status-code`, or 400 when a pure check failed and 403 when an external one did. Exceptions out of
  a check or fetch propagate."
  [record]
  (let [st     (first (run-all [record] nil))
        result (finish st)]
    (when-not (true? result)
      (throw (ex-info (tru "Invalid {0}" (.getSimpleName (class record)))
                      {:status-code (status-code st)
                       :record      (class record)
                       :failures    result})))
    (.put issued record true)
    record))

(defn validated?
  "Whether `x` is a record of `record-class` that [[parse]] returned. For a check that a field holds another parsed
  record."
  [^Class record-class x]
  (and (instance? record-class x)
       (.containsKey issued x)))

(defn validated
  "`x`, which must be a record of `record-class` that [[parse]] returned. Throws a 500 otherwise. Hint the result with
  the record's class to read its fields with `.-`."
  [^Class record-class x]
  (when-not (validated? record-class x)
    ;; A programming error, not a permission failure: the checks ran or never did.
    (throw (ex-info (str "Expected a validated " (.getSimpleName record-class))
                    {:status-code 500
                     :expected    record-class
                     :got         (type x)})))
  x)
