(ns metabase-enterprise.semantic-layer-import.dbt.test-util.marts
  "Regenerates `enterprise/backend/test_resources/semantic_layer_import/dbt/flexanalytics_marts.edn`: the mart tables of
  https://github.com/flexanalytics/dbt-business-intelligence as a test dataset definition, in the format of
  `test/metabase/test/data/dataset_definitions/*.edn`, for the end-to-end test in
  [[metabase-enterprise.semantic-layer-import.dbt.e2e-test]]. Not something that runs regularly: only when the checkout
  changes.

  [[regenerate!]] copies the checkout to a scratch directory (see [[fixture/with-scratch-project]]), builds it there
  with `dbt seed` and `dbt run` against the Postgres in `:connection`, and reads back the four mart tables the
  project's semantic models are defined on: `fact_sales`, `dim_customer`, `dim_product` and `dim_order`. `dim_date` has
  no semantic model and no metric reaches it, so it is left out. The surrogate keys dbt computes become the tables'
  primary keys and `fact_sales`'s foreign keys, so a sync of the loaded dataset knows the joins the converter's
  implicit-join dimensions rely on. Rows are ordered by primary key, so a regeneration's diff is only what changed.
  Column base types are the ones the Postgres driver gives the same types during sync, so the driver has to be loaded,
  as it is in a dev REPL.

  Run from a REPL at the repo root, with a Postgres to build in. The connection defaults to the one the test suite
  uses for the `:postgres` driver (the `MB_POSTGRESQL_TEST_*` env vars, see
  [[metabase.test.data.interface/db-test-env-var]]), building in database `dbt_bi`, which has to exist. The password
  is a separate argument, see [[regenerate!]]:

    (metabase-enterprise.semantic-layer-import.dbt.test-util.marts/regenerate!)
    (metabase-enterprise.semantic-layer-import.dbt.test-util.marts/regenerate!
     {:connection {:port 15432, :user \"postgres\"}} \"password\")"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.dbt.test-util.fixture :as fixture]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.test.data.interface :as tx]
   ;; for the `#t` print-method of `LocalDate`, which the dataset EDN is written with
   [metabase.util.date-2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.secret :as u.secret]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.io File)
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private dataset-filename "enterprise/backend/test_resources/semantic_layer_import/dbt/flexanalytics_marts.edn")

(def ^:private package-name
  "The dbt project's `name`, which selects its own models and not those of the packages it installs."
  "dbt_business_intelligence")

(mr/def ::table
  "A mart table to dump: its name, its primary key column, and the dimension table each foreign key column joins to."
  [:map {:closed true}
   [:table :string]
   [:pk    :string]
   [:fks   {:optional true} [:map-of :string :string]]])

(def ^:private tables
  "The mart tables to dump, dimension tables first so the fact table's foreign keys have something to point at.
  `date_key` has no entry because `dim_date` is not dumped (see the namespace docstring)."
  [{:table "dim_customer", :pk "customer_key"}
   {:table "dim_product",  :pk "product_key"}
   {:table "dim_order",    :pk "order_key"}
   {:table "fact_sales",   :pk "fact_sales_key", :fks {"customer_key" "dim_customer"
                                                       "product_key"  "dim_product"
                                                       "order_key"    "dim_order"}}])

(mr/def ::connection-overrides
  "How to reach the Postgres to build the project in. Every key defaults to the test suite's `:postgres` connection.
  The password is not among them: it is a separate argument of [[regenerate!]]."
  [:map {:closed true}
   [:host   {:optional true} :string]
   [:port   {:optional true} :int]
   [:dbname {:optional true} :string]
   [:user   {:optional true} :string]])

(mr/def ::field-definition
  "A column of a mart table in the dataset definition format: its name, base type, and whether it is the primary key
  or a foreign key to another table."
  [:map {:closed true}
   [:field-name :string]
   [:base-type  :keyword]
   [:pk?        {:optional true} :boolean]
   [:fk         {:optional true} :keyword]])

(mr/def ::value
  "A cell of a mart table: dates are read back as `LocalDate`s, which print as the `#t` literals the dataset EDN
  takes; nothing else needs converting."
  [:maybe [:or :string :int :double (ms/InstanceOfClass LocalDate)]])

(mr/def ::row
  "One row of a mart table, its values in column order."
  [:sequential ::value])

(mr/def ::table-definition
  "A table in the dataset definition format: name, field definitions, rows."
  [:tuple :string [:sequential ::field-definition] [:sequential ::row]])

(mr/def ::data-source
  "The JDBC data source for the Postgres the project was built in."
  (ms/InstanceOfClass javax.sql.DataSource))

(mr/def ::options
  "What [[regenerate!]] takes: the checkout to build, where to write the dataset, how to reach Postgres, and whether to
  run `dbt deps` (see [[fixture/with-scratch-project]])."
  [:map {:closed true}
   [:project    {:optional true} :string]
   [:out        {:optional true} :string]
   [:connection {:optional true} ::connection-overrides]
   [:deps?      {:optional true} :boolean]])

(mu/defn- with-defaults :- ::fixture/connection
  "The connection to build in: `overrides` over the test suite's `:postgres` settings, with `password` wrapped as a
  [[metabase.util.secret/secret]] so that it prints redacted."
  [{:keys [host port dbname user]} :- ::connection-overrides
   password                        :- [:maybe :string]]
  {:host     (or host (tx/db-test-env-var :postgresql :host "localhost"))
   :port     (or port (parse-long (str (tx/db-test-env-var :postgresql :port 5432))))
   :dbname   (or dbname "dbt_bi")
   :user     (or user (tx/db-test-env-var :postgresql :user "postgres"))
   :password (some-> (or password (tx/db-test-env-var :postgresql :password)) u.secret/secret)})

