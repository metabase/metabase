(ns metabase.query-processor-test
  "Helper functions for various query processor tests. The tests themselves can be found in various
  `metabase.query-processor-test.*` namespaces; there are so many that it is no longer feasible to keep them all in
  this one. Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.util.date :as du]))

;; make sure all the driver test extension namespaces are loaded <3 if this isn't done some things will get loaded at
;; the wrong time which can end up causing test databases to be created more than once, which fails
(doseq [engine (keys (driver/available-drivers))]
  (let [test-ns (symbol (str "metabase.test.data." (name engine)))]
    (try
      (require test-ns)
      (catch Throwable e
        (log/warn (format "Error loading %s: %s" test-ns (.getMessage e)))))))


;;; ---------------------------------------------- Helper Fns + Macros -----------------------------------------------

;; Event-Based DBs aren't tested here, but in `event-query-processor-test` instead.
(def ^:private ^:const timeseries-engines #{:druid})

(def ^:const non-timeseries-engines
  "Set of engines for non-timeseries DBs (i.e., every driver except `:druid`)."
  (set/difference datasets/all-valid-engines timeseries-engines))

(defn non-timeseries-engines-with-feature
  "Set of engines that support a given `feature`. If additional features are given, it will ensure all features are
  supported."
  [feature & more-features]
  (let [features (set (cons feature more-features))]
    (set (for [engine non-timeseries-engines
               :when  (set/subset? features (driver/features (driver/engine->driver engine)))]
           engine))))

(defn non-timeseries-engines-without-feature
  "Return a set of all non-timeseries engines (e.g., everything except Druid) that DO NOT support `feature`."
  [feature]
  (set/difference non-timeseries-engines (non-timeseries-engines-with-feature feature)))

(defmacro expect-with-non-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-engines non-timeseries-engines
     ~expected
     ~actual))

(defmacro expect-with-non-timeseries-dbs-except
  {:style/indent 1}
  [excluded-engines expected actual]
  `(datasets/expect-with-engines (set/difference non-timeseries-engines (set ~excluded-engines))
     ~expected
     ~actual))

(defmacro qp-expect-with-all-engines
  {:style/indent 0}
  [data query-form & post-process-fns]
  `(expect-with-non-timeseries-dbs
     {:status    :completed
      :row_count ~(count (:rows data))
      :data      ~data}
     (-> ~query-form
         ~@post-process-fns)))

