(ns metabase-enterprise.data-testing.schema
  "The shapes a data test is written in, and the only gate they pass: each schema explains its own
  refusals, so a caller reads what to fix from the explanation rather than from a hand-written check."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn- unknown-dispatch :- fn?
  "An `:error/fn` for a `:multi` dispatching on `dispatch-key`: says what the value named and what the schema
  knows, where Malli would say only \"invalid dispatch value\"."
  [dispatch-key :- :keyword]
  (fn [{:keys [schema value]} _options]
    (let [known (str/join ", " (sort (map (comp name first) (mc/children schema))))]
      (if (map? value)
        (str "unknown " (name dispatch-key) " " (pr-str (get value dispatch-key)) ", must be one of: " known)
        (str "must be a map whose " (name dispatch-key) " is one of: " known)))))

(defn- rows-match-columns?
  "Whether every row of a `rows` value carries a value for each declared column and none besides, which is nothing to
  answer when no column is declared -- the columns have their own schema to fail."
  [{:keys [columns rows]}]
  (let [declared (into #{} (map :name) columns)]
    (or (empty? declared)
        (every? (fn [row] (and (map? row) (= declared (set (keys row))))) rows))))

(defn- rows-match-columns-message
  "What the first row that does not carry exactly its declared columns got wrong."
  [{{:keys [columns rows]} :value} _options]
  (let [declared (into #{} (map :name) columns)
        offender (first (remove (fn [row] (and (map? row) (= declared (set (keys row))))) rows))
        missing  (sort (remove (set (keys offender)) declared))
        extra    (sort (remove declared (keys offender)))]
    (str "every row must carry exactly the declared columns"
         (when (seq missing) (str "; missing " (str/join ", " (map pr-str missing))))
         (when (seq extra) (str "; not declared: " (str/join ", " (map pr-str extra)))))))

(mr/def ::table
  "A table read by the query under test, by schema and name."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:schema {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:name   ::lib.schema.common/non-blank-string]])

(mr/def ::column
  "A column of inline test data, with the type its cells are cast to.

  A cast target, which on some engines is not a type name the warehouse ever reports: MySQL takes
  `SIGNED` and reports `BIGINT`."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:name      ::lib.schema.common/non-blank-string]
   [:cast_type ::lib.schema.common/non-blank-string]])

(mr/def ::result-column
  "A column reported by a test run, with its database native type."
  [:map {:closed true}
   [:name          ::lib.schema.common/non-blank-string]
   [:database_type ::lib.schema.common/non-blank-string]])

(mr/def ::row
  "A row of inline test data, keyed by column name, with `:string` first so request decoding keeps every cell as sent."
  (ms/string-keyed-map [:maybe [:or :string :boolean number?]]))

(mr/def ::sql-data
  "Test data returned by a SQL query run against the Database of the query under test."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:format {:decode/normalize lib.schema.common/normalize-keyword} [:= :sql]]
   [:sql    ::lib.schema.common/non-blank-string]])

(mr/def ::rows-data
  "Test data written out in the request: the columns, with the type each is cast to, and the rows.

  A row's keys are the declared column names, exactly: the query reads each row by those names, so a key that names
  no column would be dropped and a column a row leaves out would become a null cell, neither of which the author
  asked for."
  [:and
   [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
    [:format  {:decode/normalize lib.schema.common/normalize-keyword} [:= :rows]]
    [:columns [:sequential {:min 1} ::column]]
    [:rows    [:sequential ::row]]]
   [:fn {:error/fn rows-match-columns-message} rows-match-columns?]])

(mr/def ::input
  "An input table of the query under test, replaced with test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)
           :error/fn         (unknown-dispatch :format)}
   [:sql  [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::sql-data]]
   [:rows [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::rows-data]]])

(mr/def ::inputs
  "Test data for the tables the query under test reads. Every table it reads needs one, and an input for
  a table it does not read is refused."
  [:sequential ::input])

(mr/def ::expectation.equals
  "A check that the output of the query under test holds exactly the expected rows, over exactly their columns."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)
           :error/fn         (unknown-dispatch :format)}
   [:sql  [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::sql-data]]
   [:rows [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::rows-data]]])

(mr/def ::expectation.empty
  "A check that a SQL query over the output of the query under test returns no rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :empty]]
   [:name ::lib.schema.common/non-blank-string]
   [:sql  ::lib.schema.common/non-blank-string]])

