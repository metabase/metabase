(ns metabase.product-analytics.compile
  "Builds an analysis's query. The result names every table, join and filter it uses, in ordinary stages, and carries
  the form that built it under `:analysis`."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.analysis :as lib.schema.analysis]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(def compiler-version
  "Bump this when a compiler's stages change for the same analysis. A query from an earlier version can't be checked
  against this compiler."
  1)

(def periods-column
  "The number of sub-periods an actor was active in."
  "periods")

(def actors-column
  "How many actors were active that many sub-periods."
  "actors")

(def avg-events-column
  "Events per active sub-period."
  "avg_events")

(def avg-sessions-column
  "Sessions per active sub-period. Not returned without a session column."
  "avg_sessions")

(defn- role-column
  [metadata-providerable table-id columns role]
  (when-let [column-name (get columns role)]
    (or (m/find-first #(= (:name %) column-name)
                      (lib.metadata/fields metadata-providerable table-id))
        (throw (ex-info (tru "The event table has no column named {0}." (pr-str column-name))
                        {:status-code 400, :role role, :column column-name})))))

(defn- timestamp-column
  [metadata-providerable table-id columns]
  (let [column (role-column metadata-providerable table-id columns :timestamp)]
    (when-not (lib.types.isa/temporal? column)
      (throw (ex-info (tru "The event time column has to be a date or a time.")
                      {:status-code 400, :column (:name column)})))
    column))

(defn- date-range-filter
  [column {range-type :type, :keys [value unit start end]}]
  (case range-type
    "relative" (lib/time-interval column value (keyword unit))
    "absolute" (lib/between column start end)))

(defn- add-filters
  "A clause's uuid is unique to one place in a query, and the same clause stays in `:analysis`."
  [query clauses]
  (reduce #(lib/filter %1 (lib.util/fresh-uuids %2)) query clauses))

(defn- named
  [clause column-name]
  (lib/with-expression-name clause column-name))

(defn- returned
  "The column of the previous stage called `column-name`."
  [query column-name]
  (m/find-first #(= (:lib/source-column-alias %) column-name)
                (lib/orderable-columns query)))

(mu/defn habit-query :- ::lib.schema/query
  "How many distinct sub-periods each actor was active in, and how many actors there are at each count."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table-id              :- ::lib.schema.id/table
   {:keys [columns settings], :as analysis} :- ::lib.schema.analysis/analysis]
  (let [{:keys [date_range grain sub_period active filters]} settings
        role      (partial role-column metadata-providerable table-id columns)
        timestamp (timestamp-column metadata-providerable table-id columns)
        session   (role :session)
        actor     (role (if (= grain "session") :session :person))
        per-actor (cond-> (-> (lib/query metadata-providerable (lib.metadata/table metadata-providerable table-id))
                              (lib/filter (date-range-filter timestamp date_range))
                              (add-filters filters)
                              (add-filters (:filters active))
                              (lib/breakout actor)
                              (lib/aggregate (named (lib/distinct (lib/with-temporal-bucket timestamp (keyword sub_period)))
                                                    periods-column))
                              (lib/aggregate (named (lib/count) "events")))
                    session (lib/aggregate (named (lib/distinct session) "sessions")))
        query     (lib/append-stage per-actor)
        periods   (returned query periods-column)
        events    (returned query "events")
        sessions  (returned query "sessions")]
    (cond-> (-> query
                (lib/breakout periods)
                (lib/aggregate (named (lib/count) actors-column))
                (lib/aggregate (named (lib// (lib/sum events) (lib/sum periods)) avg-events-column))
                (assoc :analysis analysis))
      session (lib/aggregate (named (lib// (lib/sum sessions) (lib/sum periods)) avg-sessions-column)))))
