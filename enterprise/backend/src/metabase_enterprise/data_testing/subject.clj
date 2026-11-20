(ns metabase-enterprise.data-testing.subject
  "What a test run needs from the entity it tests, its subject: [[subject-plan]], one method per subject type."
  (:require
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.segments.schema :as segments.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::subject-type
  "The kinds of entity a test can run."
  [:enum :transform :card :segment])

(mr/def ::card
  "A saved Card a test can run, with its MBQL 5 query."
  [:merge
   ::queries.schema/card
   [:map {:closed true}
    [:id            ::lib.schema.id/card]
    [:name          :string]
    [:dataset_query ::lib.schema/query]]])

(mr/def ::segment
  "A saved Segment a test can run, with its MBQL 5 definition."
  [:merge
   ::segments.schema/segment
   [:map {:closed true}
    [:name       :string]
    [:definition ::lib.schema/query]]])

(mr/def ::subject
  "An entity a test can run, of one of the [[::subject-type]]s."
  [:or ::transforms.schema/transform ::card ::segment])

(mr/def ::subject-plan
  "What a run needs from its subject: the database it runs on, its query compiled to SQL before any temp-table rewrite,
  whether that SQL includes SQL written by hand, the tables whose names expectation SQL may use for the output, the token
  expectation SQL may write for the output instead (nil when there is none), and how a message names the output."
  [:map {:closed true}
   [:database      ::lib.schema.metadata/database]
   [:compiled      ::data-testing.compile/compiled-query]
   [:native?       :boolean]
   [:output-tables [:sequential ::data-testing.compile/output-table]]
   [:output-token  [:maybe ::data-testing.compile/output-token]]
   [:output-label  :string]])

(mr/def ::compiled-subject
  "A subject's query compiled to SQL, and whether that SQL includes SQL written by hand."
  [:map {:closed true}
   [:compiled ::data-testing.compile/compiled-query]
   [:native?  :boolean]])

(defmulti subject-plan
  "The [[::subject-plan]] of `subject`, a `subject-type`, for a test with `inputs`. Throws a typed refusal when
  `subject` cannot be tested."
  {:arglists '([subject-type subject inputs])}
  (fn [subject-type _subject _inputs]
    subject-type))

(def output-token
  "The token that expectation SQL writes for the output of a subject that has no table of its own."
  "{{output}}")

(defn compile-failure-message
  "The message of the refusal of a query under test whose compile threw `e`."
  [e]
  (tru "The query under test could not be compiled to SQL: {0}" (ex-message e)))

(mu/defn compile-preprocessed :- ::compiled-subject
  "`preprocessed`, a preprocessed query, compiled to SQL, and whether that SQL includes SQL written by hand: a native
  stage of the query, or of a card it reads."
  [preprocessed :- ::lib.schema/query]
  (let [{:keys [query params]} (qp.compile/compile-preprocessed preprocessed)]
    {:compiled {:query query :params params}
     :native?  (lib/any-native-stage? preprocessed)}))

(mu/defn compile-query :- ::compiled-subject
  "`query` compiled to SQL as a test runs it, and whether that SQL includes SQL written by hand. Throws
  `::data-testing.errors/uncompilable-subject` with the message `(failure-message e)`, [[compile-failure-message]] by
  default, when compiling throws `e`."
  ([query :- ::lib.schema/query]
   (compile-query query compile-failure-message))
  ([query           :- ::lib.schema/query
    failure-message :- ifn?]
   (try
     ;; The same preparation a transform's query gets: remaps would add joins to tables the test does not declare, and
     ;; the default row limit would cut the result set. A persisted model in the query stays its query: its cache
     ;; table is not a table the test can declare, and the test is of the query.
     (model-persistence/with-persisted-substituion-disabled
       (compile-preprocessed (qp.preprocess/preprocess (transforms-base.u/massage-sql-query query))))
     (catch Exception e
       (throw (data-testing.errors/ex ::data-testing.errors/uncompilable-subject (failure-message e) {} e))))))

(mu/defn query-output-plan :- ::subject-plan
  "The plan of the subject named `label` in messages, whose output is the result of its query, compiled as
  [[compile-query]] returns it, run on `database`. Expectation SQL names that result `{{output}}`."
  [database                  :- ::lib.schema.metadata/database
   {:keys [compiled native?]} :- ::compiled-subject
   label                     :- :string]
  {:database      database
   :compiled      compiled
   :native?       native?
   ;; The output is not a table in the database, so expectation SQL names it by the token, which
   ;; [[data-testing.compile/replace-tables]] turns into this reserved name.
   :output-tables [{:schema nil :name data-testing.compile/output-name}]
   :output-token  output-token
   :output-label  label})

(mu/defn testable-database :- ::lib.schema.metadata/database
  "The Database with `database-id`, if its driver can run a test. 404 when there is no such Database."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (api/check-404 (some-> database-id data-testing.db/database-exists?))
  (let [database (driver.u/lib-database database-id)
        driver   (keyword (:engine database))]
    (when-not (driver.u/supports? driver :transforms/testing database)
      (throw (data-testing.errors/ex
              ::data-testing.errors/unsupported-driver
              (tru "This database ({0}) does not support tests." (name driver))
              {:driver driver})))
    database))
