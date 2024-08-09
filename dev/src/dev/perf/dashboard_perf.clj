(ns dev.perf.dashboard-perf
  (:require
   [clojure.test.check.generators :as gen]
   [java-time.api :as jt]
   [metabase-enterprise.sandbox.models.group-table-access-policy :as gtap]
   [metabase.models.card :as card]
   [metabase.models.data-permissions.graph :as graph]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [java.util.concurrent ThreadLocalRandom]))

(set! *warn-on-reflection* true)

(defmulti ^:private field-spec
  (fn [kind _index]
    kind))

(defmulti ^:private field-gen identity)

;; :pk
(defmethod field-spec :pk [_kind _index]
  {:field-name    "PK field"
   :pk?           true
   :base-type     :type/Integer
   :semantic-type :type/PK})

(defmethod field-gen :pk [_kind]
  (let [n (volatile! 0)]
    (gen/fmap (fn [_]
                (vswap! n inc))
              gen/nat)))

;; :int-category
(defmethod field-spec :int-category [_kind index]
  {:field-name    (str "Int Category field " index)
   :base-type     :type/Integer
   :semantic-type :type/Category})

;; Chooses a category count K from 4 to 20 and generates uniform random numbers in [1, K] inclusive.
(defn- category-count []
  (+ 4 (rand-int 17)))

(defmethod field-gen :int-category [_kind]
  (let [n (category-count)]
    (gen/choose 1 n)))

;; :string-category
(defmethod field-spec :string-category [_kind index]
  {:field-name    (str "String Category field " index)
   :base-type     :type/Text
   :semantic-type :type/Category})

;; Chooses a category count K from 4 to 20, generates a set of K nonempty strings, and then chooses them uniformly.
(defmethod field-gen :string-category [_kind]
  (let [n     (category-count)
        inner (gen/sample (gen/not-empty gen/string-ascii) n)]
    (gen/elements inner)))

;; quantity
(defmethod field-spec :quantity [_kind index]
  {:field-name    (str "Quantity field " index)
   :base-type     :type/Integer
   :semantic-type :type/Quantity})

;; 0 to 1 million
(defmethod field-gen :quantity [_kind]
  (gen/choose 0 1000000))

;; float
(defmethod field-spec :float [_kind index]
  {:field-name    (str "Float field " index)
   :base-type     :type/Float})

;; 0 to 1 million
(defmethod field-gen :float [_kind]
  (gen/double* {:NaN? false, :min 0.0, :max 1000000.0}))

;; string
(defmethod field-spec :string [_kind index]
  {:field-name    (str "Text field " index)
   :base-type     :type/Text})

;; Empty strings are allowed. Printable ASCII.
(defmethod field-gen :string [_kind]
  gen/string-ascii)

;; Dates and times range from 2018-01-01 through 2028-12-31.
(defmethod field-spec :date [_kind index]
  {:field-name    (str "Date field " index)
   :base-type     :type/Date})

(defmethod field-spec :datetime [_kind index]
  {:field-name    (str "Datetime field " index)
   :base-type     :type/DateTimeWithTZ})

(defmethod field-spec :time [_kind index]
  {:field-name    (str "Time field " index)
   :base-type     :type/Time})

(defmethod field-gen :date [_kind]
  (gen/let [year (gen/choose 2018 2028)
            day  (gen/choose 1 (if (jt/leap? (jt/year year)) 365 366))]
    (jt/+ (jt/local-date year) (jt/days (dec day)))))

;; Chooses a time of day with second resolution.
(defmethod field-gen :time [_kind]
  (gen/let [hour (gen/choose 0 23)
            min  (gen/choose 0 59)
            sec  (gen/choose 0 59)]
    (jt/local-time hour min sec)))

;; Generates UTC datetimes as OffsetDateTimes.
(defmethod field-gen :datetime [_kind]
  (->> (gen/tuple (field-gen :date) (field-gen :time))
       (gen/fmap (fn [[d t]]
                   (jt/offset-date-time d t 0)))))

