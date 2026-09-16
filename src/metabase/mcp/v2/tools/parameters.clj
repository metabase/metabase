(ns metabase.mcp.v2.tools.parameters
  "The v2 MCP `get_parameter_values` tool: the valid values behind a dashboard or question filter.

   It can't ride `get_content` as an include — it takes its own arguments (a parameter id, a
   prefix `query`, chain-filter `constraints`) — so it is its own tool. Read permission on the
   dashboard or card is the whole gate: a caller who can read it can look up its filter values
   without query permission on the underlying table, and sandboxing still narrows the values
   themselves.

   Both object-dependent arguments are checked against the resolved object before any values are
   fetched. An unknown `parameter_id` answers with the ids that do exist. A `constraints` key is
   rejected — rather than silently dropped — when it names no dashboard parameter, when it names
   one that resolves to no queryable field (chain filtering can't use it), when its field has no FK
   join path to the target parameter's table (chain filtering would ignore it), or when the target
   parameter draws its values from a fixed list or a card (a source that never consults
   constraints). A dropped constraint would hand back values the agent believes were filtered.

   Scope note: this is content-read (`agent:content:read`), NOT the `agent:sql:run` + kill switch
   that the native-query source in `question_write` carries — deliberately. Fetching values does run
   warehouse queries under the hood, but only Metabase-generated MBQL over the object's own fields or
   the object's *stored* (already-read-checked) values-source card; it never executes caller-supplied
   SQL.

   That holds only while every caller-supplied value stays a value. `constraints` is compiled into
   the chain-filter query, so a value shaped like an MBQL clause used to be compiled as one — which
   let a caller with no query permission at all compare two columns and read the rows that matched.
   [[::constraint-value]] is what keeps the claim above true; widening it reopens that path."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.field :as parameters.field]
   [metabase.parameters.params :as params]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 100)

;; The backends cap at 1000 (`parameters.dashboard/result-limit`, `custom-values/*max-rows*`), so
;; a limit above it could never be filled.
(def ^:private max-limit 1000)

;;; ------------------------------------------------ Parameter lookup ----------------------------------------------

(defn- parameter-catalog
  "The `id (name)` list a teaching error names when a parameter id doesn't match."
  [params]
  (or (not-empty
       (str/join ", " (map (fn [{param-id :id param-name :name}]
                             (cond-> (u/qualified-name param-id)
                               (not (str/blank? param-name)) (str " (" param-name ")")))
                           params)))
      "none"))

(defn- check-parameter-id!
  [target parameter-id params]
  (when-not (some #(= parameter-id (u/qualified-name (:id %))) params)
    (common/throw-teaching-error
     (format "This %s has no parameter %s — pass one of its parameter ids (get_content returns them under `parameters`). Available: %s."
             target (pr-str parameter-id) (parameter-catalog params)))))

(defn- card-parameters
  "A card's parameters, falling back to its native query's template tags viewed as parameters."
  [card]
  (or (seq (:parameters card))
      (queries/card-template-tag-parameters card)))

;;; --------------------------------------------------- Fetching ---------------------------------------------------

(defn- temporal-field?
  "Whether `add-filter` would treat `field-id` as temporal — it tests the Lib column's effective type,
   which `lib-be/instance->metadata` carries over from the Field's `effective_type` (`base_type` when
   unset)."
  [field-id]
  (let [{:keys [base_type effective_type]} (mcp.db/field-types field-id)]
    (isa? (or effective_type base_type) :type/Temporal)))

(defn- parses-as-date?
  "Whether `value` yields a date filter for `field-id`. Runs the same call `add-filter` makes, so this
   can't disagree with it about what parses."
  [value field-id]
  (try
    (some? (params.dates/date-string->filter value field-id))
    (catch Throwable _ false)))

