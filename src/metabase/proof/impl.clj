(ns metabase.proof.impl
  "Proofs: unforgeable values that a proof-gated model's mutation functions take as their only argument.

  A proof is issued by an authorization check after it has verified one write (one operation on one subject with one
  change set) for the current user. The gated mutator calls [[verify]] and then writes exactly the subject and
  change set the proof carries, so a write cannot happen without its check having run, and what was validated is
  what is executed.

  Proofs come from three kinds of issuing check:

  - the per-user checks [[authorize-create]], [[authorize-update]] and [[authorize-delete]];
  - [[cascade]], for a parent's children;
  - the system issuers [[serdes-load]], [[provisioning]] and [[test-only]], for contexts in which no user is acting.
    Every call of one outside this namespace is flagged by the `:metabase/dangerously-issue-system-proof` lint; a call
    that acts on nobody's behalf is waved through at the site with an inline ignore and a comment saying why, and
    `.clj-kondo/ratchets.edn` budgets those ignores. They are the residual ambient authority.

  Everything here is exported through `metabase.proof.core`, the `proof` module's API namespace. This namespace
  requires only `metabase.api.common` and utilities, so any module that writes rows can use it without a load-order
  cycle.

  A proof cannot be built by hand, cannot arrive in a request, and cannot be stored: the constructor and class import
  are lint-forbidden outside this namespace (`:metabase/proof-constructor`), the value carries a private per-JVM nonce
  that [[verify]] checks, its `toString` is redacted, JSON encoding throws, and there is no reader and no Toucan
  transform. It is bound to the user it was issued for: [[verify]] refuses it under any other current user."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- The proof type -------------------------------------------------

(defonce ^:private nonce
  ;; A fresh object per JVM. Only code in this namespace can put it in a proof, so [[verify]] can tell a proof issued
  ;; here from any look-alike without trusting the value's shape.
  (Object.))

(deftype Proof [model operation subject changes user-id issuer nonce]
  Object
  (toString [_this]
    (str "<< PROOF " model " " operation " >>"))

  pretty/PrettyPrintable
  (pretty [this]
    (.toString this)))

(defmethod print-method Proof
  [^Proof proof ^java.io.Writer writer]
  (.write writer (str proof)))

(json/add-encoder Proof
                  (fn [_proof _json-generator]
                    (throw (ex-info "A proof cannot be JSON-encoded."
                                    {:status-code 500, :error :proof/not-encodable}))))

(defn proof?
  "Whether `x` is a proof issued in this JVM."
  [x]
  (and (instance? Proof x)
       (identical? (.-nonce ^Proof x) nonce)))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(mr/def ::operation
  [:enum :create :update :delete])

(mr/def ::id
  "The primary key of one row."
  [:or pos-int? :string])

(mr/def ::where
  "A Honey SQL where-clause naming a set of rows, the subject of a cascade proof."
  [:and vector? [:fn {:error/message "a Honey SQL clause, e.g. [:= :collection_id 1]"} (comp keyword? first)]])

(mr/def ::subject
  [:or ::id ::where])

(mr/def ::subject-kind
  [:enum :none :id :where])

(mr/def ::proof
  "Whatever a caller hands a verifier as its proof. Deliberately unconstrained here: [[verify]] and [[cascade]] check
  it themselves, refusing anything but a proof issued in this JVM with a diagnostic that names what they got, and that
  check runs in every environment, unlike schema validation."
  [:and {:description "a proof, checked by the verifier itself"} :any])

(mr/def ::changes
  "A row to insert or the change set of an update: the columns a write sets, keyed by column. Open by nature."
  [:map {:closed false, ::mr/deliberately-open true, :description "a row or change set, keyed by column"}])

(defn subject-kind
  "The kind of `subject`: `:none` for a create (no row exists yet), `:id` for one row by primary key, `:where` for the
  rows a where-clause names."
  [subject]
  (cond
    (nil? subject)    :none
    (vector? subject) :where
    :else             :id))

(defn- consistent-write?
  [{:keys [operation subject changes]}]
  (case operation
    :create (and (nil? subject) (or (map? changes) (and (sequential? changes) (every? map? changes))))
    :update (and (some? subject) (map? changes))
    :delete (and (some? subject) (nil? changes))))

(mr/def ::write
  "One write: the operation, the subject it applies to, and the change set (the row or rows to insert, the map of
  changes to apply, nothing for a delete)."
  [:and
   [:map {:closed true}
    [:model :keyword]
    [:operation ::operation]
    [:subject {:optional true} [:maybe ::subject]]
    [:changes {:optional true} [:maybe [:or ::changes [:sequential ::changes]]]]]
   [:fn {:error/message (str "a create has no subject and a row or rows of changes; an update has a subject and a map "
                             "of changes; a delete has a subject and no changes")}
    consistent-write?]])