(defn- table-spec
  "Each table gets 100 fields:
  - 1 PK
  - 9 int category fields
  - 10 string category fields
  - 20 quantity fields
  - 10 float fields
  - 20 string fields
  - 10 date fields
  - 10 datetime fields
  - 10 time fields

  For each type, the last 5 are nullable and the earlier ones not nullable. The null fraction is 10%."
  [index]
  (let [fields      [[1 :pk false]
                     [9  :int-category]
                     [10 :string-category]
                     [20 :quantity]
                     [10 :float]
                     [20 :string]
                     [10 :date]
                     [10 :datetime]
                     [10 :time]]
        field-specs (for [[n kind] fields
                          index           (range n)]
                      (assoc (field-spec kind (inc index))
                             :not-null? (< index (- n 5))))
        generators  (for [[n kind] fields
                          index           (range n)
                          :let [g (field-gen kind)]]
                      (if (and (> n 1)
                               (>= index (- n 5)))
                        ;; Nullable final 5
                        (gen/frequency [[9 g] [1 (gen/elements [nil])]])
                        ;; Non-nullable earlier ones
                        g))]
    [(format "Table %03d" (inc index))
     field-specs
     (gen/sample (apply gen/tuple generators) 100)]))

(defn db-spec
  "Generates the database used for some performance testing of eg. dashboards.

  Intended to be called like `(mt/defdataset perf-testbed (db-spec 100))` from a test namespace, and used with
  `(mt/dataset perf-tested ...)` in the same namespace."
  [table-count]
  (mapv table-spec (range table-count)))

(defn create-models
  "Given the `db` instance for a `db-spec` database, create a model that selects directly from each table.
  The models will be added to the `collection-id` provided.

  These are labeled `Basic Model NNN` in parallel with the tables."
  [db creator collection-id]
  (let [tables          (t2/select :model/Table :db_id (:id db))
        existing-models (t2/select-fn-set :name :model/Card :database_id (:id db))]
    (doseq [table tables
            :let [query      {:type     :query
                              :database (:id db)
                              :query    {:source-table (:id table)}}
                  model-name (str "Basic Model " (subs (:name table) 6))]
            :when (not (existing-models model-name))
            ;:let [results (mt/process-query query)]
            ]
    ;:result_metadata (-> results :data :results_metadata :columns)
    (card/create-card!
      {:name                   model-name
       :collection_id          collection-id
       :dataset_query          query
       :database_id            (:id db)
       :display                :table
       :visualization_settings {}
       :type                   :model}
      creator))))

(defn create-count-queries
  "Given the `db` instance for a `db-spec` database, create a question for each Basic Model (see [[create-models]])
  that does a `count` aggregation on the model.

  The questions will be added to the `collection-id` provided.

  These are labeled `Count of Basic Model NNN` in parallel with the models."
  [db creator collection-id]
  (let [models         (t2/select :model/Card
                         :type        :model
                         :database_id (:id db)
                         :name        [:like "Basic Model %"])
        existing-cards (set (t2/select-fn-set :name :model/Card
                              :type        :question
                              :database_id (:id db)
                              :name        [:like "Count of Basic Model %"]))]
    (doseq [model models
            :let [query     {:type :query
                             :database (:id db)
                             :query    {:source-table (str "card__" (:id model))
                                        :aggregation  [[:count]]}}
                  card-name (str "Count of " (:name model))]
            :when (not (existing-cards card-name))]
      (card/create-card!
        {:name                   card-name
         :collection_id          collection-id
         :dataset_query          query
         :database_id            (:id db)
         :display                :scalar
         :visualization_settings {}
         :type                   :question}
        creator))))

(defn- gen-parameters []
  (let [rng (ThreadLocalRandom/current)]
    (for [[kind n] [["Int" 9] ["String" 10]]
          index    (range 1 (inc n))
          :let [param-name (str "Filter " kind " " index)]]
      {:name       param-name
       :slug       (u/slugify param-name)
       :id         (format "%08x" (.nextInt rng))
       :type       :string/=
       :sectionId  "string"})))

(defn- gen-parameter-targets []
  (concat (for [i (range 1 10)]
            [:dimension [:field (str "Int Category field " i) {:base-type :type/Integer}]])
          (for [i (range 1 11)]
            [:dimension [:field (str "String Category field " i) {:base-type :type/Text}]])))