(mr/def ::expectation
  "A check on the output of the query under test."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)
           :error/fn         (unknown-dispatch :type)}
   [:equals ::expectation.equals]
   [:empty  ::expectation.empty]])

(mr/def ::expectations
  "The checks run against the output of the query under test. Names must be unique within a test,
  case-sensitively."
  [:and
   [:sequential ::expectation]
   [:fn {:error/message "expectation names must be unique within a test"}
    (fn [expectations]
      (let [names (map :name expectations)]
        (or (empty? names) (apply distinct? names))))]])

(defn- ->offset-date-time
  "`x` as an OffsetDateTime when it is one, an ISO-8601 date-time string with an offset, an Instant or a
  ZonedDateTime; otherwise `x` unchanged, for the schema to refuse."
  [x]
  (cond
    (string? x)            (try (t/offset-date-time x) (catch Exception _ x))
    (t/instant? x)         (t/offset-date-time x (t/zone-offset 0))
    (t/zoned-date-time? x) (t/offset-date-time x)
    :else                  x))

(def ^:private now-range
  "The first and last moments a MySQL app DB stores in a `TIMESTAMP` column, the narrowest range of the app DBs."
  [(t/instant "1970-01-01T00:00:01Z") (t/instant "2038-01-19T03:14:07Z")])

(defn- in-now-range?
  "Whether the moment `x` lies in [[now-range]]."
  [x]
  (let [[first-moment last-moment] now-range
        moment                     (t/instant x)]
    (not (or (t/before? moment first-moment) (t/after? moment last-moment)))))

(def ^:private now-offset-message
  "Why a `now` that names no moment is refused."
  (deferred-tru "must be an ISO-8601 date-time with an offset, such as 2026-10-13T00:00:00Z"))

(def ^:private now-range-message
  "Why a `now` outside [[now-range]] is refused."
  (let [[first-moment last-moment] (map str now-range)]
    (deferred-tru "must be from {0} to {1}, inclusive" first-moment last-moment)))

(def ^:private now-quotes-message
  "Why a serialized `now` that is not a string is refused, such as one YAML read as a date."
  (deferred-tru
   "must be a quoted string, such as \"2026-10-13T00:00:00Z\": YAML reads an unquoted date-time as a date"))

(defn- now-error
  "The message for the refused `now` `value`, after decoding: the range message for a moment, else the offset one."
  [{:keys [value]} _]
  ;; A string, so that a message printed with the error, as an import prints it, reads as text.
  (str (if (t/offset-date-time? value) now-range-message now-offset-message)))

