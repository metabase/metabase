(ns metabase.measures.commands
  "The commands that change a Measure, and the one door they go through.

  A command is one mutation, as a value: [[CreateMeasure]] carries what a create needs and nothing else, so it has
  no id to be wrong about, and [[UpdateMeasure]] carries a `:changes` map, so a field left alone stays
  distinguishable from one set to nil. Each command declares its own validity rules as a
  [[metabase.util.validated/Validatable]], and performs one purpose: `::creating`, `::updating`.

  [[mutate!]] is the only way either reaches the app DB. It asserts the context's purpose is the one the command
  performs, runs the command's checks, and then -- and only then -- calls the command's own `apply!`. The checks
  are therefore not something an `apply!` body can forget: the body never sees a command that has not been checked,
  because the implementer does not write the call that gets there.

  The context is the one privileged value. [[request-context]] is the only sanctioned way to build one, and it is
  where the ambient request state -- who is asking -- becomes an explicit parameter of the question. A check never
  reads it: everything beyond the command itself reaches a check through a fetch, and the fetches here read the
  actor from the context rather than from `metabase.api.common`'s dynamic vars."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.measures.db :as measures.db]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.validated :as v]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- the context ----------------------------------------------------

(defn request-context
  "A context for `purpose`, carrying who is asking and what the clock says.

  The one sanctioned way to build a context a command is checked in, so that reading the ambient request state
  happens in exactly one place. Every check's fetches read the actor from here, which is why `(assoc ctx :actor
  ...)` elsewhere is not a thing this module does: a context is built at the request boundary, from the request."
  [purpose]
  {:purpose purpose
   :actor   {:id                     api/*current-user-id*
             :superuser?             api/*is-superuser?*
             ;; the data-analyst capability keys off the `advanced-permissions` feature, which is a world read, so
             ;; it is resolved once here rather than per check
             :entitled-data-analyst? (api/entitled-data-analyst?)}
   ;; no check here reads the clock yet; it belongs in the context because a clock is a parameter of the question
   ;; like the actor is, and a check that read one directly would have its stale answer remembered
   :now     (t/offset-date-time)})

;;; ------------------------------------------------- shared rules ---------------------------------------------------

(def ^:private updatable-keys
  "The columns an update may change. The same keys [[metabase.measures.db/update-measure!]] accepts."
  #{:name :description :archived :definition})

(defn- non-blank? [s]
  (boolean (and (string? s) (not (str/blank? s)))))

(defn- normalized-definition?
  "Whether `definition` is what [[metabase.lib-be.core/normalize-query]] answers: an MBQL 5 query, or the empty map
  it answers for an empty one. A record built by hand around legacy MBQL, a bare fragment, or something that is no
  query at all fails here, and the report says so rather than the measure being stored half-converted."
  [definition]
  (boolean (or (and (map? definition) (empty? definition))
               (= :mbql-version/mbql5 (u/ignore-exceptions (lib/normalized-mbql-version definition))))))

(defn- definition-table-id
  "The id of the source table `definition` names, or nil."
  [definition]
  (when (seq definition)
    (u/ignore-exceptions (lib/primary-source-table-id definition))))

(defn- changes-definition?
  "Whether an [[UpdateMeasure]] sets the definition. `:changes` distinguishes absent from nil, so this is the key's
  presence rather than its value: setting the definition to nil is a change, and not one a measure survives."
  [{:keys [changes]}]
  (contains? changes :definition))

(defn- new-definition
  "The definition an [[UpdateMeasure]] sets. Only meaningful under [[changes-definition?]]."
  [{:keys [changes]}]
  (:definition changes))

(defn- may-author-on-table?
  "Whether `actor` may create or edit a Measure on the Table with `table-id`: the rule
  `metabase.models.interface/can-write?` and `can-create?` apply to a Measure, asked of an explicit actor instead of
  `metabase.api.common`'s dynamic vars. False when the table is not there.

  Keep this in step with those two methods -- the better fix is an arity on them taking a user id, at which point
  this becomes a call to it."
  [actor table-id]
  (boolean
   (when-let [table (and table-id (measures.db/table table-id))]
     (and (or (:superuser? actor)
              (and (:entitled-data-analyst? actor)
                   (perms/user-has-permission-for-table? (:id actor)
                                                         :perms/view-data
                                                         :unrestricted
                                                         (:db_id table)
                                                         (u/the-id table))))
          (remote-sync/table-editable? table)))))

(defn- table-perms-fetch
  "A fetch answering, for each table id `table-id-fn` reads off a command, whether the context's actor may author a
  Measure on it. `:after` is what makes sure the id it reads is one a check has already passed."
  [table-id-fn after]
  {:doc   "whether the actor may author a Measure on the table a command's definition names"
   :after after
   :key   table-id-fn
   :f     (fn [table-ids ctx]
            (let [actor (:actor ctx)]
              (into {} (map (juxt identity #(may-author-on-table? actor %))) (remove nil? table-ids))))})

;;; --------------------------------------------------- commands -----------------------------------------------------

(defprotocol Command
  "What every measures command is: one mutation, with the purpose it performs and the write that performs it."
  (command-purpose [command]
    "The purpose this command performs. [[mutate!]] refuses a context asking for any other, and checks the command
    for this one.")
  (apply! [command ctx]
    "Write this command to the app DB, and return what was written. Called by [[mutate!]] only, over a command
    [[metabase.util.validated/check!]] has passed, so a body here is the query and nothing else."))

(defrecord CreateMeasure [measure-name description definition]
  Command
  (command-purpose [_] ::creating)
  (apply! [_ ctx]
    (measures.db/insert-measure! (-> ctx :actor :id) measure-name description definition))

  v/Validatable
  (checks [_]
    {::name-not-blank
     {:doc "\"name\" cannot be blank: pass a short descriptive name for the measure."
      :f   (fn [{:keys [measure-name]} _fetched] (non-blank? measure-name))}

     ::definition-normalized
     {:doc "\"definition\" must be a normalized MBQL 5 query."
      :f   (fn [{:keys [definition]} _fetched] (normalized-definition? definition))}

     ::definition-names-a-table
     {:doc   "\"definition\" must name a source table."
      ;; nothing asks an unnormalized definition what table it names
      :after #{::definition-normalized}
      :f     (fn [{:keys [definition]} _fetched] (some? (definition-table-id definition)))}

     ::may-create-on-table
     {:doc         "You must have permission to create a measure on the table \"definition\" names."
      :fetches     #{::table-perms}
      :status-code 403
      :f           (fn [_command fetched] (true? (::table-perms fetched)))}})
  (purposes [_]
    {::v/intrinsic #{::name-not-blank ::definition-normalized ::definition-names-a-table}
     ::creating    #{::may-create-on-table}})

  v/ExternallyValidatable
  (fetches [_]
    {::table-perms (table-perms-fetch (comp definition-table-id :definition)
                                      #{::definition-names-a-table})}))

(defrecord UpdateMeasure [measure-id changes revision-message]
  Command
  (command-purpose [_] ::updating)
  (apply! [_ _ctx]
    (measures.db/update-measure! measure-id changes))

  v/Validatable
  (checks [_]
    {::id
     {:doc "\"id\" must be the positive numeric id of a measure."
      :f   (fn [{:keys [measure-id]} _fetched] (pos-int? measure-id))}

     ::changes-non-empty
     {:doc "An update must change something: pass at least one of \"name\", \"description\", \"archived\" or \"definition\"."
      :f   (fn [{:keys [changes]} _fetched] (boolean (seq changes)))}

     ::changes-keys
     {:doc "An update can only change \"name\", \"description\", \"archived\" and \"definition\"."
      :f   (fn [{:keys [changes]} _fetched]
             (and (map? changes) (every? updatable-keys (keys changes))))}

     ;; same name and same words as the rule on CreateMeasure, so a caller is told the same thing whichever way it
     ;; authors -- and so there is no path to a measure with a blank name
     ::name-not-blank
     {:doc "\"name\" cannot be blank: pass a short descriptive name for the measure."
      :f   (fn [{:keys [changes]} _fetched]
             (or (not (contains? changes :name))
                 (non-blank? (:name changes))))}

     ::revision-message-not-blank
     {:doc "\"revision_message\" is required: a short sentence describing the change, recorded in the measure's revision history."
      :f   (fn [{:keys [revision-message]} _fetched] (non-blank? revision-message))}

     ::definition-normalized
     {:doc "A changed \"definition\" must be a normalized MBQL 5 query."
      :f   (fn [command _fetched]
             (or (not (changes-definition? command))
                 (normalized-definition? (new-definition command))))}

     ::definition-names-a-table
     {:doc   "A changed \"definition\" must name a source table."
      :after #{::definition-normalized}
      :f     (fn [command _fetched]
               (or (not (changes-definition? command))
                   (some? (definition-table-id (new-definition command)))))}

     ::measure-exists
     {:doc         "There must be a measure with this id."
      :fetches     #{::stored-measure}
      :status-code 404
      :f           (fn [_command fetched] (some? (::stored-measure fetched)))}

     ::may-write
     {:doc         "You must have permission to edit this measure."
      :after       #{::measure-exists}
      :fetches     #{::stored-measure}
      :status-code 403
      :f           (fn [_command fetched] (true? (:may-write? (::stored-measure fetched))))}

     ::may-create-on-new-table
     {:doc         "You must have permission to create a measure on the table a changed \"definition\" moves it to."
      ;; only asked of a measure that is there, and of a definition already known to name a table
      :after       #{::measure-exists ::definition-names-a-table}
      :fetches     #{::stored-measure ::table-perms}
      :status-code 403
      :f           (fn [command fetched]
                     (let [new-table-id (when (changes-definition? command)
                                          (definition-table-id (new-definition command)))]
                       (or (nil? new-table-id)
                           (= new-table-id (:table_id (:measure (::stored-measure fetched))))
                           (true? (::table-perms fetched)))))}})

  (purposes [_]
    {::v/intrinsic #{::id ::changes-non-empty ::changes-keys ::name-not-blank ::revision-message-not-blank
                     ::definition-normalized ::definition-names-a-table}
     ::updating    #{::may-write ::may-create-on-new-table}})

  v/ExternallyValidatable
  (fetches [_]
    {::stored-measure
     {:doc   "the Measure as stored, and whether the actor may edit it -- one read, because the permission answer is
             about the very row that read returns"
      :after #{::id}
      :key   :measure-id
      :f     (fn [ids ctx]
               (let [actor (:actor ctx)]
                 (into {}
                       (map (fn [measure]
                              [(:id measure) {:measure    measure
                                              :may-write? (may-author-on-table? actor (:table_id measure))}]))
                       (measures.db/measures ids))))}

     ::table-perms (table-perms-fetch (comp definition-table-id new-definition)
                                      #{::definition-names-a-table})}))

;;; --------------------------------------------------- factories ----------------------------------------------------

(defn create-measure
  "A [[CreateMeasure]] with its definition normalized to MBQL 5.

  Normalizing here rather than at a caller is what makes one rule out of two: the REST endpoint's schema decodes
  legacy MBQL, MCP's `measure_write` arrives undecoded, and `::definition-normalized` still holds of whatever this
  built -- so a record assembled by hand cannot slip an unconverted definition past the checks."
  [measure-name description definition]
  (->CreateMeasure measure-name description (lib-be/normalize-query definition)))

(defn update-measure
  "An [[UpdateMeasure]] applying `changes` to the Measure with `measure-id`, with a changed definition normalized to
  MBQL 5 for the reason [[create-measure]] gives."
  [measure-id changes revision-message]
  (->UpdateMeasure measure-id
                   (cond-> changes
                     (some? (:definition changes)) (update :definition lib-be/normalize-query))
                   revision-message))

;;; ----------------------------------------------------- door -------------------------------------------------------

(defn- assert-purpose!
  [ctx command]
  (let [performs (command-purpose command)]
    (when-not (= performs (:purpose ctx))
      (throw (ex-info (tru "This is not a {0} context" (name performs))
                      {:error       ::wrong-purpose
                       :status-code 500
                       :type        (class command)
                       :performs    performs
                       :purpose     (:purpose ctx)})))))

(defn mutate!
  "Apply `command` to the app DB, in `ctx`, and return what was written.

  The only way a command reaches the app DB. `ctx` must be a context for the purpose the command performs, and the
  command must pass [[metabase.util.validated/check!]] for it; otherwise this throws and nothing is written."
  [ctx command]
  (assert-purpose! ctx command)
  (apply! (v/check! command ctx) ctx))