(defn create-dashboard
  "Creates a single dashboard with 1 card for each [[create-count-queries]] and 19 filters on the
  `:int-category-field`s and `:string-category-field`s of each card."
  [creator collection-id]
  ;; This actually needs to create the dashcards as well as the dashboard.
  (if-let [dashboard (t2/select-one :model/Dashboard :collection_id collection-id :name "Dashboard perf repro dash 1")]
    (do (log/infof "Dashboard already exists; ID %d" (:id dashboard))
        dashboard)
    (let [parameters   (gen-parameters)
          dashboard-id (t2/insert-returning-pk! :model/Dashboard
                         {:name               "Dashboard perf repro dash 1"
                          :description        "Dashboard to reproduce performance issues with models, filters, and sandboxing."
                          :collection_id      collection-id
                          :width              "fixed"
                          :creator_id         (:id creator)
                          :parameters         parameters
                          :auto_apply_filters true})
          questions    (->> (t2/select :model/Card
                              :collection_id collection-id
                              :name          [:like "Count of Basic Model %"])
                            (sort-by :id))]
      (doseq [[i q] (map-indexed vector questions)
              ;; Scalar cards are 6x3, which puts them 4 to a row.
              :let [row (* 3 (quot i 4))
                    col (* 6 (mod i 4))]]
        (t2/insert! :model/DashboardCard
          {:size_x                 6
           :size_y                 3
           :row                    row
           :col                    col
           :dashboard_id           dashboard-id
           :card_id                (:id q)
           :visualization_settings {}
           :parameter_mappings     (for [[param target] (map vector parameters (gen-parameter-targets))]
                                     {:parameter_id (:id param)
                                      :card_id      (:id q)
                                      :target       target})})))))

(defn- upsert-group-named
  "Returns the group's `:id`."
  [group-name]
  (if (perms-group/exists-with-name? group-name)
    (t2/select-one-pk :model/PermissionsGroup :name group-name)
    (t2/insert-returning-pk! :model/PermissionsGroup {:name group-name})))

(defn- ensure-member-of-group [user-id group-id]
  (when-not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id)
    (t2/insert! :model/PermissionsGroupMembership {:user_id user-id :group_id group-id})))

(defn- block-all-users-for-db [db]
  (graph/update-data-perms-graph!
    {:groups {(:id (perms-group/all-users)) {(:id db) {:create-queries :no
                                                       :view-data      :blocked}}}}))

(defn- assoc-login-attribute [user-id attribute value]
  (let [existing-attributes (t2/select-one-fn :login_attributes :model/User :id user-id)
        adjusted            (assoc existing-attributes (name attribute) (str value))]
    (t2/update! :model/User :id user-id {:login_attributes adjusted})))

(defn setup-sandboxing
  "Sets up sandboxing for the given `user-id` on all the tables in `db`.

  Upserts a permissions group called \"Sandboxed $DB_NAME\" and adds the user to it.

  Gives the user the property `dashboard_perf_id: 2` and sandboxes each table based on the given `field-name` matching
  `client_id`. Therefore the `field-name` should be one of the `int category` fields."
  [db user-id field-name]
  (let [group-name (str "Sandboxed " (:name db))
        group-id   (upsert-group-named group-name)]
    (ensure-member-of-group user-id group-id)
    (block-all-users-for-db db)
    (assoc-login-attribute user-id "dashboard_perf_id" "2")
    (gtap/upsert-sandboxes! (for [table (t2/select :model/Table :db_id (:id db))
                                  :let [field (t2/select-one :model/Field :table_id (:id table) :name field-name)]]
                              (do
                                (when-not field
                                  (throw (ex-info "Bad field-name in setup-sandboxing" {:field-name field-name})))
                                {:group_id group-id
                                 :table_id (:id table)
                                 :card_id  nil
                                 :attribute_remappings
                                 {"dashboard_perf_id" [:dimension [:field (:id field)
                                                                   {:base_type (:base_type field)}]]}})))))

(comment
  ;; To install the dataset, run this at the REPL.
  (mt/defdataset perf-testbed (db-spec 100))

  ;; And to create the models, queries and dashboard to reproduce the issue, run this.
  ;; XXX: Be sure to set the collection ID and sandboxed user details first!
  (mt/with-driver :postgres
    (mt/dataset perf-testbed
      (let [db      (mt/db)
            creator (t2/select-one :model/User :is_superuser true)
            ;; XXX: Set this to an empty collection ID
            collection-id  581
            ;; XXX: Set the user name
            sandboxed-user (t2/select-one :model/User :first_name "Sandy" :last_name "Boxed")]
        ;; TODO: Create a new collection and use it for this.
        (create-models db creator collection-id)
        (create-count-queries db creator collection-id)
        (create-dashboard creator collection-id)
        (setup-sandboxing db (:id sandboxed-user) "Int Category field 1"))))

  ;; TODO: Better cleanup code that will delete the whole thing and leave an empty collection.
  (t2/delete! :model/Dashboard :id 1691))