(defn- check-constraints!
  "Reject a constraints key that chain filtering would silently drop rather than apply — so the
   caller never gets unnarrowed values believing they were filtered. Four drop paths:
   the key names no dashboard parameter; it resolves to no queryable field (unmapped, or mapped
   only via field-refs or a SQL text variable); its field has no FK join path to the target
   parameter's field within chain filtering's traversal limit; or its value is a string on a
   temporal field that won't parse as a date.

   The join-path check must match what fetching actually does. `parameters.dashboard/param-values`
   runs a SEPARATE `chain-filter` per target field-id and UNIONS the resulting values, passing the
   constraints to every run; `add-filters` silently drops a constraint on any run whose source table
   can't reach the constraint's field. So a single unreachable target field-id leaks its own
   unnarrowed values into the union. Honesty therefore requires the constraint be reachable from
   EVERY target field-id, not merely some — reachability from one field is not enough when another
   field's run drops the filter and contributes unfiltered values. We probe each target field-id with
   `chain-filter/filterable-field-ids` (which builds the same query the fetch will) and reject unless
   the constraint survives on all of them.

   `target-param` is the parameter whose values are being fetched; `resolved-params` is the
   dashboard's full parameter map."
  [target-param resolved-params constraints]
  ;; First reject the two per-key problems (unknown key, no queryable field) — these must run before
  ;; any field resolution, since an unknown key has no param to resolve fields from.
  (doseq [param-key (keys constraints)]
    (let [param (get resolved-params param-key)]
      (cond
        (nil? param)
        (common/throw-teaching-error
         (format "This dashboard has no parameter %s — each constraints key names another of its filters and the value is that filter's current selection. Available: %s."
                 (pr-str param-key) (parameter-catalog (vals resolved-params))))

        (empty? (params/dashboard-param->field-ids param))
        (common/throw-teaching-error
         (format "Constraint %s can't narrow this filter — it isn't mapped to a queryable field, so chain filtering would silently ignore it. Drop it from constraints."
                 (pr-str param-key))))))
  ;; Every constraint now maps to a field. Compute, per target field-id, which constraint fields are
  ;; reachable from it; a constraint is honestly applied only when reachable from EVERY target field-id
  ;; (see the docstring — the fetch unions per-field runs and drops the filter on any run that can't
  ;; reach it). `filterable-field-ids` builds the same query add-filters runs, so this can't diverge.
  (let [target-field-ids     (params/dashboard-param->field-ids target-param)
        constraint-field-ids (into #{} (mapcat #(params/dashboard-param->field-ids (get resolved-params %)))
                                   (keys constraints))
        ;; Intersect the reachable sets across target fields: a constraint field is kept only if every
        ;; target field-id's run can reach it. (One target field-id degenerates to that field's set.)
        reachable-everywhere (transduce (map #(chain-filter/filterable-field-ids % constraint-field-ids))
                                        (completing (fn [acc s] (if acc (set/intersection acc s) s)))
                                        nil
                                        target-field-ids)]
    (doseq [param-key (keys constraints)]
      (when (empty? (set/intersection (params/dashboard-param->field-ids (get resolved-params param-key))
                                      (or reachable-everywhere #{})))
        (common/throw-teaching-error
         (if (empty? target-field-ids)
           ;; No target fields at all: chain filtering falls back to `filter-values-from-field-refs`,
           ;; which ignores constraints outright. Blaming the join path would misdiagnose it.
           (format "This parameter's values come from a card's own column rather than a queryable field, so constraints can't narrow it — chain filtering would silently ignore %s. Fetch without constraints."
                   (pr-str param-key))
           (format "Constraint %s can't narrow this filter — its field has no join path to this parameter's table (or reaches only some of the fields it maps to), so chain filtering would silently ignore it. Drop it from constraints."
                   (pr-str param-key)))))))
  ;; The last drop path is in the value rather than the field: `add-filter` routes a string value on a
  ;; temporal field through `date-string->filter` and catches a parse failure into a dropped filter.
  (doseq [[param-key value] constraints
          :when             (string? value)
          field-id          (params/dashboard-param->field-ids (get resolved-params param-key))
          :when             (temporal-field? field-id)]
    (when-not (parses-as-date? value field-id)
      (common/throw-teaching-error
       (format "Constraint %s is a date filter, and %s isn't a date it can parse — chain filtering would silently ignore it. Pass a day (\"2024-01-31\"), a range (\"2024-01-01~2024-03-31\"), or a relative window (\"past30days\", \"thismonth\")."
               (pr-str param-key) (pr-str value))))))

(def ^:private no-values
  {:values [] :has_more_values false})

(def ^:private date-accepts
  "The grammar a date parameter's value is written in. Templates rather than sample dates: the
   concrete dates of the column are `min` and `max`, and a caller that confuses an example for a
   bound filters on the wrong day. One list covers every date subtype — the QP runs the whole
   decoder set no matter which one the parameter declares, so the subtype narrows the widget
   rather than what the API accepts."
  ["YYYY-MM-DD" "YYYY-MM-DD~YYYY-MM-DD" "past30days" "thisyear"])

(defn- range-shaped-date-param?
  "Whether this parameter's values should come back as a range rather than a list. True for a date
   parameter drawing values from a column, where the distinct dates are pages of noise and the
   useful answer is the span they cover. A date parameter with a static-list or card source is
   excluded: those dates are a curated set to pick from, and a range would throw the set away."
  [param]
  (and (nil? (:values_source_type param))
       (some-> (:type param) keyword params.dates/date-type?)))

(defn- valueless-dashboard-param?
  "True when a dashboard filter has nothing behind it to fetch values from: no values source, and no
   dashcard mapping to supply a field. Chain filtering has nothing to query in that case."
  [param]
  (and (nil? (:values_source_type param))
       (empty? (:mappings param))))

(defn- valueless-card-param?
  "True when a card parameter has nothing behind it to fetch values from: no values source, and no
   field under its target. A free-text template tag is the common case."
  [card param]
  (and (nil? (:values_source_type param))
       (nil? (params/param-target->field-id (:target param) card))))

(defn- check-no-query-for-range!
  "A range has nothing to search: `query` narrows a list of values by text, and the answer here is two
   dates and a grammar. Silently ignoring it would hand back the column's whole span as though it had
   been narrowed."
  [query]
  (when query
    (common/throw-teaching-error
     "This is a date parameter, so it answers with its column's range rather than a list of values — there is no list for `query` to search. Drop `query` and filter within the `min`/`max` it returns, using the forms in `accepts`.")))

(defn- fetch-dashboard-values
  "The value list for a dashboard parameter. `*param-values-query*` is what lets a caller who can read
   the dashboard look up its filter values without query permission on the underlying table. The
   search path additionally pins remapping to the field actually being filtered (#59020)."
  [dash parameter-id query constraints]
  (binding [qp.perms/*param-values-query* true]
    (if query
      (binding [chain-filter/*allow-implicit-uuid-field-remapping* false]
        (parameters.dashboard/param-values dash parameter-id constraints query))
      (parameters.dashboard/param-values dash parameter-id constraints))))

(defn- dashboard-values
  [id-or-eid parameter-id query constraints]
  (let [dash            (-> (v2.resolve/resolve-and-read :model/Dashboard id-or-eid)
                            (t2/hydrate :resolved-params))
        resolved-params (:resolved-params dash)
        constraints     (update-keys constraints u/qualified-name)
        param           (get resolved-params parameter-id)]
    (check-parameter-id! "dashboard" parameter-id (vals resolved-params))
    ;; A static-list or card values source never consults the chain-filter constraints, so applying
    ;; them would silently do nothing — reject rather than hand back a list the caller thinks was
    ;; narrowed.
    (when (and (seq constraints) (some? (:values_source_type param)))
      (common/throw-teaching-error
       "This parameter's values come from a fixed list or a card, not a chain-filterable field, so constraints can't narrow it — fetch without constraints."))
    (check-constraints! param resolved-params constraints)
    (cond
      ;; Chain filtering raises on an unmapped parameter; an empty value list is the honest answer,
      ;; and the one target "question" gives for the same shape of parameter.
      (valueless-dashboard-param? param)
      no-values

      (range-shaped-date-param? param)
      (do
        (check-no-query-for-range! query)
        ;; `param-range` answers nil for a parameter mapped only by field-ref, which has no column to
        ;; aggregate — listing its values is then the only answer available.
        (or (some-> (binding [qp.perms/*param-values-query* true]
                      (parameters.dashboard/param-range dash parameter-id constraints))
                    (assoc ::date-range true))
            (fetch-dashboard-values dash parameter-id query constraints)))

      :else
      (fetch-dashboard-values dash parameter-id query constraints))))

(defn- question-values
  [id-or-eid parameter-id query]
  (let [card   (v2.resolve/resolve-and-read :model/Card id-or-eid)
        params (card-parameters card)]
    (check-parameter-id! "question" parameter-id params)
    (let [param (some #(when (= parameter-id (u/qualified-name (:id %))) %) params)]
      ;; `card-param-values` answers nil for a valueless parameter, which its own output schema
      ;; rejects — so the tool decides this case rather than calling and catching.
      (cond
        (valueless-card-param? card param)
        no-values

        ;; Field-backed source (no `values_source_type`): `card-param-values` would route to
        ;; `search-values-from-field-id`, which lies to an agent two ways — it reports
        ;; `has_more_values false` even when the fetch fills its 1000-row cap (a truncated list read as
        ;; complete), and it swallows a fetch error into `[]` (a warehouse/sandbox failure read as "no
        ;; values"). The strict variant reports a truthful floor at the cap and lets the error surface as
        ;; an isError, matching the dashboard path. Static-list and card sources already report
        ;; `has_more_values` truthfully, so they keep the normal path.
        (nil? (:values_source_type param))
        (let [field-id (params/param-target->field-id (:target param) card)]
          (if (range-shaped-date-param? param)
            (do
              (check-no-query-for-range! query)
              (-> (binding [qp.perms/*param-values-query* true]
                    (chain-filter/chain-filter-range field-id nil))
                  (assoc ::date-range true)))
            (binding [qp.perms/*param-values-query* true]
              (parameters.field/search-values-from-field-id-strict field-id query))))

        :else
        (binding [qp.perms/*param-values-query* true]
          (queries/card-param-values card parameter-id query))))))

;;; --------------------------------------------------- Response ---------------------------------------------------

(defn- steering-line
  "The sentence appended when the page isn't the whole story. `total` is what the backend
   returned; `more?` marks it as a floor — the source held more than the backend's 1000-row cap.
   `query` is the caller's search, when there was one: an empty result means something different
   with a search in hand, and the recovery it points at is different too."
  [{:keys [returned total more? offset limit query]}]
  (cond
    (and (zero? total) query)
    (format "No values match %s — try a shorter or less specific search, or omit `query` to list every value."
            (pr-str query))

    (zero? total)
    "No values available for this parameter — its source may be empty, filtered to nothing for you, or a free-text filter with no value list."

    (zero? returned)
    (if more?
      (format "No values at offset %d — the source stopped at %d before returning everything; narrow with `query` rather than paging further."
              offset total)
      (format "No values at offset %d — %d available." offset total))

    :else
    (or (common/truncation-line {:param :query :offset offset :limit limit :returned returned
                                 :total total :total-floor? more?})
        (when more?
          (format "Returned %d — the source holds more values than it will return; narrow with `query` to reach the rest."
                  returned)))))

(defn- values-content
  "Slice `limit`/`offset` out of the backend's value list and render the response. `has_more_values`
   stays true when the slice dropped values, not only when the backend hit its own cap — a page is
   never reported as the whole set."
  [{:keys [values has_more_values]} limit offset query]
  (let [values   (vec values)
        total    (count values)
        page     (if (< offset total)
                   (subvec values offset (min total (+ offset limit)))
                   [])
        payload  {:values          page
                  :returned        (count page)
                  :has_more_values (boolean (or has_more_values (< (+ offset (count page)) total)))}
        line     (steering-line {:returned (count page) :total total :more? (boolean has_more_values)
                                 :offset offset :limit limit :query query})]
    (common/success-content (cond-> (json/encode payload)
                              line (str "\n" line)))))

(defn- ->day
  "The `YYYY-MM-DD` day of one fetched value, or nil when it isn't date-shaped. A timestamp column
   yields its values with a time part (`2013-01-03T00:00:00Z`), and handing those back would
   contradict the `YYYY-MM-DD` grammar in the same response. Truncating is safe at both ends
   because a day bound is inclusive: the day holding the earliest value is still a floor under it,
   and the day holding the latest is still a ceiling over it."
  [value]
  (some->> value str not-empty (re-find #"^\d{4}-\d{2}-\d{2}")))

(defn- date-range-content
  "Render a date parameter as the span its column covers plus the grammar to write a value in. The
   span comes from an aggregation over the whole column, so `max` is the column's last date rather
   than the last of a capped page — the reason this path doesn't reuse the value list."
  [{:keys [distinct-count] lo :min hi :max}]
  (let [payload (cond-> {:kind    "date"
                         :min     (->day lo)
                         :max     (->day hi)
                         :accepts date-accepts}
                  ;; Absent for a parameter mapped to several columns, whose distinct values only a
                  ;; union could count. Omitted rather than guessed at.
                  distinct-count (assoc :distinct_dates distinct-count))
        line    (when-not (->day lo)
                  "No dates available for this parameter — its column may be empty, or filtered to nothing for you.")]
    (common/success-content (cond-> (json/encode payload)
                              line (str "\n" line)))))

;;; --------------------------------------------------- The tool ---------------------------------------------------

(mr/def ::constraint-scalar
  "One filter selection: a literal the chain filter binds as a value."
  [:or :string :int :double :boolean])

(mr/def ::constraint-value
  "A filter's current selection — one literal, or several for a multi-select.

  Deliberately narrow, and the narrowness is the security boundary rather than tidiness. Chain
  filtering compiles these into MBQL, so a value shaped like a clause is compiled as one:
  `[[\"field\" 49 nil]]` becomes a reference to that column and the server compares one column
  against another, handing back the rows where they match. That reads data the caller may hold no
  query permission for — this tool runs its lookups under `*param-values-query*` precisely so a
  caller who can only READ a dashboard can still see its filter values — and it reaches columns
  marked `visibility_type: sensitive`, which exist to be unreachable. A name-shaped reference
  (`[[\"field\" {\"base-type\" \"type/Integer\"} \"CATEGORY_ID\"]]`) does the same without needing a
  field id.

  Accepting only scalars and sequences of scalars refuses every clause shape at the boundary, before
  anything is compiled — rather than blacklisting the clause forms known today.
  `constraints-value-must-not-name-a-column-test` pins it."
  [:or ::constraint-scalar [:sequential ::constraint-scalar]])

(def ^:private get-parameter-values-args-schema
  [:map {:closed true}
   [:target [:enum {:description "Whether id names a dashboard or a card. \"question\" covers any card — question, model, or metric."}
             "dashboard" "question"]]
   [:id [:or
         [:int {:description "Numeric id."}]
         [:string {:min 1 :description "A 21-character entity_id."}]]]
   [:parameter_id
    [:string {:min 1 :description "The parameter's id, as returned by get_content under `parameters` — not its name or slug."}]]
   [:query {:optional true}
    [:maybe [:string {:min 1 :description "Return only values matching this search string. Use it to narrow a large value list."}]]]
   [:constraints {:optional true}
    [:maybe [:map-of {:description "Chain filtering: the current selections of the dashboard's OTHER filters, keyed by their parameter ids, narrowing this filter to the values still valid alongside them. Dashboards only."}
             :keyword ::constraint-value]]]
   [:limit {:optional true}
    [:maybe [:int {:min 1 :max max-limit :description "Maximum values to return in this call (default 100, max 1000)."}]]]
   [:offset {:optional true}
    [:maybe [:int {:min 0 :description "Index of the first value to return (default 0) — continue a truncated response. Each page refetches from the source, which returns at most 1000 values, so narrow with `query` rather than paging to reach anything past that."}]]]])

(registry/deftool get-parameter-values
  "Fetch the valid values for one filter on a dashboard or saved question, so you filter with real values instead of guessing. Pass target (\"dashboard\" or \"question\" — the latter accepts any card id: question, model, or metric), id (numeric or 21-char entity_id), and parameter_id from get_content's `parameters` (each lists id, name, type). Values come back as [value] pairs, or [value, display_label] when the column is remapped — filter with the first element, show the second. query searches a large list rather than paging it; constraints (dashboards only) chain-filters — pass the other filters' current selections keyed by parameter id to get only the values still valid alongside them. Paged with limit (default 100, max 1000) and offset. A parameter with nothing behind it (e.g. a free-text template tag) returns no values. A column-backed date parameter answers with its range instead of a value list — {kind: \"date\", min, max, distinct_dates, accepts} — where accepts is the grammar to write a value in (\"YYYY-MM-DD\", \"YYYY-MM-DD~YYYY-MM-DD\", \"past30days\", \"thisyear\") and min/max are the column's real first and last dates to write between. constraints narrow the range as they narrow a list; query, limit and offset don't apply to it. Pair with run_saved_question, which takes these values as its `parameters`."
  {:name        "get_parameter_values"
   :scope       metabot.scope/agent-content-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        get-parameter-values-args-schema}
  [{:keys [target id parameter_id query constraints limit offset]} _context]
  (when (and query (str/blank? query))
    (common/throw-teaching-error
     "`query` is the text to match, so it can't be blank — pass a search string, or omit `query` to list every value."))
  (when (and (seq constraints) (= target "question"))
    (common/throw-teaching-error
     "`constraints` chain-filters a dashboard's filters against each other, so it needs target: \"dashboard\" — a question's parameters are independent and take none."))
  (let [result (if (= target "dashboard")
                 (dashboard-values id parameter_id query constraints)
                 (question-values id parameter_id query))
        ;; The card path still answers nil when a parameter's source card was archived and its target
        ;; has no field to fall back to; an empty value list is the honest answer there too.
        result (or result no-values)]
    (if (::date-range result)
      ;; `limit`/`offset` are dropped rather than applied: the range is one object, not a page of a
      ;; list, and `kind` is what tells the caller its paging arguments had nothing to page.
      (date-range-content result)
      (values-content result
                      (or limit default-limit)
                      (or offset 0)
                      query))))
