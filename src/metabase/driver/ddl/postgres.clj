(ns metabase.driver.ddl.postgres
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.util :as sql.u]
            [metabase.models.card :refer [Card]]
            [metabase.models.persisted-info :as persisted-info :refer [PersistedInfo]]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- field-metadata->field-defintion
  "Map containing the type and name of fields for dll. The type is :base-type and uses the effective_type else base_type
  of a field."
  [{:keys [name base_type effective_type]}]
  {:field-name name
   :base-type  (or effective_type base_type)})

(def ^:private Metadata
  "Spec for metadata. Just asserting we have base types and names, not the full metadata of the qp."
  [(su/open-schema
    {:name s/Str, (s/optional-key :effective_type) s/Keyword, :base_type s/Keyword})])

(def Definition
  "Definition spec for a cached table."
  {:table-name su/NonBlankString
   :field-definitions [{:field-name su/NonBlankString
                        :base-type  s/Keyword}]})

(s/defn ^:private metadata->definition :- Definition
  "Returns a ddl definition datastructure. A :table-name and :field-deifinitions vector of field-name and base-type."
  [metadata :- Metadata table-name]
  {:table-name        table-name
   :field-definitions (mapv field-metadata->field-defintion metadata)})

(defn- quote-fn [driver]
  (fn quote [ident entity]
    (sql.u/quote-name driver ident (ddl.i/format-name driver entity))))

(defn create-schema-sql
  "SQL string to create a schema suitable for postgres"
  [{driver :engine :as database}]
  (let [q (quote-fn driver)]
    (format "create schema %s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid))))))

(defn- create-table-sql [{driver :engine :as database} definition]
  (let [q (quote-fn driver)]
    (format "create table %s.%s (%s);"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table (:table-name definition))
            (str/join
             ", "
             (for [{:keys [field-name base-type]} (:field-definitions definition)]
               (format "%s %s"
                       (q :field field-name)
                       (ddl.i/field-base-type->sql-type driver base-type)))))))

(defn- drop-table-sql [{driver :engine :as database} table-name]
  (let [q (quote-fn driver)]
    (format "drop table if exists %s.%s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table table-name))))

(defn- populate-table-sql [{driver :engine :as database} definition query]
  (let [q (quote-fn driver)]
   (format "insert into %s.%s (%s) %s"
           (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
           (q :table (:table-name definition))
           (str/join
            ", "
            (for [{:keys [field-name]} (:field-definitions definition)]
              (q :field field-name)))
           query)))

(def StepArg
  "Schema for argument to step"
  (let [Map {s/Any s/Any}]
    {:card Map
     :database Map
     :persisted-info Map
     :definition Map}))

(def ^:private all-steps
  {:drop-table     {:func (s/fn drop-table-step [conn {:keys [database persisted-info]} :- StepArg]
                            (jdbc/execute!
                             conn
                             [(drop-table-sql database (:table_name persisted-info))])
                            true)}
   :create-table   {:func (s/fn create-table-step [conn {:keys [database definition]} :- StepArg]
                            (jdbc/execute! conn [(create-table-sql database definition)])
                            true)}
   :populate-table {:func (s/fn populate-table-step [conn {:keys [database definition card]} :- StepArg]
                            (jdbc/execute!
                             conn
                             [(populate-table-sql database
                                                  definition
                                                  (binding [persisted-info/*allow-persisted-substitution* false]
                                                    (-> (:dataset_query card)
                                                        qp/compile
                                                        :query)))]))}})

(def ^:private Steps
  "Schema for available steps"
  (let [steps (keys all-steps)]
    [(apply s/enum steps)]))

(s/defn execute-steps
  "Executes `steps`. These steps should be in `all-steps` and have a signature of `[conn
  {:database :persisted-info :card :definition}]`. The `conn` arg is a connection to the database acted upon and help
  open for the duration of the steps. Returns a map of {:args :state :results}` where args is the map arg passed to
  each step, state is either :error or :success, and results is a vector of tuples of step name and step return value.

  Will catch errors in each step and not continue running steps after that point."
  [database persisted-info card steps :- Steps]
  (let [args {:database       database
              :persisted-info persisted-info
              :card           card
              :definition     (metadata->definition (:result_metadata card)
                                                    (:table_name persisted-info))}]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (transduce identity
                 (fn step-runner
                   ([] {:state   :valid
                        :results []})
                   ([results]
                    (-> results
                        (update :state #(if (#{:valid} %) :success %))
                        (assoc :args args)))
                   ([results step]
                    (try
                      (let [{f :func} (all-steps step)
                            f-result  (f conn args)]
                        (update results :results conj [step {:success f-result}]))
                      (catch Exception e
                        (reduced
                         (-> results
                             (assoc :state :error, :error (ex-message e))
                             (update :results conj [step {:error (ex-message e)}])))))))
                 steps))))

(defmethod ddl.i/persist!* :postgres
  [_driver database persisted-info card]
  ;; don't set persisted-info information because it was created in a "creating" state
  (execute-steps database persisted-info card [:create-table :populate-table]))

(defmethod ddl.i/refresh!* :postgres [_driver database persisted-info]
  (let [card (Card (:card_id persisted-info))]
    (execute-steps database persisted-info card
                   [:drop-table :create-table :populate-table])))

(defmethod ddl.i/unpersist! :postgres
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (jdbc/execute! conn [(drop-table-sql database (:table_name persisted-info))])
      (db/delete! PersistedInfo :id (:id persisted-info))
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :postgres
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name  (format "persistence_check_%s" (rand-int 10000))
        steps       [[:persist.check/create-schema
                      (fn check-schema [conn]
                        (let [existing-schemas (into #{} (map :schema_name)
                                                     (jdbc/query conn
                                                                 ["select schema_name from information_schema.schemata"]))]
                          (or (contains? existing-schemas schema-name)
                              (jdbc/execute! conn [(create-schema-sql database)]))))]
                     [:persist.check/create-table
                      (fn create-table [conn]
                        (jdbc/execute! conn
                                       (create-table-sql database
                                                         {:table-name table-name
                                                          :field-definitions [{:field-name "field"
                                                                               :base-type :type/Text}]})))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (jdbc/query conn [(format "select * from %s.%s"
                                                  schema-name table-name)]))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (jdbc/execute! conn [(drop-table-sql database table-name)]))]]]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (loop [[[step stepfn] & remaining] steps]
        (let [result (try (stepfn conn)
                          (log/info (trs "Step {0} was successful for db {1}"
                                         step (:name database)))
                          ::valid
                          (catch Exception e
                            (log/warn (trs "Error in `{0}` while checking for model persistence permissions." step))
                            (log/warn e)
                            step))]
          (cond (and (= result ::valid) remaining)
                (recur remaining)

                (= result ::valid)
                [true :persist.check/valid]

                :else [false step]))))))