(mr/def ::expectations
  "What a gated mutator asserts about the proof it was handed. `:model` is omitted by the model-parameterised
  mutators, which serve every model. `:columns` is the set of columns the mutator may write; a mutator named for one
  effect (setting an archived flag, say) declares them so its name is a contract the proof cannot exceed."
  [:map {:closed true}
   [:model {:optional true} :keyword]
   [:operation ::operation]
   [:subject-kind ::subject-kind]
   [:columns {:optional true} [:set {:min 1} :keyword]]])

;;; ---------------------------------------------------- Verifier ----------------------------------------------------

(defn- invalid-proof!
  "A proof of the wrong shape means code passed the wrong value: a programming error, not a permission failure. The
  details never include the proof itself."
  [message details]
  (throw (ex-info (str "Invalid proof: " message)
                  (merge {:status-code 500, :error :proof/invalid} details))))

(defn- ensure-proof!
  "`proof` as a `Proof`, or throw: it must be a proof issued in this JVM under the current user."
  ^Proof [proof]
  (when-not (proof? proof)
    (invalid-proof! "not a proof" {:actual (some-> proof class .getName)}))
  (let [^Proof proof proof]
    (when-not (= (.-user-id proof) api/*current-user-id*)
      (invalid-proof! "issued for another user" {:issued-for (.-user-id proof), :current-user api/*current-user-id*}))
    proof))

(defn- covered-write
  [^Proof proof]
  (cond-> {:model     (.-model proof)
           :operation (.-operation proof)}
    (some? (.-subject proof)) (assoc :subject (.-subject proof))
    (some? (.-changes proof)) (assoc :changes (.-changes proof))))

(mu/defn verify :- ::write
  "Check `proof` against what the calling mutator `expects` and return the write it covers, or throw a 500. Every
  gated mutator calls this first and writes only what it returns.

  `proof` must have been issued in this JVM for the current user; its operation and the kind of its subject must
  match `expects`, and so must its model when `expects` names one. When `expects` declares `:columns`, every row or
  change set the proof carries must write some of those columns and nothing else."
  [proof :- ::proof
   {:keys [model operation columns], expected-kind :subject-kind, :as expects} :- ::expectations]
  (let [proof (ensure-proof! proof)]
    (when (and model (not= model (.-model proof)))
      (invalid-proof! "for another model" {:expected expects, :actual (.-model proof)}))
    (when-not (= operation (.-operation proof))
      (invalid-proof! "for another operation" {:expected expects, :actual (.-operation proof)}))
    (let [actual-kind (subject-kind (.-subject proof))]
      (when-not (= expected-kind actual-kind)
        (invalid-proof! "for another kind of subject" {:expected expects, :actual actual-kind})))
    (when columns
      (doseq [changes (let [changes (.-changes proof)]
                        (if (map? changes) [changes] changes))
              :let    [written (set (keys changes))]]
        (when-not (and (seq written) (set/subset? written columns))
          (invalid-proof! "for other columns" {:expected expects, :actual written}))))
    (covered-write proof)))

;;; ----------------------------------------------- Per-user issuers -------------------------------------------------

(defn- issue
  [issuer {:keys [model operation subject changes]}]
  (->Proof model operation subject changes api/*current-user-id* issuer nonce))

(mu/defn authorize-create
  "Issuing check for creating a `model` row from `row`: the model's `can-create?` for the current user, refused with
  the 403 and audit event of [[metabase.api.common/create-check]]. Returns a proof covering exactly `row`."
  [model :- :keyword
   row   :- ::changes]
  (api/create-check model row)
  (issue `authorize-create {:model model, :operation :create, :changes row}))

(mu/defn authorize-update
  "Issuing check for applying `changes` to the `model` row with `id`: fetches the row (404 when it does not exist),
  then the model's `can-update?` with the changes for the current user, so a check that depends on the change (a
  move to another collection, say) runs here and nowhere else; refused with the 403 and audit event of
  [[metabase.api.common/update-check]]. Returns a proof covering exactly `changes` on that row."
  [model   :- :keyword
   id      :- ::id
   changes :- ::changes]
  (let [row (api/read-check model id)]
    (api/update-check row changes)
    (issue `authorize-update {:model model, :operation :update, :subject id, :changes changes})))

(mu/defn authorize-delete
  "Issuing check for deleting the `model` row with `id`: fetches the row (404 when it does not exist), then the model's
  `can-write?` for the current user, refused with the 403 and audit event of [[metabase.api.common/write-check]].
  Returns a proof covering that row's deletion."
  [model :- :keyword
   id    :- ::id]
  (api/write-check model id)
  (issue `authorize-delete {:model model, :operation :delete, :subject id}))

;;; ------------------------------------------------- Cascade proofs -------------------------------------------------

(defmulti cascade-parents
  "The models whose proof may be cascaded to rows of `model`, as a map of parent model to the key that ties a row of
  `model` to its parent: the column holding the parent's id, or `[:path column]` for a materialized-path column whose
  value names the row's ancestors as `/id/` segments. A module declares a model's cascade parents when it gates the
  model, e.g.

    (defmethod proof/cascade-parents :model/NativeQuerySnippet [_model] {:model/Collection :collection_id})
    (defmethod proof/cascade-parents :model/Collection [_model] {:model/Collection [:path :location]})

  The second form declares that a collection's proof covers its descendant collections. By default a model has no
  cascade parents, so nothing cascades to it."
  {:arglists '([model])}
  (fn [model] model))

(defmethod cascade-parents :default
  [_model]
  {})

(defn- path-key? [key]
  (and (vector? key) (= (first key) :path) (keyword? (second key))))

(defn- path-pattern-under?
  "Whether the SQL LIKE `pattern` names only rows under the row with `id` in a materialized path: it contains `/id/` as
  a segment. Ids are unique, so any path containing the segment descends from that row."
  [pattern id]
  (and (string? pattern) (str/includes? pattern (str "/" id "/"))))

(declare where-keyed-by?)

(defn- parent-rows-where?
  "Whether `where` names only the parent row with `id` of `parent-model`, or (when the model declares itself a cascade
  parent by a path) its descendants: `[:= :id id]`, a `:like` on the declared path column keyed by `id`, an `:and`
  with such a conjunct, or an `:or` of such clauses."
  [where parent-model id]
  (let [[op & args] where
        self-key    (get (cascade-parents parent-model) parent-model)]
    (case op
      :=    (= [:id id] (vec args))
      :like (boolean (and (path-key? self-key) (where-keyed-by? where self-key parent-model id)))
      :and  (boolean (some #(parent-rows-where? % parent-model id) args))
      :or   (boolean (and (seq args) (every? #(parent-rows-where? % parent-model id) args)))
      false)))

(defn- parent-rows-subquery?
  "Whether `x` is a subquery selecting the ids of the `parent-model` rows that [[parent-rows-where?]] accepts, and
  nothing else."
  [x parent-model id]
  (and (map? x)
       (= (set (keys x)) #{:select :from :where})
       (= (:select x) [:id])
       (= (:from x) [(t2/table-name parent-model)])
       (parent-rows-where? (:where x) parent-model id)))

(defn- where-keyed-by?
  "Whether `where` selects only rows of a child model tied by `cascade-key` (see [[cascade-parents]]) to the
  `parent-model` row with `id`, or to the rows that row's own proof covers: for a column key, `[:= column id]` or
  `[:in column subquery]` where the subquery selects the ids of the parent rows (see [[parent-rows-subquery?]]); for a
  path key, `[:like column pattern]` with `/id/` in the pattern; an `:and` with such a clause among its conjuncts; or
  an `:or` of such clauses."
  [where cascade-key parent-model id]
  (let [[op & args] where]
    (case op
      :=    (boolean (and (keyword? cascade-key) (= [cascade-key id] (vec args))))
      :in   (let [[column subquery] args]
              (boolean (and (keyword? cascade-key)
                            (= column cascade-key)
                            (parent-rows-subquery? subquery parent-model id))))
      :like (let [[column pattern] args]
              (boolean (and (path-key? cascade-key) (= column (second cascade-key)) (path-pattern-under? pattern id))))
      :and  (boolean (some #(where-keyed-by? % cascade-key parent-model id) args))
      :or   (boolean (and (seq args) (every? #(where-keyed-by? % cascade-key parent-model id) args)))
      false)))

(mu/defn cascade
  "Derive from `parent-proof` a proof over the rows of `child-model` that `where` names, applying `changes` to them, or
  deleting them when `changes` is nil. Refuses unless `child-model` declares the parent proof's model in
  [[cascade-parents]], the parent proof names one row by id, and `where` is keyed to that id as the declaration says
  (see [[where-keyed-by?]]): directly, by a materialized path, or through a subquery over the parent's table that is
  itself keyed to the id. The derived proof's subject is `where`."
  [parent-proof :- ::proof
   child-model  :- :keyword
   where        :- ::where
   changes      :- [:maybe ::changes]]
  (let [parent       (ensure-proof! parent-proof)
        parent-model (.-model parent)
        parent-id    (.-subject parent)
        cascade-key  (get (cascade-parents child-model) parent-model)]
    (when-not (= (subject-kind parent-id) :id)
      (invalid-proof! "only a proof for one row by id can be cascaded"
                      {:parent-model parent-model, :subject-kind (subject-kind parent-id)}))
    (when-not cascade-key
      (invalid-proof! (format "%s does not declare %s as a cascade parent" child-model parent-model)
                      {:child-model child-model, :parent-model parent-model}))
    (when-not (where-keyed-by? where cascade-key parent-model parent-id)
      (invalid-proof! (format "the where-clause is not keyed by %s to the parent's id" cascade-key)
                      {:child-model child-model, :parent-model parent-model, :column cascade-key}))
    (->Proof child-model
             (if (nil? changes) :delete :update)
             where
             changes
             (.-user-id parent)
             [:cascade (.-issuer parent)]
             nonce)))

;;; ------------------------------------------------- System issuers -------------------------------------------------

;;; Each system issuer serves one context in which no user is acting or no user has editorial right to the row. It
;;; cannot verify its context at runtime, so its policy is the `:metabase/dangerously-issue-system-proof` lint: every
;;; call outside this namespace is flagged, each waved through at its site with an inline ignore and a justifying
;;; comment, under a ratchet budget. The proof records which issuer made it.

(mu/defn serdes-load
  "System issuer for serialization load: the import endpoint, the `import` command, boot-time loading of audit
  content, and remote-sync pull. No user check applies because the content was authorized where it was exported and
  the load runs either as an admin or with no user at all (command line, boot, background pull); running each
  model's permission predicates per entity would be meaningless there."
  [write :- ::write]
  (issue `serdes-load write))

(mu/defn provisioning
  "System issuer for the collections the application provisions rather than a user creates: a User's Personal
  Collection when the User is created (or on first use, for Users who predate personal collections), the Library
  collections, and a data app's resource collection. No user check applies because no user has editorial right over
  them; they are created for their owner or for the system, with a fixed shape, and deleted with it."
  [write :- ::write]
  (issue `provisioning write))

(mu/defn test-only
  "System issuer for tests that set up or exercise state without going through an endpoint. No user check applies
  because the caller is a test."
  [write :- ::write]
  (issue `test-only write))