;; TODO - this is only used in a single place, consider removing it
(defmacro qp-expect-with-engines
  {:style/indent 1}
  [datasets data query-form]
  `(datasets/expect-with-engines ~datasets
     {:status    :completed
      :row_count ~(count (:rows data))
      :data      ~data}
     ~query-form))


(defn ->columns
  "Generate the vector that should go in the `columns` part of a QP result; done by calling `format-name` against each
  column name."
  [& names]
  (mapv (partial data/format-name)
        names))


;; Predefinied Column Fns: These are meant for inclusion in the expected output of the QP tests, to save us from
;; writing the same results several times

;; #### categories

(defn- col-defaults []
  {:extra_info      {}
   :target          nil
   :description     nil
   :visibility_type :normal
   :schema_name     (data/default-schema)
   :source          :fields
   :fk_field_id     nil
   :remapped_from   nil
   :remapped_to     nil
   :settings        nil})

(defn- target-field [field]
  (when (data/fks-supported?)
    (dissoc field :target :extra_info :schema_name :source :fk_field_id :remapped_from :remapped_to :fingerprint)))

(defn categories-col
  "Return column information for the `categories` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (data/id :categories)
    :id       (data/id :categories col)}
   (case col
     :id   {:special_type :type/PK
            :base_type    (data/id-field-type)
            :name         (data/format-name "id")
            :display_name "ID"}
     :name {:special_type :type/Name
            :base_type    (data/expected-base-type->actual :type/Text)
            :name         (data/format-name "name")
            :display_name "Name"
            :fingerprint  {:global {:distinct-count 75}
                           :type   {:type/Text {:percent-json   0.0
                                                :percent-url    0.0
                                                :percent-email  0.0
                                                :average-length 8.333}}}})))

;; #### users
(defn users-col
  "Return column information for the `users` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (data/id :users)
    :id       (data/id :users col)}
   (case col
     :id         {:special_type :type/PK
                  :base_type    (data/id-field-type)
                  :name         (data/format-name "id")
                  :display_name "ID"
                  :fingerprint  nil}
     :name       {:special_type :type/Name
                  :base_type    (data/expected-base-type->actual :type/Text)
                  :name         (data/format-name "name")
                  :display_name "Name"
                  :fingerprint  {:global {:distinct-count 15}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :average-length 13.267}}}}
     :last_login {:special_type nil
                  :base_type    (data/expected-base-type->actual :type/DateTime)
                  :name         (data/format-name "last_login")
                  :display_name "Last Login"
                  :unit         :default
                  :fingerprint  {:global {:distinct-count 11}
                                 :type   {:type/DateTime {:earliest "2014-01-01T00:00:00.000Z"
                                                          :latest   "2014-12-05T00:00:00.000Z"}}}})))

;; #### venues
(defn venues-columns
  "Names of all columns for the `venues` table."
  []
  (->columns "id" "name" "category_id" "latitude" "longitude" "price"))

(defn venues-col
  "Return column information for the `venues` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (data/id :venues)
    :id       (data/id :venues col)}
   (case col
     :id          {:special_type :type/PK
                   :base_type    (data/id-field-type)
                   :name         (data/format-name "id")
                   :display_name "ID"
                   :fingerprint  nil}
     :category_id {:extra_info   (if (data/fks-supported?)
                                   {:target_table_id (data/id :categories)}
                                   {})
                   :target       (target-field (categories-col :id))
                   :special_type (if (data/fks-supported?)
                                   :type/FK
                                   :type/Category)
                   :base_type    (data/expected-base-type->actual :type/Integer)
                   :name         (data/format-name "category_id")
                   :display_name "Category ID"
                   :fingerprint  (if (data/fks-supported?)
                                   {:global {:distinct-count 28}}
                                   {:global {:distinct-count 28}, :type {:type/Number {:min 2.0, :max 74.0, :avg 29.98}}})}
     :price       {:special_type :type/Category
                   :base_type    (data/expected-base-type->actual :type/Integer)
                   :name         (data/format-name "price")
                   :display_name "Price"
                   :fingerprint  {:global {:distinct-count 4}, :type {:type/Number {:min 1.0, :max 4.0, :avg 2.03}}}}
     :longitude   {:special_type :type/Longitude
                   :base_type    (data/expected-base-type->actual :type/Float)
                   :name         (data/format-name "longitude")
                   :fingerprint  {:global {:distinct-count 84}, :type {:type/Number {:min -165.374, :max -73.953, :avg -115.998}}}
                   :display_name "Longitude"}
     :latitude    {:special_type :type/Latitude
                   :base_type    (data/expected-base-type->actual :type/Float)
                   :name         (data/format-name "latitude")
                   :display_name "Latitude"
                   :fingerprint  {:global {:distinct-count 94}, :type {:type/Number {:min 10.065, :max 40.779, :avg 35.506}}}}
     :name        {:special_type :type/Name
                   :base_type    (data/expected-base-type->actual :type/Text)
                   :name         (data/format-name "name")
                   :display_name "Name"
                   :fingerprint  {:global {:distinct-count 100}, :type {:type/Text {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :average-length 15.63}}}})))

(defn venues-cols
  "`cols` information for all the columns in `venues`."
  []
  (mapv venues-col [:id :name :category_id :latitude :longitude :price]))

;; #### checkins
(defn checkins-col
  "Return column information for the `checkins` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (data/id :checkins)
    :id       (data/id :checkins col)}
   (case col
     :id       {:special_type :type/PK
                :base_type    (data/id-field-type)
                :name         (data/format-name "id")
                :display_name "ID"}
     :venue_id {:extra_info   (if (data/fks-supported?)
                                {:target_table_id (data/id :venues)}
                                {})
                :target       (target-field (venues-col :id))
                :special_type (when (data/fks-supported?)
                                :type/FK)
                :base_type    (data/expected-base-type->actual :type/Integer)
                :name         (data/format-name "venue_id")
                :display_name "Venue ID"
                :fingerprint  (if (data/fks-supported?)
                                {:global {:distinct-count 100}}
                                {:global {:distinct-count 100}, :type {:type/Number {:min 1.0, :max 100.0, :avg 51.965}}})}
     :user_id  {:extra_info   (if (data/fks-supported?) {:target_table_id (data/id :users)}
                                  {})
                :target       (target-field (users-col :id))
                :special_type (if (data/fks-supported?)
                                :type/FK
                                :type/Category)
                :base_type    (data/expected-base-type->actual :type/Integer)
                :name         (data/format-name "user_id")
                :display_name "User ID"
                :fingerprint  (if (data/fks-supported?)
                                {:global {:distinct-count 15}}
                                {:global {:distinct-count 15}, :type {:type/Number {:min 1.0, :max 15.0, :avg 7.929}}})})))


;;; #### aggregate columns

(defn aggregate-col
  "Return the column information we'd expect for an aggregate column. For all columns besides `:count`, you'll need to
  pass the `Field` in question as well.

    (aggregate-col :count)
    (aggregate-col :avg (venues-col :id))"
  {:arglists '([ag-col-kw] [ag-col-kw field])}
  ([ag-col-kw]
   (case ag-col-kw
     :count {:base_type    :type/Integer
             :special_type :type/Number
             :name         "count"
             :display_name "count"
             :id           nil
             :table_id     nil
             :description  nil
             :settings     nil
             :source       :aggregation
             :extra_info   {}
             :target       nil}))
  ([ag-col-kw {:keys [base_type special_type]}]
   {:pre [base_type special_type]}
   {:base_type    base_type
    :special_type special_type
    :id           nil
    :table_id     nil
    :description  nil
    :settings     nil
    :source       :aggregation
    :extra_info   {}
    :target       nil
    :name         (name ag-col-kw)
    :display_name (name ag-col-kw)}))

(defn breakout-col [column]
  (assoc column :source :breakout))

;; TODO - maybe this needs a new name now that it also removes the results_metadata
(defn booleanize-native-form
  "Convert `:native_form` attribute to a boolean to make test results comparisons easier. Remove `data.results_metadata`
  as well since it just takes a lot of space and the checksum can vary based on whether encryption is enabled."
  [m]
  (-> m
      (update-in [:data :native_form] boolean)
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

(defn format-rows-by
  "Format the values in result ROWS with the fns at the corresponding indecies in FORMAT-FNS. ROWS can be a sequence
  or any of the common map formats we expect in QP tests.

    (format-rows-by [int str double] [[1 1 1]]) -> [[1 \"1\" 1.0]]

  By default, does't call fns on `nil` values; pass a truthy value as optional param FORMAT-NIL-VALUES? to override
  this behavior."
  {:style/indent 1}
  ([format-fns rows]
   (format-rows-by format-fns (not :format-nil-values?) rows))
  ([format-fns format-nil-values? rows]
   (cond
     (= (:status rows) :failed) (do (println "Error running query:" (u/pprint-to-str 'red rows))
                                    (throw (ex-info (:error rows) rows)))

     (:data rows) (update-in rows [:data :rows] (partial format-rows-by format-fns))
     (:rows rows) (update    rows :rows         (partial format-rows-by format-fns))
     :else        (vec (for [row rows]
                         (vec (for [[f v] (partition 2 (interleave format-fns row))]
                                (when (or v format-nil-values?)
                                  (try (f v)
                                       (catch Throwable e
                                         (printf "(%s %s) failed: %s" f v (.getMessage e))
                                         (throw e)))))))))))

(def ^{:arglists '([results])} formatted-venues-rows
  "Helper function to format the rows in RESULTS when running a 'raw data' query against the Venues test table."
  (partial format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]))

(defn data
  "Return the result `data` from a successful query run, or throw an Exception if processing failed."
  {:style/indent 0}
  [results]
  (when (= (:status results) :failed)
    (println "Error running query:" (u/pprint-to-str 'red results))
    (throw (ex-info (:error results) results)))
  (:data results))

(defn rows
  "Return the result rows from query `results`, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (vec (or (:rows (data results))
           (println (u/pprint-to-str 'red results)) ; DEBUG
           (throw (Exception. "Error!")))))

(defn rows+column-names
  "Return the result rows and column names from query RESULTS, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  {:rows    (rows results)
   :columns (get-in results [:data :columns])})

(defn first-row
  "Return the first row in the RESULTS of a query, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (first (rows results)))

(defn supports-report-timezone?
  "Returns truthy if `ENGINE` supports setting a timezone"
  [engine]
  (-> engine
      driver/engine->driver
      driver/features
      (contains? :set-timezone)))

(defmacro with-h2-db-timezone
  "This macro is useful when testing pieces of the query pipeline (such as expand) where it's a basic unit test not
  involving a database, but does need to parse dates"
  [& body]
  `(du/with-effective-timezone {:engine   :h2
                                :timezone "UTC"
                                :name     "mock_db"
                                :id       1}
    ~@body))
