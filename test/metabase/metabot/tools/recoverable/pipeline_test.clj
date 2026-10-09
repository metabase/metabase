(ns metabase.metabot.tools.recoverable.pipeline-test
  "Guards the one gap `with-pipeline-errors` cannot close by itself.

  The converter maps a pipeline `:error` code onto a declaration by name. A code with no declaration
  is not converted, so it becomes unrecoverable and ends the turn — silently, and only in production.
  This test reads the pipeline's own sources and fails while the gap is still cheap to close."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.error :as tools.error]
   ;; loaded for its declarations; the codes are read out of the catalog, not off the vars
   [metabase.metabot.tools.recoverable.pipeline :as pipeline]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private pipeline-sources
  "The namespaces that raise representations-pipeline errors, as classpath resource paths.

  Listed rather than globbed: a glob would quietly stop covering a file that moved, which is the
  exact failure this test exists to catch."
  ["metabase/agent_lib/representations.clj"
   "metabase/agent_lib/representations/repair.clj"
   "metabase/agent_lib/representations/resolve.clj"
   "metabase/metabot/tools/construct.clj"
   "metabase/models/serialization/resolve/mp.clj"])

(def ^:private error-code-pattern
  "Matches `:error :some-code` in ex-data, which is how the pipeline tags an error for its caller."
  #":error\s+:([a-z0-9][a-z0-9-]*)")

(defn- codes-in-source
  [path]
  (let [resource (io/resource path)]
    (is (some? resource) (str "pipeline source " path " is not on the classpath — has it moved?"))
    (when resource
      (into #{} (map (comp keyword second)) (re-seq error-code-pattern (slurp resource))))))

(defn- pipeline-codes
  []
  (into #{} (mapcat codes-in-source) pipeline-sources))

(def ^:private declaration-ns
  "Where the declarations live. A literal, and self-guarding: if the namespace is renamed without
  this following, [[declared-codes]] comes back empty and the first test below fails naming every
  code as missing."
  "metabase.metabot.tools.recoverable.pipeline")

(defn- declared-codes
  []
  (into #{}
        (comp (filter #(= declaration-ns (namespace %)))
              (map (comp keyword name)))
        (keys (tools.error/recoverables))))

(deftest every-pipeline-error-code-has-a-declaration-test
  (let [missing (set/difference (pipeline-codes) (declared-codes))]
    (is (empty? missing)
        (str "These representations-pipeline :error codes have no declaration in "
             "metabase.metabot.tools.recoverable.pipeline, so `tools.core/with-pipeline-errors` "
             "will not convert them and they will end the turn instead of teaching the agent: "
             (pr-str (sort missing))
             ". Add a `defpipeline-error` for each, or decide it really is unrecoverable and say so "
             "in a comment there."))))

(deftest no-stale-declarations-test
  (testing "a declaration for a code the pipeline no longer raises is dead text that nobody will
           notice has drifted"
    (let [stale (set/difference (declared-codes) (pipeline-codes))]
      (is (empty? stale)
          (str "These declarations in metabase.metabot.tools.recoverable.pipeline match no `:error` "
               "code in the pipeline sources: " (pr-str (sort stale))
               ". Remove them, or add the source file that raises them to `pipeline-sources`.")))))

(deftest the-scan-finds-something-test
  (testing "a regex that stopped matching would make both tests above pass vacuously"
    (is (< 20 (count (pipeline-codes))))
    (is (contains? (pipeline-codes) :unknown-table))))

(defn- construct-error
  [stage]
  (try
    (tools.core/handle construct/construct-notebook-query-tool
                       {:title       "t"
                        :description "d"
                        :query       {:lib/type "mbql/query"
                                      :stages   [(merge {:lib/type "mbql.stage/mbql"} stage)]}}
                       {})
    nil
    (catch Throwable e
      (tools.error/classify e))))

(def ^:private main-tools #{"read_resource" "search"})

(def ^:private slackbot-tools #{"search" "list_available_fields"})

(deftest unknown-field-names-its-table-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [db-name (:name (mt/db))
          error   (construct-error {:source-table [db-name "PUBLIC" "ORDERS"]
                                    :aggregation  [["count" {}]]
                                    :breakout     [["field" {} [db-name "PUBLIC" "ORDERS" "CREATD_AT"]]]})]
      (is (=? {:class :recoverable
               :code  ::pipeline/unknown-field
               :data  {:table-id (mt/id :orders)}}
              error))
      (testing "a profile with `read_resource` is pointed at the table's fields resource"
        (is (str/includes? (tools.error/recoverable-text error main-tools)
                           (str "metabase://table/" (mt/id :orders) "/fields"))))
      (testing "a profile without it lists the table's fields with `list_available_fields`"
        (let [text (tools.error/recoverable-text error slackbot-tools)]
          (is (str/includes? text (str "table_ids: [" (mt/id :orders) "]")))
          (is (not (str/includes? text "read_resource"))))))))

(deftest unknown-table-names-its-database-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [db-name (:name (mt/db))
          error   (construct-error {:source-table [db-name "PUBLIC" "ORDRS"]
                                    :aggregation  [["count" {}]]})]
      (is (=? {:class :recoverable
               :code  ::pipeline/unknown-table
               :data  {:database-id (mt/id)}}
              error))
      (is (str/includes? (tools.error/recoverable-text error main-tools)
                         (str "metabase://database/" (mt/id) "/tables")))
      (testing "a profile without `read_resource` is pointed at `search`"
        (let [text (tools.error/recoverable-text error slackbot-tools)]
          (is (str/includes? text "`search`"))
          (is (not (str/includes? text "read_resource"))))))))

(deftest payload-test
  (testing "an ambiguous FK names its source table"
    (is (= {:message "m" :table-id 7}
           (pipeline/payload :ambiguous-fk (ex-info "m" {:source-table 7})))))
  (testing "ids are only taken for the codes whose steps name them"
    (is (= {:message "m"}
           (pipeline/payload :unknown-table-id (ex-info "m" {:table-id 7})))))
  (testing "a database id is kept only when the current user can read the database"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= {:message "m" :database-id db-id}
               (pipeline/payload :unknown-table (ex-info "m" {:database-id db-id})))))
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:message "m"}
                 (pipeline/payload :unknown-table (ex-info "m" {:database-id db-id})))))))))
