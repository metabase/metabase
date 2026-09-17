(ns metabase.util.query
  "Toucan 2 argument helpers shared by the per-module `db.clj` namespaces, which all expose their queries as one
  options map: filter keys mirroring the columns of the model's table, plus `:columns`, `:order-by`, `:limit` and
  `:offset`.

  Filters become Toucan 2 key/value condition arguments rather than a HoneySQL `:where` clause. That is not a style
  choice: a HoneySQL `:where` skips the model's `:in` transforms and its default conditions, so `[:= :type :full]`
  compiles to `\"TYPE\" = \"FULL\"` — comparing against a column named `FULL` — while `:type :full` compiles to
  `\"TYPE\" = ?` with `\"full\"` bound, and still picks up conditions like FieldValues' `hash_key IS NULL`.

  These take the filters map itself, whose keys vary per model, so they are plain functions — the per-model `::opts`
  schema on each `db.clj` query is what validates a caller's options.")

(def ^:private structural-keys
  #{:columns :order-by :limit :offset})

(defn model-with-columns
  "`model`, narrowed to `columns` when given, for a Toucan 2 select."
  [model columns]
  (if (seq columns)
    (into [model] columns)
    model))

(defn model-with-pk-columns
  "Like [[model-with-columns]], but keeps `pk-column` even when `columns` leaves it out — a pk->instance map has
  nothing to key by without it."
  [model pk-column columns]
  (model-with-columns model (when (seq columns) (distinct (cons pk-column columns)))))

(defn- filter-kv
  [column value set-columns]
  (if-let [nullable-column (get set-columns column)]
    [nullable-column (when value [:not= nil])]
    [column (if (set? value) [:in value] value)]))

(defn opts->kv-args
  "The filters in `opts` as a flat vector of Toucan 2 key/value condition arguments, dropping the structural options.
  A scalar matches that value, a set becomes `[:in ...]`, and a `<column>_set` key becomes a null check on the column
  `set-columns` maps it to, so the mapping is spelled out by the caller rather than inferred from the key's name."
  ([opts]
   (opts->kv-args opts nil))
  ([opts {:keys [set-columns]}]
   (into []
         (mapcat (fn [[column value]] (filter-kv column value set-columns)))
         (apply dissoc opts structural-keys))))

(defn- order-by->honeysql
  [order-by lower-columns]
  (mapv (fn [entry]
          (let [[column direction] (if (vector? entry) entry [entry :asc])]
            [(if (contains? lower-columns column) [:lower column] column) direction]))
        order-by))

(defn opts->args
  "The Toucan 2 arguments for `opts`: the filters as key/value condition arguments, followed by a HoneySQL map
  carrying `:order-by`, `:limit` and `:offset` when any of them are given. An `:order-by` entry is a column
  (ascending) or a `[column direction]` pair; a column in `lower-columns` is ordered case-insensitively.

  `:columns` is not included — pass it to [[model-with-columns]] instead."
  ([opts]
   (opts->args opts nil))
  ([{:keys [order-by limit offset] :as opts} {:keys [lower-columns] :as config}]
   (let [honeysql (cond-> {}
                    (seq order-by) (assoc :order-by (order-by->honeysql order-by lower-columns))
                    limit          (assoc :limit limit)
                    offset         (assoc :offset offset))]
     (cond-> (opts->kv-args opts config)
       (seq honeysql) (conj honeysql)))))
