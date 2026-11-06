(ns metabase-enterprise.transform-testing.subject
  "What a test run needs from the entity it tests, its subject: [[subject-plan]], one method per subject type."
  (:require
   [metabase-enterprise.transform-testing.compile :as transform-testing.compile]
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::subject-type
  "The kinds of entity a test can run."
  [:enum :transform])

(mr/def ::subject
  "An entity a test can run, of one of the [[::subject-type]]s."
  [:or ::transforms.schema/transform.definition])

(mr/def ::subject-plan
  "What a run needs from its subject: the database it runs on, its query compiled to SQL before any temp-table rewrite,
  the tables whose names expectation SQL may use for the output, the token expectation SQL may write for the output
  instead (nil when there is none), and how a message names the output."
  [:map {:closed true}
   [:database      ::lib.schema.metadata/database]
   [:compiled      ::transform-testing.compile/compiled-query]
   [:output-tables [:sequential ::transform-testing.schema/table]]
   [:output-token  [:maybe ::transform-testing.compile/output-token]]
   [:output-label  :string]])

(defmulti subject-plan
  "The [[::subject-plan]] of `subject`, a `subject-type`. Throws a typed refusal when `subject` cannot be tested."
  {:arglists '([subject-type subject])}
  (fn [subject-type _subject]
    subject-type))

(mu/defn testable-database :- ::lib.schema.metadata/database
  "The Database with `database-id`, if its driver can run a test. 404 when there is no such Database."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (api/check-404 (some-> database-id transform-testing.db/database-exists?))
  (let [database (driver.u/lib-database database-id)
        driver   (keyword (:engine database))]
    (when-not (driver.u/supports? driver :transforms/testing database)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unsupported-driver
              (tru "Tests cannot run on the {0} database." (name driver))
              {:driver driver})))
    database))
