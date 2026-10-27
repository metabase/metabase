(ns dev.dbt-import.marts
  "Regenerates `dev/resources/dbt_import/flexanalytics_marts.edn`: the mart tables of
  https://github.com/flexanalytics/dbt-business-intelligence as a test dataset definition, in the format of
  `test/metabase/test/data/dataset_definitions/*.edn`, for the end-to-end test in `dev.dbt-import.e2e-test`. Not
  something that runs regularly: only when the checkout changes.

  [[regenerate!]] copies the checkout to a scratch directory the way [[dev.dbt-import.fixture/regenerate!]] does,
  builds it there with `dbt seed` and `dbt run` against the Postgres in `:connection`, and reads back the four mart
  tables the project's semantic models are defined on: `fact_sales`, `dim_customer`, `dim_product` and `dim_order`.
  `dim_date` has no semantic model and no metric reaches it, so it is left out. The surrogate keys dbt computes become
  the tables' primary keys and `fact_sales`'s foreign keys, so a sync of the loaded dataset knows the joins the
  converter's implicit-join dimensions rely on. Rows are ordered by primary key, so a regeneration's diff is only what
  changed.

  Run from a REPL at the repo root, with a Postgres to build in. The connection defaults to the one the test suite
  uses for the `:postgres` driver (the `MB_POSTGRESQL_TEST_*` env vars), building in database `dbt_bi`, which has to
  exist:

    (dev.dbt-import.marts/regenerate!)
    (dev.dbt-import.marts/regenerate! {:connection {:port 15432, :user \"postgres\", :password \"password\"}})"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.dbt-import.fixture :as fixture]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private dataset-filename "dev/resources/dbt_import/flexanalytics_marts.edn")

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

(def ^:private udt->base-type
  "The Metabase base type for each Postgres type (`information_schema.columns.udt_name`) the marts use. Anything else
  is an error, so a change to the project's column types is noticed."
  {"text"   :type/Text
   "int4"   :type/Integer
   "int8"   :type/BigInteger
   "float8" :type/Float
   "date"   :type/Date})

(mr/def ::connection
  "How to reach the Postgres to build the project in. Every key defaults to the test suite's `:postgres` connection."
  [:map {:closed true}
   [:host     {:optional true} :string]
   [:port     {:optional true} :int]
   [:dbname   {:optional true} :string]
   [:user     {:optional true} :string]
   [:password {:optional true} [:maybe :string]]])

(mr/def ::field-definition
  [:map {:closed true}
   [:field-name :string]
   [:base-type  :keyword]
   [:pk?        {:optional true} :boolean]
   [:fk         {:optional true} :keyword]])

(mr/def ::value
  "A cell of a mart table: dates are read back as `LocalDate`s, nothing else needs converting."
  [:maybe [:or :string :int :double (ms/InstanceOfClass LocalDate)]])

(mr/def ::row
  [:sequential ::value])

(mr/def ::table-definition
  "A table in the dataset definition format: name, field definitions, rows."
  [:tuple :string [:sequential ::field-definition] [:sequential ::row]])

(def ^:private DataSource
  (ms/InstanceOfClass javax.sql.DataSource))

(mu/defn- with-defaults :- ::connection
  [{:keys [host port dbname user password]} :- ::connection]
  (let [env (fn [k default] (or (System/getenv (str "MB_POSTGRESQL_TEST_" k)) default))]
    {:host     (or host (env "HOST" "localhost"))
     :port     (or port (parse-long (env "PORT" "5432")))
     :dbname   (or dbname "dbt_bi")
     :user     (or user (env "USER" "postgres"))
     :password (or password (env "PASSWORD" nil))}))

(mu/defn- profiles-yaml :- :string
  "A `profiles.yml` for the project pointing dbt at `connection`, building in schema `public` like the README's."
  [{:keys [host port dbname user password]} :- ::connection]
  (str/join "\n" ["dbt_business_intelligence:"
                  "  target: dev"
                  "  outputs:"
                  "    dev:"
                  "      type: postgres"
                  (str "      host: " host)
                  (str "      port: " port)
                  (str "      user: " user)
                  (str "      password: " (pr-str (or password "")))
                  (str "      dbname: " dbname)
                  "      schema: public"
                  "      threads: 4"
                  ""]))

(mu/defn- build!
  "Build the checkout at `project` in a scratch copy against `connection`: `dbt seed`, then `dbt run` of the project's
  own models."
  [^File project :- (ms/InstanceOfClass File)
   connection    :- ::connection]
  (let [scratch  (.toFile (Files/createTempDirectory "dbt-import-marts" (make-array FileAttribute 0)))
        profiles (io/file scratch "profiles")]
    (try
      (fixture/copy-project project scratch)
      (.mkdirs profiles)
      (spit (io/file profiles "profiles.yml") (profiles-yaml connection))
      (when-not (.isDirectory (io/file scratch "dbt_packages"))
        (fixture/dbt! scratch "deps"))
      (fixture/dbt! scratch "seed" "--profiles-dir" (.getPath profiles))
      (fixture/dbt! scratch "run" "--select" (str "package:" package-name) "--profiles-dir" (.getPath profiles))
      (finally
        (fixture/delete-recursively! scratch)))))

(mu/defn- field-definitions :- [:sequential ::field-definition]
  "The dataset field definitions for `table`, from the columns Postgres reports for it, in column order."
  [ds                     :- DataSource
   {:keys [table pk fks]} :- ::table]
  (for [{:keys [column_name udt_name]} (jdbc/execute! ds ["SELECT column_name, udt_name
                                                          FROM information_schema.columns
                                                          WHERE table_schema = 'public' AND table_name = ?
                                                          ORDER BY ordinal_position"
                                                         table]
                                                      {:builder-fn jdbc.rs/as-unqualified-maps})
        :let [base-type (or (udt->base-type udt_name)
                            (throw (ex-info (format "no base type for Postgres type %s of %s.%s; add it to udt->base-type"
                                                    udt_name table column_name)
                                            {:table table, :column column_name, :udt udt_name})))
              fk        (get fks column_name)]]
    (cond-> {:field-name column_name, :base-type base-type}
      (= column_name pk) (assoc :pk? true)
      fk                 (assoc :fk (keyword fk)))))

(mu/defn- edn-value :- :string
  "A row value as the dataset EDN writes it: dates as `#t` literals, everything else as it prints."
  [v :- ::value]
  (if (instance? LocalDate v)
    (str "#t " (pr-str (str v)))
    (pr-str v)))

(mu/defn- rows :- [:sequential ::row]
  "The rows of `table`, ordered by `pk`, as vectors of values in the order of `field-definitions`."
  [ds                 :- DataSource
   {:keys [table pk]} :- ::table
   field-definitions  :- [:sequential ::field-definition]]
  (let [columns (map :field-name field-definitions)
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
  [[table-name field-definitions table-rows] :- ::table-definition]
  (str "[" (pr-str table-name) "\n"
       "  [" (str/join "\n   " (map edn-field-definition field-definitions)) "]\n"
       "  [" (str/join "\n   " (map (fn [row] (str "[" (str/join ", " (map edn-value row)) "]")) table-rows)) "]]"))

(mu/defn- edn-dataset :- :string
  [table-definitions :- [:sequential ::table-definition]]
  (str "[" (str/join "\n " (map edn-table-definition table-definitions)) "]\n"))

(mu/defn regenerate! :- :string
  "Regenerate the dataset (see the namespace docstring) from the checkout at `:project` (default
  `~/dbt-business-intelligence`), building it in `:connection`, and write it to `:out` (default the dataset file).
  Returns a one-line summary of what was written."
  ([]
   (regenerate! {}))

  ([{:keys [project out connection]
     :or   {project (str (System/getProperty "user.home") "/dbt-business-intelligence")
            out     dataset-filename}}
    :- [:map {:closed true}
        [:project    {:optional true} :string]
        [:out        {:optional true} :string]
        [:connection {:optional true} ::connection]]]
   (let [project    (io/file project)
         connection (with-defaults (or connection {}))]
     (when-not (.isFile (io/file project "dbt_project.yml"))
       (throw (ex-info (str project " is not a dbt project; pass :project") {})))
     (build! project connection)
     (let [ds          (jdbc/get-datasource (assoc connection :dbtype "postgresql"))
           definitions (vec (for [table tables
                                  :let  [fields (vec (field-definitions ds table))]]
                              [(:table table) fields (vec (rows ds table fields))]))]
       (spit out (edn-dataset definitions))
       (format "wrote %s: %s" out (str/join ", " (for [[table-name _ table-rows] definitions]
                                                   (format "%s (%d rows)" table-name (count table-rows)))))))))
