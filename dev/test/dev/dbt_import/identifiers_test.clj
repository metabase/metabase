(ns dev.dbt-import.identifiers-test
  "How the names the YAML writes are spelled: as sync sees them, which is dbt's spelling folded the way the driver says
  the warehouse folds an unquoted identifier (see [[dev.dbt-import.metadata]]), with the parts dbt quoted kept, the
  schema dropped for a driver without schemas, and the config's `:identifier-case`, `:schema-mapping` and nil
  `:databases` key overriding each.

  The Snowflake cases need the Snowflake driver on the classpath, which `./bin/mage project-tests dbt-import` has
  (the `:drivers` alias) and a bare `./bin/test-agent` run has only with `--drivers=h2` or the like."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.test-util :as tu]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel quoted-parts-test
  (let [relation {:database "dbt_bi", :schema_name "public", :alias "fact_sales"}
        quoted   (fn [relation-name] (parse/quoted-parts (assoc relation :relation_name relation-name)))]
    (testing "every part quoted, as dbt-postgres writes it"
      (is (= #{:database :schema :table} (quoted "\"dbt_bi\".\"public\".\"fact_sales\""))))
    (testing "nothing quoted, as dbt-snowflake writes it"
      (is (= #{} (quoted "dbt_bi.public.fact_sales"))))
    (testing "one part quoted"
      (is (= #{:schema} (quoted "dbt_bi.\"public\".fact_sales"))))
    (testing "the other quoting styles dbt adapters use"
      (is (= #{:database :schema :table} (quoted "`dbt_bi`.`public`.`fact_sales`")) "backticks: MySQL, BigQuery, Spark")
      (is (= #{:database :schema :table} (quoted "[dbt_bi].[public].[fact_sales]")) "square brackets: SQL Server"))
    (testing "a doubled closing quote inside a part stands for itself"
      (are [relation-name table-alias] (= #{:table}
                                          (parse/quoted-parts (assoc relation
                                                                     :alias table-alias
                                                                     :relation_name relation-name)))
        "dbt_bi.public.\"a\"\"b\"" "a\"b"
        "dbt_bi.public.`a``b`"     "a`b"
        "dbt_bi.public.[a]]b]"     "a]b"))
    (testing "two parts, for an adapter without a database level: the schema and the table"
      (is (= #{:schema :table} (parse/quoted-parts {:database nil, :schema_name "mydb", :alias "orders"
                                                    :relation_name "`mydb`.`orders`"}))))
    (testing "no relation_name (an ephemeral model), one in a form this does not read, or one naming another relation:
              nothing counts as quoted"
      (is (= #{} (quoted nil)))
      (is (= #{} (quoted "")))
      (is (= #{} (quoted "garbage ) \"\"")))
      (is (= #{:database :schema} (quoted "\"dbt_bi\".\"public\".\"dim_customer\""))
          "only the parts that line up count")
      (is (= #{:schema :table} (quoted "\"other\".\"public\".\"fact_sales\""))))))

(deftest ^:parallel parse-quoting-test
  (let [manifest (tu/build-manifest {:edit (fn [manifest]
                                             (-> (tu/unquoted-relations manifest)
                                                 (assoc-in [:nodes tu/model-id :columns "sales" :quote] true)
                                                 (assoc-in [:nodes tu/model-id :columns "amount" :quote] false)))})
        ir       (-> manifest tu/round-trip dbt-manifest/decode-manifest parse/parse-manifest)
        columns  (get-in ir [:semantic-models "fact_sales" :columns])]
    (is (= #{} (get-in ir [:semantic-models "fact_sales" :relation :quoted])))
    (testing "a column's `quote` config is carried; nil and false are unquoted"
      (is (= {"sales" true, "amount" false, "quantity" false}
             (update-vals (select-keys columns ["sales" "amount" "quantity"]) :quoted?))))))

(defn- snowflake
  "What `m` converts to over a manifest written as dbt-snowflake writes it (nothing quoted), with `config` merged over
  the default and `edit` over [[tu/unquoted-relations]]: the source table and the aggregation's field refs."
  ([config]
   (snowflake config identity))
  ([config edit]
   (-> (tu/convert {:config (merge {:driver :snowflake} config)
                    :edit   (comp edit tu/unquoted-relations #(assoc-in % [:metadata :adapter_type] "snowflake"))})
       (select-keys [:source-table :aggregation]))))

(deftest snowflake-folding-test
  (testing "Snowflake stores an unquoted identifier upper-cased, and the driver says so: every unquoted part is"
    (is (= {:source-table ["Sales DB" "PUBLIC" "FACT_SALES"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "PUBLIC" "FACT_SALES" "SALES"]]]}
           (snowflake {}))))
  (testing "a part dbt quoted is kept as written"
    (is (= {:source-table ["Sales DB" "public" "FACT_SALES"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "public" "FACT_SALES" "SALES"]]]}
           (snowflake {} (fn [manifest]
                           (assoc-in manifest [:semantic_models tu/sm-id :node_relation :relation_name]
                                     "dbt_bi.\"public\".fact_sales"))))))
  (testing "a column with `quote: true` is kept as written"
    (is (= {:source-table ["Sales DB" "PUBLIC" "FACT_SALES"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "PUBLIC" "FACT_SALES" "sales"]]]}
           (snowflake {} #(assoc-in % [:nodes tu/model-id :columns "sales" :quote] true)))))
  (testing ":identifier-case overrides the driver"
    (is (= {:source-table ["Sales DB" "public" "fact_sales"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "public" "fact_sales" "sales"]]]}
           (snowflake {:identifier-case :as-is}))
        ":as-is folds nothing, for a QUOTED_IDENTIFIERS_IGNORE_CASE account")
    (is (= {:source-table ["Sales DB" "public" "fact_sales"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "public" "fact_sales" "sales"]]]}
           (snowflake {:identifier-case :lower})))
    (is (= {:source-table ["Sales DB" "PUBLIC" "FACT_SALES"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "PUBLIC" "FACT_SALES" "SALES"]]]}
           (-> (tu/convert {:config {:identifier-case :upper}, :edit tu/unquoted-relations})
               (select-keys [:source-table :aggregation])))
        ":upper on Postgres, whose driver would fold to lower case"))
  (testing "the Metabase Database's name is the config's as typed"
    (is (= ["Sales DB" "PUBLIC" "FACT_SALES"] (:source-table (snowflake {:databases {"dbt_bi" "Sales DB"}}))))))

(deftest ^:parallel postgres-folding-test
  (testing "Postgres folds an unquoted identifier to lower case, which dbt-postgres never writes: the fixture's quoted
            names are kept"
    (is (= {:source-table ["Sales DB" "public" "fact_sales"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "public" "fact_sales" "sales"]]]}
           (select-keys (tu/convert {}) [:source-table :aggregation]))))
  (testing "a mixed-case name written unquoted is lower-cased, as Postgres stores it"
    (is (= {:source-table ["Sales DB" "public" "fact_sales"]
            :aggregation  [:sum {} [:field {} ["Sales DB" "public" "fact_sales" "sales"]]]}
           (select-keys (tu/convert {:edit (fn [manifest]
                                             (-> (tu/unquoted-relations manifest)
                                                 (assoc-in [:semantic_models tu/sm-id :node_relation :relation_name]
                                                           "dbt_bi.Public.Fact_Sales")
                                                 (assoc-in [:semantic_models tu/sm-id :node_relation :schema_name]
                                                           "Public")
                                                 (assoc-in [:semantic_models tu/sm-id :node_relation :alias]
                                                           "Fact_Sales")
                                                 (assoc-in [:nodes tu/model-id :schema] "Public")
                                                 (assoc-in [:nodes tu/model-id :alias] "Fact_Sales")))})
                        [:source-table :aggregation]))))
  (testing "a column the project does not document is folded too: an expr writes it bare"
    (is (= [:sum {} [:field {} ["Sales DB" "public" "fact_sales" "undocumented"]]]
           (tu/aggregation {:measure {:expr "Undocumented"}})))))

(defn- mysql-manifest
  "The fixture manifest as dbt-mysql writes it: no database level (`database: null`), the MySQL database as the
  schema, and backtick-quoted relation names."
  [manifest]
  (let [relation-name (fn [schema table-alias] (format "`%s`.`%s`" schema table-alias))]
    (-> manifest
        (assoc-in [:metadata :adapter_type] "mysql")
        (update :nodes update-vals #(assoc % :database nil, :schema "dbt_bi"
                                           :relation_name (relation-name "dbt_bi" (:alias %))))
        (update :semantic_models update-vals
                #(update % :node_relation
                         (fn [{table-alias :alias, :as relation}]
                           (assoc relation :database nil, :schema_name "dbt_bi"
                                  :relation_name (relation-name "dbt_bi" table-alias))))))))

(deftest nil-schema-test
  (testing "MySQL has no schema level in Metabase: the table is written with a nil schema, under the nil database key"
    (is (= {:source-table ["Sales DB" nil "fact_sales"]
            :aggregation  [:sum {} [:field {} ["Sales DB" nil "fact_sales" "sales"]]]}
           (select-keys (tu/convert {:config {:driver :mysql, :databases {nil "Sales DB"}}, :edit mysql-manifest})
                        [:source-table :aggregation]))))
  (testing "SQLite: dbt-sqlite writes schema_name main, and the driver has no schemas"
    (let [sqlite (fn [config]
                   (select-keys (tu/convert {:config (merge {:driver :sqlite} config)
                                             :edit   (fn [manifest]
                                                       (-> manifest
                                                           (assoc-in [:metadata :adapter_type] "sqlite")
                                                           (update :nodes update-vals #(assoc % :schema "main"))
                                                           (update :semantic_models update-vals
                                                                   #(assoc-in % [:node_relation :schema_name]
                                                                              "main"))))})
                                [:source-table]))]
      (is (= {:source-table ["Sales DB" nil "fact_sales"]} (sqlite {})))
      (is (= {:source-table ["Sales DB" nil "fact_sales"]} (sqlite {:schema-mapping {"main" nil}}))
          "which :schema-mapping can say as well")
      (is (= {:source-table ["Sales DB" "main" "fact_sales"]} (sqlite {:schema-mapping {"main" "main"}}))
          "or override, for an instance whose driver syncs one")))
  (testing ":schema-mapping overrides the driver's schema, per dbt schema"
    (is (= {:source-table ["Sales DB" "analytics" "fact_sales"]}
           (select-keys (tu/convert {:config {:schema-mapping {"public" "analytics"}}}) [:source-table])))
    (is (= {:source-table ["Sales DB" nil "fact_sales"]}
           (select-keys (tu/convert {:config {:schema-mapping {"public" nil}}}) [:source-table])))
    (is (= {:source-table ["Sales DB" "public" "fact_sales"]}
           (select-keys (tu/convert {:config {:schema-mapping {"other" nil}}}) [:source-table]))
        "a schema with no entry keeps the default")))

(deftest ^:parallel identifier-case-test
  (let [identifier-case (fn [config features] (metadata/identifier-case (merge tu/default-config config) features))]
    (is (= :upper (identifier-case {} #{:upper-case-unquoted-identifiers :schemas})))
    (is (= :lower (identifier-case {} #{:schemas})))
    (is (= :as-is (identifier-case {:identifier-case :as-is} #{:upper-case-unquoted-identifiers})))
    (is (= :upper (identifier-case {:identifier-case :upper} #{})))))

(deftest ^:parallel config-schema-test
  (is (mr/validate ::resolved/config (assoc tu/default-config
                                            :identifier-case :as-is
                                            :schema-mapping  {"main" nil, "public" "analytics"}
                                            :databases       {nil "Sales DB", "dbt_bi" "Sales DB"})))
  (is (not (mr/validate ::resolved/config (assoc tu/default-config :identifier-case :preserve))))
  (is (not (mr/validate ::resolved/config (assoc tu/default-config :schema-mapping {nil "main"})))
      "a dbt schema_name is never nil"))
