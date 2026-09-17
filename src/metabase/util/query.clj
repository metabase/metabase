(ns metabase.util.query
  "HoneySQL helpers shared by the per-module `db.clj` namespaces, which all expose their queries as one options map:
  filter keys mirroring the columns of the model's table, plus `:columns`, `:order-by`, `:limit` and `:offset`."
  (:require
   [metabase.util.malli :as mu]))

(def ^:private structural-keys
  #{:columns :order-by :limit :offset})

(mu/defn model-with-columns
  "`model`, narrowed to `columns` when given, for a Toucan 2 select."
  [model   :- :keyword
   columns :- [:maybe [:sequential :keyword]]]
  (if (seq columns)
    (into [model] columns)
    model))

(defn- filter-clause
  [column value set-columns]
  (if-let [nullable-column (get set-columns column)]
    [(if value :not= :=) nullable-column nil]
    (if (set? value)
      [:in column value]
      [:= column value])))

(mu/defn- filters->where
  "The HoneySQL `:where` matching `filters`, where a scalar matches that value and a set matches any of its values.
  `set-columns` maps each `<column>_set` filter key to the column whose nullness it tests, so the mapping is spelled
  out by the caller rather than inferred from the key's name."
  [filters     :- [:maybe [:map-of :keyword :any]]
   set-columns :- [:maybe [:map-of :keyword :keyword]]]
  (into [:and]
        (map (fn [[column value]] (filter-clause column value set-columns)))
        filters))

(mu/defn- order-by->honeysql
  "The HoneySQL `:order-by` for `order-by`, whose entries are either a column (ascending) or a `[column direction]`
  pair. Columns in `lower-columns` are ordered case-insensitively."
  [order-by      :- [:maybe [:sequential [:or :keyword [:tuple :keyword [:enum :asc :desc]]]]]
   lower-columns :- [:maybe [:set :keyword]]]
  (mapv (fn [entry]
          (let [[column direction] (if (vector? entry) entry [entry :asc])]
            [(if (contains? lower-columns column) [:lower column] column) direction]))
        order-by))

(mu/defn opts->honeysql
  "The HoneySQL for `opts`: every key but `:columns`, `:order-by`, `:limit` and `:offset` is a filter. `set-columns`
  and `lower-columns` are the calling namespace's own column declarations, passed through to [[filters->where]] and
  [[order-by->honeysql]]."
  ([opts]
   (opts->honeysql opts nil))
  ([{:keys [order-by limit offset] :as opts} :- [:maybe [:map-of :keyword :any]]
    {:keys [set-columns lower-columns]}      :- [:maybe [:map {:closed true}
                                                         [:set-columns   {:optional true} [:maybe [:map-of :keyword :keyword]]]
                                                         [:lower-columns {:optional true} [:maybe [:set :keyword]]]]]]
   (cond-> {:where (filters->where (apply dissoc opts structural-keys) set-columns)}
     (seq order-by) (assoc :order-by (order-by->honeysql order-by lower-columns))
     limit          (assoc :limit limit)
     offset         (assoc :offset offset))))