(mr/def ::now
  "The moment the subject reads as the current time when a run compiles it: an ISO-8601 date-time with an offset, such
  as `2026-10-13T00:00:00Z`, that every app DB can store. SQL the test's author writes, in inputs and expectations,
  reads the database's own clock."
  ;; One check, so a refused value gets one message, the one for the reason it was refused.
  [:fn
   {:decode/normalize ->offset-date-time
    :json-schema      {:type "string" :format "date-time"}
    :description      (let [[first-moment last-moment] (map str now-range)]
                        (deferred-tru
                         "an ISO-8601 date-time with an offset, from {0} to {1}, inclusive"
                         first-moment last-moment))
    :error/fn         now-error}
   #(and (t/offset-date-time? %) (in-now-range? %))])

(mr/def ::now-string
  "A [[::now]] as serialization writes it: an ISO-8601 date-time string with an offset. YAML reads a date-time written
  without quotes as a `java.util.Date`, at UTC when it has no offset, so the offset can no longer be checked; such a
  value is refused, asking for quotes."
  ;; Each check passes what the other refuses, so a refused value gets one message.
  [:and
   {:json-schema {:type "string" :format "date-time"}}
   [:fn {:error/fn (fn [_ _] (str now-quotes-message))} string?]
   [:fn {:error/fn (fn [error opts] (now-error (update error :value ->offset-date-time) opts))}
    #(or (not (string? %)) (mr/validate ::now (->offset-date-time %)))]])

(def ^:private subject-keys-with-now
  "The subject keys of the test types that have `now`. The `segment_test` table has no `now` column."
  #{:card_id :transform_id})

(defn- with-now
  "`map-schema`, a closed map schema of a test of the subject under `subject-key`, with an optional `now` entry of
  schema `now-schema` when that test type has `now`."
  [map-schema subject-key now-schema]
  (cond-> map-schema
    (subject-keys-with-now subject-key) (conj [:now {:optional true} [:maybe now-schema]])))

(def ^:private definition
  "A test as a client writes it, without the subject it covers or its `now`."
  [:map {:closed true}
   [:name         ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       ::inputs]
   [:expectations ::expectations]])

(mr/def ::test.definition
  "A test as a client writes it, without the subject it covers. Without `now`, the subject reads the real clock."
  (conj definition [:now {:optional true} [:maybe ::now]]))

(defn- test-create
  "What a client sends to create a test: the id of its subject under `subject-key`, of schema `subject-id-schema`."
  [subject-key subject-id-schema]
  [:merge
   [:map {:closed true}
    [subject-key subject-id-schema]]
   (with-now definition subject-key ::now)])

(defn- saved-test
  "A saved test: the id of its subject under `subject-key`, of schema `subject-id-schema`, the subject itself when
  hydrated under `subject`, of schema `subject-schema`, the inputs that stand in for the tables the subject reads, the
  expectations checked against its output, and its `now` when its test type has one."
  [subject-key subject-id-schema subject subject-schema]
  (with-now [:map {:closed true}
             [:id           ms/PositiveInt]
             [:entity_id    {:optional true} :string]
             [:name         {:optional true} ::lib.schema.common/non-blank-string]
             [:description  {:optional true} [:maybe :string]]
             [:inputs       {:optional true} ::inputs]
             [:expectations {:optional true} ::expectations]
             [subject-key   {:optional true} subject-id-schema]
             [subject       {:optional true} [:maybe subject-schema]]
             [:creator_id   {:optional true} ::lib.schema.id/user]
             [:created_at   {:optional true} ms/TemporalInstant]
             [:updated_at   {:optional true} ms/TemporalInstant]]
    subject-key ::now))

(defn- test-update
  "What a client sends to update a test: any of its fields, with the id of its subject under `subject-key`, of schema
  `subject-id-schema`. Omitted fields are left unchanged."
  [subject-key subject-id-schema]
  (with-now [:map {:closed true}
             [subject-key   {:optional true} subject-id-schema]
             [:name         {:optional true} ::lib.schema.common/non-blank-string]
             [:description  {:optional true} [:maybe :string]]
             [:inputs       {:optional true} ::inputs]
             [:expectations {:optional true} ::expectations]]
    subject-key ::now))

(mr/def ::transform-test.create
  "What a client sends to create a transform test."
  (test-create :transform_id ::lib.schema.id/transform))

(mr/def ::transform-test
  "A saved transform test."
  (saved-test :transform_id ::lib.schema.id/transform :transform :metabase.transforms.schema/transform))

(mr/def ::transform-test.update
  "What a client sends to update a transform test. Omitted fields are left unchanged."
  (test-update :transform_id ::lib.schema.id/transform))

(mr/def ::card-test.create
  "What a client sends to create a card test."
  (test-create :card_id ::lib.schema.id/card))

(mr/def ::card-test
  "A saved card test."
  (saved-test :card_id ::lib.schema.id/card :card :metabase.queries.schema/card))

(mr/def ::card-test.update
  "What a client sends to update a card test. Omitted fields are left unchanged."
  (test-update :card_id ::lib.schema.id/card))

(mr/def ::segment-test.create
  "What a client sends to create a segment test."
  (test-create :segment_id ::lib.schema.id/segment))

(mr/def ::segment-test
  "A saved segment test."
  (saved-test :segment_id ::lib.schema.id/segment :segment :metabase.segments.schema/segment))

(mr/def ::segment-test.update
  "What a client sends to update a segment test. Omitted fields are left unchanged."
  (test-update :segment_id ::lib.schema.id/segment))

(mr/def ::saved-test
  "A saved test of any subject type."
  [:or ::transform-test ::card-test ::segment-test])

(mr/def ::run-status
  "The persisted lifecycle state of a test run."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword}
   :started :passed :failed :error :timeout])

(mr/def ::test-type
  "The kind of test a run ran. It selects the table that `test_id` points into."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword}
   :transform :card :segment])

(mr/def ::data-test-run
  "A persisted execution of a test of any type. Deleting the test through its model sets `:test_id` to nil. A delete
  that skips model hooks (raw SQL, a database cascade) leaves a `:test_id` that names no test; such a run is never
  listed or shown as `last_run`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:test_type      ::test-type]
   [:test_id        [:maybe ms/PositiveInt]]
   [:initiated_by   [:maybe ::lib.schema.id/user]]
   [:start_time     ms/TemporalInstant]
   [:end_time       [:maybe ms/TemporalInstant]]
   [:status         ::run-status]
   [:last_heartbeat ms/TemporalInstant]])

