(ns metabase.measures.commands
  "The commands that change a Measure, and the one door they go through.

  A command is one mutation as a value, declaring its own validity rules as a
  [[metabase.util.validated/Validatable]] and performing one purpose: [[CreateMeasure]] performs `::creating`,
  [[UpdateMeasure]] performs `::updating`.

  [[mutate!]] is the only way a command reaches the app DB. It refuses a context whose `:purpose` is not the one
  the command performs, runs the command's checks for that purpose, and then calls the command's `apply!`; nothing
  is written if either step fails. [[request-context]] is the only sanctioned way to build the context it takes,
  and `metabase.measures.db`'s two editorial writers, like `apply!` itself, are `:discouraged-var`s so that this
  is the only route to them."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.db :as measures.db]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.validated :as v]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- the context ----------------------------------------------------

(mr/def ::context
  "What a measures command is checked in: the `:purpose` being asked about, the `:actor` asking, and the `:now` it
  is asked at. A `nil` `:purpose` is a well-formed context that [[mutate!]] refuses."
  [:map {:closed true}
   [:purpose [:maybe :keyword]]
   [:actor   [:map {:closed true}
              [:id                     [:maybe ::lib.schema.id/user]]
              [:superuser?             :boolean]
              [:entitled-data-analyst? :boolean]]]
   [:now     ms/TemporalInstant]])

(mu/defn request-context :- ::context
  "A context for `purpose`, carrying the actor asking and the clock.

  The only sanctioned way to build one: building a context anywhere else is a `:discouraged-var` warning. Reads
  `metabase.api.common`'s current-user dynamic vars, so it must be called where a request has bound them."
  [purpose :- [:maybe :keyword]]
  {:purpose purpose
   :actor   {:id         api/*current-user-id*
             :superuser? api/*is-superuser?*
             ;; resolved here rather than per check: it reads the `advanced-permissions` feature as well as the
             ;; actor's group membership, and every check that needs it needs the same answer
             :entitled-data-analyst? (api/entitled-data-analyst?)}
   :now     (t/offset-date-time)})

;;; ------------------------------------------------- shared rules ---------------------------------------------------

(def ^:private updatable-keys
  "The columns an update may change. The same keys [[metabase.measures.db/update-measure!]] accepts."
  #{:name :description :archived :definition})

(def ^:private name-doc
  "The `::name-not-blank` rule, in the one wording both commands report it with."
  "\"name\" cannot be blank: pass a short descriptive name for the measure.")

(defn- non-blank? [s]
  (boolean (and (string? s) (not (str/blank? s)))))

(defn- normalized-definition?
  "Whether `definition` is what [[metabase.lib-be.core/normalize-query]] answers: an MBQL 5 query, or the empty map
  it answers for an empty one. False for legacy MBQL, a bare fragment, or anything that is no query at all."
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
  "Whether `actor` may create or edit a Measure on the Table with `table-id`. False when there is no such table.

  The same rule `mi/can-write?` and `mi/can-create?` apply to a `:model/Measure`, over an explicit actor rather
  than `metabase.api.common`'s dynamic vars; the two are written twice until those methods take a user id."
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
  Measure on it. `after` names the checks over that id, so it is never read off a definition they rejected."
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
    "Write this command to the app DB, and return what was written. A `:discouraged-var`: [[mutate!]] is what
    calls it, over a command that has passed [[metabase.util.validated/check!]]."))

(defrecord CreateMeasure [measure-name description definition]
  Command
  (command-purpose [_] ::creating)
  (apply! [_ ctx]
    (measures.db/insert-measure! (-> ctx :actor :id) measure-name description definition))

  v/Validatable
  (checks [_]
    {::name-not-blank
     {:doc name-doc
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
     {:doc (str "An update must change something: pass at least one of \"name\", \"description\", \"archived\""
                " or \"definition\".")
      :f   (fn [{:keys [changes]} _fetched] (boolean (seq changes)))}
     ::changes-keys
     {:doc "An update can only change \"name\", \"description\", \"archived\" and \"definition\"."
      :f   (fn [{:keys [changes]} _fetched]
             (and (map? changes) (every? updatable-keys (keys changes))))}
     ;; the same rule under the same name as on CreateMeasure, so there is no path to a blank-named measure
     ::name-not-blank
     {:doc name-doc
      :f   (fn [{:keys [changes]} _fetched]
             (or (not (contains? changes :name))
                 (non-blank? (:name changes))))}
     ::revision-message-not-blank
     {:doc (str "\"revision_message\" is required: a short sentence describing the change, recorded in the"
                " measure's revision history.")
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
  "A [[CreateMeasure]] with `definition` normalized by [[metabase.lib-be.core/normalize-query]], whatever dialect it
  arrived in. Takes no schemas: a malformed argument is `::name-not-blank`'s or `::definition-normalized`'s to
  report, not this function's to throw."
  [measure-name description definition]
  (->CreateMeasure measure-name description (lib-be/normalize-query definition)))

(defn update-measure
  "An [[UpdateMeasure]] applying `changes` to the Measure with `measure-id`, with a changed `:definition`
  normalized as [[create-measure]] normalizes one. Takes no schemas, for the same reason."
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
      (throw (ex-info (tru "Not a context for {0}" (name performs))
                      {:error       ::wrong-purpose
                       :status-code 500
                       :type        (class command)
                       :performs    performs
                       :purpose     (:purpose ctx)})))))

(mu/defn mutate!
  "Apply `command` to the app DB, in `ctx`, and return what was written.

  Throws, writing nothing, when `(:purpose ctx)` is not the purpose `command` performs (a `::wrong-purpose` 500),
  or when `command` fails [[metabase.util.validated/check!]] for it (a `::v/check-failed` 4xx carrying the report)."
  [ctx     :- ::context
   command :- [:fn {:error/message "a measures command"} #(satisfies? Command %)]]
  (assert-purpose! ctx command)
  (apply! (v/check! command ctx) ctx))
