(ns metabase.change-log.db
  "Application database queries for the change-log module."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(mu/defn insert-entries!
  "Adds `entries` to the change log."
  [entries :- [:sequential [:map {:closed true} [:table_name :string] [:row_id :int] [:action :string]]]]
  (t2/insert! :change_log entries))

(mu/defn unnumbered-ids
  "The ids of up to `limit` committed entries that have no `position`, lowest first."
  [limit :- ms/PositiveInt]
  (t2/select-fn-vec :id [:change_log :id] {:where [:= :position nil], :order-by [[:id :asc]], :limit limit}))

(mu/defn highest-position
  "The highest `position` of an entry, or nil when no entry has one."
  []
  (t2/select-one-fn :position :change_log {:select [[[:max :position] :position]]}))

(mu/defn set-positions!
  "Sets the `position` of each entry in `ids` to `start + (id - lowest-id)`."
  [ids       :- [:sequential ms/PositiveInt]
   start     :- ms/PositiveInt
   lowest-id :- ms/PositiveInt]
  (t2/query-one {:update :change_log, :set {:position [:+ start [:- :id lowest-id]]}, :where [:in :id ids]}))

(mu/defn foreign-keys
  "The foreign keys of the app DB's tables, as JDBC's `DatabaseMetaData.getImportedKeys` reports them."
  []
  (t2/with-connection [^Connection conn]
    (let [md      (.getMetaData conn)
          catalog (.getCatalog conn)
          schema  (.getSchema conn)]
      (into []
            (mapcat (fn [{:keys [table_name]}]
                      (with-open [rs (.getImportedKeys md catalog schema table_name)]
                        (doall (resultset-seq rs)))))
            (with-open [rs (.getTables md catalog schema "%" (into-array String ["TABLE"]))]
              (doall (resultset-seq rs)))))))

(mu/defn matching-pks
  "The primary keys of the rows of `model` that match `conditions`."
  [model      :- :keyword
   conditions :- [:schema {::mr/deliberately-open true, :description "what `t2/select` takes after the model"}
                  [:sequential :any]]]
  (apply t2/select-pks-vec model conditions))

(mu/defn rows-where
  "The `columns` of the rows of `table-name` whose `column` is in `values`."
  [table-name :- :string
   column     :- :keyword
   values     :- [:sequential [:or :int :string]]
   columns    :- [:sequential :keyword]]
  (t2/query {:select (vec (distinct columns)), :from [(keyword table-name)], :where [:in column values]}))

(mu/defn rows-to-change
  "The `columns` of the rows that a Toucan write to `model` will change, selected with the write's own `parsed-args`
  and `resolved-query`."
  [model             :- :keyword
   select-query-type :- :keyword
   parsed-args       :- [:schema {::mr/deliberately-open true, :description "the write's Toucan parsed args"} :map]
   resolved-query    :- [:schema {::mr/deliberately-open true, :description "the write's Toucan resolved query"} :any]
   columns           :- [:sequential :keyword]]
  (t2.pipeline/transduce-query (t2.pipeline/default-rf select-query-type)
                               select-query-type
                               model
                               (assoc (dissoc parsed-args :queryable :changes) :columns (vec (distinct columns)))
                               resolved-query))

(mu/defn delete-before-by-id-subquery!
  "Deletes up to `batch-size` entries created before `cutoff`, lowest ids first, and returns how many."
  [cutoff     :- ms/TemporalInstant
   batch-size :- ms/PositiveInt]
  (t2/query-one {:delete-from :change_log
                 :where       [:in :id ^:allow-subquery {:select   [:id]
                                                         :from     :change_log
                                                         :where    [:< :created_at [:auto/param cutoff]]
                                                         :order-by [[:id :asc]]
                                                         :limit    batch-size}]}))

(mu/defn delete-before-with-limit!
  "Deletes up to `batch-size` entries created before `cutoff`, and returns how many."
  [cutoff     :- ms/TemporalInstant
   batch-size :- ms/PositiveInt]
  (t2/query-one {:delete-from :change_log
                 :where       [:< :created_at [:auto/param cutoff]]
                 :limit       batch-size}))