(mr/def ::jdbc-spec
  "A next.jdbc db-spec for [[data-source]]: the connection with the password exposed, since next.jdbc turns every
  value into a string with `str`, which for a secret is its redaction."
  [:map {:closed true}
   [:dbtype   [:= "postgresql"]]
   [:host     :string]
   [:port     :int]
   [:user     :string]
   [:password {:optional true} :string]
   [:dbname   :string]])

(mu/defn- jdbc-spec :- ::jdbc-spec
  "The next.jdbc db-spec for `connection`, see [[::jdbc-spec]]. Not for printing."
  [{:keys [password] :as connection} :- ::fixture/connection]
  (cond-> (-> connection (dissoc :password) (assoc :dbtype "postgresql"))
    password (assoc :password (u.secret/expose password))))

(mu/defn- data-source :- ::data-source
  "A data source for the Postgres `connection` points at."
  [connection :- ::fixture/connection]
  (jdbc/get-datasource (jdbc-spec connection)))

(mu/defn- build! :- :nil
  "Build the checkout at `project` in a scratch copy against `connection`: `dbt seed`, then `dbt run` of the project's
  own models."
  [^File project :- (ms/InstanceOfClass File)
   connection    :- ::fixture/connection
   options       :- ::fixture/scratch-options]
  (fixture/with-scratch-project project connection options
    (fn [scratch profiles-dir]
      (fixture/dbt! scratch profiles-dir "seed")
      (fixture/dbt! scratch profiles-dir "run" "--select" (str "package:" package-name)))))

(mu/defn- field-definitions :- [:sequential ::field-definition]
  "The dataset field definitions for `table`, from the columns Postgres reports for it, in column order."
  [ds                     :- ::data-source
   {:keys [table pk fks]} :- ::table]
  (for [{column-name :column_name, udt-name :udt_name}
        (jdbc/execute! ds ["SELECT column_name, udt_name
                            FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = ?
                            ORDER BY ordinal_position"
                           table]
                       {:builder-fn jdbc.rs/as-unqualified-maps})
        :let [base-type (or (sql-jdbc.sync/database-type->base-type :postgres (keyword udt-name))
                            (throw (ex-info (format "the Postgres driver has no base type for type %s of %s.%s"
                                                    udt-name table column-name)
                                            {:table table, :column column-name, :udt udt-name})))
              fk        (get fks column-name)]]
    (cond-> {:field-name column-name, :base-type base-type}
      (= column-name pk) (assoc :pk? true)
      fk                 (assoc :fk (keyword fk)))))

(mu/defn- rows :- [:sequential ::row]
  "The rows of `table`, ordered by `pk`, as vectors of values in the order of `fields`, its field definitions."
  [ds                 :- ::data-source
   {:keys [table pk]} :- ::table
   fields             :- [:sequential ::field-definition]]
  (let [columns (map :field-name fields)
        sql     (format "SELECT %s FROM public.%s ORDER BY %s"
                        (str/join ", " (map #(str \" % \") columns))
                        table
                        (str \" pk \"))]
    (for [row (rest (jdbc/execute! ds [sql] {:builder-fn jdbc.rs/as-unqualified-arrays}))]
      (mapv (fn [v]
              (if (instance? java.sql.Date v)
                (.toLocalDate ^java.sql.Date v)
                v))
            row))))

(mu/defn- edn-field-definition :- :string
  [{:keys [field-name base-type pk? fk]} :- ::field-definition]
  (str "{:field-name " (pr-str field-name) ", :base-type " base-type
       (when pk? ", :pk? true")
       (when fk (str ", :fk " fk))
       "}"))

(mu/defn- edn-table-definition :- :string
  "One table of the dataset EDN, laid out like the checked-in dataset definitions: one field definition and one row
  per line."
  [[table-name fields table-rows] :- ::table-definition]
  (str "[" (pr-str table-name) "\n"
       "  [" (str/join "\n   " (map edn-field-definition fields)) "]\n"
       "  [" (str/join "\n   " (map (fn [row] (str "[" (str/join ", " (map pr-str row)) "]")) table-rows)) "]]"))

(mu/defn- edn-dataset :- :string
  [table-definitions :- [:sequential ::table-definition]]
  (str "[" (str/join "\n " (map edn-table-definition table-definitions)) "]\n"))

(mu/defn regenerate! :- :string
  "Regenerate the dataset (see the namespace docstring) from the checkout at `:project` (default
  `~/dbt-business-intelligence`), building it in `:connection` with `password` (default `MB_POSTGRESQL_TEST_PASSWORD`),
  and write it to `:out` (default the dataset file); `:deps? true` lets `dbt deps` run in the scratch copy (see
  [[fixture/with-scratch-project]]). Returns a one-line summary of what was written.

  The password is its own argument rather than a key of `:connection` so that a mistake in the options does not put it
  on the screen: a schema check that fails reports the whole value it was given."
  ([]
   (regenerate! {}))

  ([options :- ::options]
   (regenerate! options nil))

  ([{:keys [project out connection deps?]
     :or   {project (str (System/getProperty "user.home") "/dbt-business-intelligence")
            out     dataset-filename}} :- ::options
    password                           :- [:maybe :string]]
   (fixture/check-repo-root)
   (let [connection (with-defaults (or connection {}) password)]
     (build! (io/file project) connection {:deps? (boolean deps?)})
     (let [ds          (data-source connection)
           definitions (vec (for [table tables
                                  :let  [fields (vec (field-definitions ds table))]]
                              [(:table table) fields (vec (rows ds table fields))]))]
       (spit out (edn-dataset definitions))
       (format "wrote %s: %s" out (str/join ", " (for [[table-name _ table-rows] definitions]
                                                   (format "%s (%d rows)" table-name (count table-rows)))))))))