(mr/def ::stored-data-test-run
  "A DataTestRun row of any test type, including a type that this version does not know."
  [:merge
   ::data-test-run
   [:map {:closed true}
    [:test_type :keyword]]])

(mr/def ::user
  "The user who started a run."
  [:map {:closed true}
   [:id          ::lib.schema.id/user]
   [:email       :string]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]])

(mr/def ::data-test-run.response
  "A test run as the API returns it, with the user who started it."
  [:merge
   ::data-test-run
   [:map {:closed true}
    [:initiated_by_user [:maybe ::user]]]])

(mr/def ::data-test-runs.response
  "A page of test runs."
  [:map {:closed true}
   [:data   [:sequential ::data-test-run.response]]
   [:limit  pos-int?]
   [:offset :int]
   [:total  :int]])

(mr/def ::transform-test.response
  "A transform test as the read endpoints return it, with its newest run."
  [:merge
   ::transform-test
   [:map {:closed true}
    [:last_run [:maybe ::data-test-run]]]])

(mr/def ::card-test.response
  "A card test as the read endpoints return it, with its newest run."
  [:merge
   ::card-test
   [:map {:closed true}
    [:last_run [:maybe ::data-test-run]]]])

(mr/def ::segment-test.response
  "A segment test as the read endpoints return it, with its newest run."
  [:merge
   ::segment-test
   [:map {:closed true}
    [:last_run [:maybe ::data-test-run]]]])

(mr/def ::status
  "The outcome of a test run, or of one of its expectations.

  `:error` is an expectation outcome only: that expectation's own query could not be run, while
  the rest of the run completed and still reported."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :passed :failed :error])

(mr/def ::expectation-result.base
  "What every expectation result carries: which expectation this is, and how it came out.

  A `:status` of `error` means this one expectation could not be evaluated while the rest of the
  run still reported; `:error` then says why, and nothing else is reported for it."
  [:map {:closed true}
   [:name    :string]
   [:type    :keyword]
   [:status  ::status]
   [:columns {:optional true} [:sequential ::result-column]]
   [:error   {:optional true} [:map {:closed true}
                               [:type    :keyword]
                               [:message :string]]]])

(mr/def ::expectation-result
  "What one expectation found. Each type owns the schema of its own result, registered under the key
  named here."
  [:multi {:dispatch :type}
   [:equals :metabase-enterprise.data-testing.expectations.equals/result]
   [:empty  :metabase-enterprise.data-testing.expectations.empty/result]])

(mr/def ::run-result
  "The outcome of a test run.

  `:tables` maps each temp table the run created to the table it stood in for."
  [:map {:closed true}
   [:status       ::status]
   [:expectations [:sequential ::expectation-result]]
   [:tables       [:map-of :string :string]]])

(mr/def ::connection
  "A connection from `driver/do-with-test-connection`: a JDBC connection, or the BigQuery client and session that stand
  in for one."
  [:or
   (ms/InstanceOfClass java.sql.Connection)
   [:map {:closed true}
    [:client     (ms/InstanceOfClass Object)]
    [:session-id :string]]])

(defn- external-test
  "A saved test of schema `saved-test-schema` as serialization writes it, with references in place of ids: its subject
  under `subject-key`, and its `now` as an ISO-8601 string when its test type has one."
  [saved-test-schema subject-key]
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys saved-test-schema [:entity_id :name :description :inputs :expectations subject-key :creator_id]]
    (with-now [:map {:closed true}
               [:serdes/meta {:optional true} ::models.schema/external-meta]]
      subject-key ::now-string)]])

(mr/def ::external-transform-test
  "A TransformTest as serialization writes it, with references in place of ids."
  (external-test ::transform-test :transform_id))

(mr/def ::external-card-test
  "A CardTest as serialization writes it, with references in place of ids."
  (external-test ::card-test :card_id))

(mr/def ::external-segment-test
  "A SegmentTest as serialization writes it, with references in place of ids."
  (external-test ::segment-test :segment_id))
