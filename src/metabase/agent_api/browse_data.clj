(ns metabase.agent-api.browse-data
  "The v2 `browse_data` tool: one tool for the whole data hierarchy.

   The action is a named enum — `list_databases`, `list_schemas`, `list_tables`, `list_models`,
   `get_fields` — never inferred from which arguments happen to be present: argument-presence dispatch
   is an unnamed enum that strict clients cannot validate and transcripts cannot read.

   Every action delegates to the domain function its public REST endpoint calls, so the permission
   filtering is the endpoint's own and cannot drift: databases through
   [[metabase.warehouses.browse/visible-databases]], schemas through
   [[metabase.warehouses.browse/database-schemas]], tables through
   [[metabase.warehouses.browse/schema-tables-list]] (or, unscoped,
   [[metabase.warehouses.browse/database-tables-list]]), fields through the (sandbox-aware)
   [[metabase.warehouse-schema.table/batch-fetch-table-query-metadatas]]. Models have no REST listing
   endpoint, so `list_models` shares [[metabase.metabot.tools.resources/database-models]] with the v1
   resource reader.

   Bounding differs by action shape. The `list_*` actions page with `limit`/`offset`, cut the page back to
   the response budget, and steer with a truncation message naming the narrowing parameter. `get_fields`
   takes explicit ids, so its bound is the response budget alone, with per-table fault isolation: complete
   tables until the budget runs out, then the rest named in `omitted` — never a silent half-table, because
   a truncated column list reads as \"that's all the columns\" and corrupts the query the agent writes
   next. A table too wide to fit a response on its own comes back as an explicit slice — fields in position
   order with returned/total counts and the `offset` to continue from — and the other requested tables are
   omitted, because a slice next to whole tables would be two bounding rules in one response. The rule bans
   silent truncation, not slicing."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.metabot.tools.resources :as metabot-resources]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.warehouses.browse :as warehouses.browse]))

(set! *warn-on-reflection* true)

(def actions
  "Every `action` the tool accepts."
  ["list_databases" "list_schemas" "list_tables" "list_models" "get_fields"])

(def default-limit
  "Rows per page when a `list_*` call names no `limit`."
  50)

(def max-limit
  "The most rows one `list_*` page returns."
  200)

(def max-tables-per-call
  "The most tables one `get_fields` call may name."
  20)

(def ^:private sample-values-limit
  "Sample values per field on a detailed `get_fields` read. A sample, not the value list — the full
   list is the `get_parameter_values` tool's job."
  20)

(def ^:private Params
  "The arguments [[browse-data]] contracts on. `POST /v2/browse-data` declares the wire schema, with the
   enums and the bounds a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:action          (into [:enum] actions)]
   [:database_id     {:optional true} [:maybe [:or :int :string]]]
   [:schema          {:optional true} [:maybe :string]]
   [:search          {:optional true} [:maybe :string]]
   [:table_ids       {:optional true} [:maybe [:sequential [:or :int :string]]]]
   [:include_hidden  {:optional true} [:maybe :boolean]]
   [:limit           {:optional true} [:maybe :int]]
   [:offset          {:optional true} [:maybe :int]]
   [:fields          {:optional true} [:maybe [:sequential :string]]]
   [:response_format {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(def ^:private actions-requiring-database
  #{"list_schemas" "list_tables" "list_models"})

(defn- check-action-args!
  "Per-action argument requirements, enforced at runtime with teaching errors — the schema only
   requires `action` itself, so a strict client's always-send-every-property shape validates."
  [{:keys [action database_id schema search table_ids fields limit offset]}]
  (when (and (actions-requiring-database action) (nil? database_id))
    (tools/teaching-error!
     (str "`" action "` requires `database_id`. Find one with `action: \"list_databases\"`.")))
  (when (and (some? schema) (not= "list_tables" action))
    (tools/teaching-error! "`schema` only scopes `list_tables`. Drop it, or switch the action."))
  (when (and (some? search) (not= "list_tables" action))
    (tools/teaching-error! "`search` only filters `list_tables`. Drop it, or switch the action."))
  (when (and (seq table_ids) (not= "get_fields" action))
    (tools/teaching-error! "`table_ids` only applies to `get_fields`. Drop it, or switch the action."))
  (when (and (seq fields) (#{"list_schemas" "get_fields"} action))
    (tools/teaching-error!
     (str "`fields` picks fields from a record, and `" action "` returns none to pick from. Drop it, or "
          "switch the action.")))
  (when (= "get_fields" action)
    (when (empty? table_ids)
      (tools/teaching-error!
       (str "`get_fields` requires `table_ids` — up to " max-tables-per-call " table ids per call. Find "
            "them with `action: \"list_tables\"`.")))
    (when (> (count table_ids) max-tables-per-call)
      (tools/teaching-error!
       (str "`get_fields` takes at most " max-tables-per-call " tables per call — you asked for "
            (count table_ids) ". Split the request.")))
    (when (some? limit)
      (tools/teaching-error!
       (str "`limit` pages the `list_*` actions. `get_fields` bounds itself by response budget: a too-wide "
            "table comes back as an explicit slice with the `offset` to continue from.")))
    (when (and (some? offset) (not= 1 (count table_ids)))
      (tools/teaching-error!
       (str "`offset` applies to `get_fields` only with a single table in `table_ids` — it continues a "
            "table too wide for one response.")))))

;;; ──────────────────────────────────────────────────────────────────
;;; The list_* actions — page, project, steer
;;; ──────────────────────────────────────────────────────────────────

(defn- paged
  "The bounded envelope over the full `rows` set the domain function returned: slice the page and hand it to
   the shared envelope. The backing endpoints return full sets, so `total` is always exact."
  [rows {:keys [limit offset] :as params} opts]
  (let [limit  (tools/clamp-limit limit default-limit max-limit)
        offset (or offset 0)
        rows   (vec rows)]
    (tools/paged-envelope (tools/page-of rows limit offset)
                          (merge {:limit           limit
                                  :offset          offset
                                  :total           (count rows)
                                  :response-format (:response_format params)
                                  :fields          (:fields params)}
                                 opts))))

(defn- list-databases
  [params]
  (paged (warehouses.browse/visible-databases) params
         {:spec (projections/spec :database) :noun "databases"}))

(defn- list-schemas
  [{:keys [database_id include_hidden] :as params}]
  (let [db-id (tools/resolve-id :model/Database database_id)]
    (paged (warehouses.browse/database-schemas db-id {:include-hidden? (boolean include_hidden)})
           params
           {:noun "schemas"})))

(defn- schema-tables
  "The tables of one schema, through the same domain function `GET /api/database/:id/schema/:schema`
   calls. A blank `schema` is the no-schema case, which REST serves from its own route by combining
   the `nil` and `\"\"` spellings — [[warehouses.browse/database-schemas]] reports both as `\"\"`."
  [db-id schema include-hidden?]
  (let [opts {:include-hidden? include-hidden?}]
    (if (str/blank? schema)
      (concat (warehouses.browse/schema-tables-list db-id nil opts)
              (warehouses.browse/schema-tables-list db-id "" opts))
      (warehouses.browse/schema-tables-list db-id schema opts))))

(defn- list-tables
  [{:keys [database_id schema search include_hidden] :as params}]
  (let [db-id           (tools/resolve-id :model/Database database_id)
        include-hidden? (boolean include_hidden)
        tables          (if (some? schema)
                          (let [tables (schema-tables db-id schema include-hidden?)]
                            (when (empty? tables)
                              (tools/teaching-error!
                               (str "Schema " (pr-str schema) " has no tables in database " db-id
                                    ", or does not exist. `action: \"list_schemas\"` names the schemas.")
                               404))
                            tables)
                          (warehouses.browse/database-tables-list
                           db-id {:include-hidden? include-hidden?}))
        matches?        (fn [{table-name :name}]
                          (str/includes? (u/lower-case-en (str table-name))
                                         (u/lower-case-en search)))
        tables          (cond->> tables
                          search (filter matches?))]
    (paged tables params
           {:spec        (projections/spec :table)
            :noun        "tables"
            :scope       (when-not (str/blank? schema) (str "in schema `" schema "`"))
            :narrow-with (cond-> []
                           (nil? schema) (conj :schema)
                           (nil? search) (conj :search))})))

(defn- list-models
  [{:keys [database_id] :as params}]
  (let [db-id (tools/resolve-id :model/Database database_id)]
    (paged (metabot-resources/database-models db-id) params
           {:spec (projections/spec :card) :noun "models"})))

;;; ──────────────────────────────────────────────────────────────────
;;; get_fields — complete tables, then a named remainder
;;; ──────────────────────────────────────────────────────────────────

(defn- with-sample-values
  "Attach `:values` — a sample of the stored field values, capped at [[sample-values-limit]] — to the
   fields that carry a value list, resolved in one batch through the same sandbox-aware path the field
   values endpoints read. `:has_more_values` marks a capped sample."
  [fields]
  (let [list-field-ids (into []
                             (comp (filter #(= :list (keyword (:has_field_values %))))
                                   (keep :id))
                             fields)
        id->values     (when (seq list-field-ids)
                         (params.field-values/field-id->field-values-for-current-user list-field-ids))]
    (mapv (fn [{:keys [id] :as field}]
            (if-let [values (not-empty (:values (get id->values id)))]
              (let [sample (into [] (take sample-values-limit) values)]
                (assoc field
                       :values sample
                       :has_more_values (< (count sample) (count values))))
              field))
          fields)))

(defn- derived-content
  "The questions, models, metrics, and transforms built on `table-id` — concise pointer rows, since
   derived content is what the agent drills into next, not what it reads here."
  [table-id]
  (let [{:keys [cards transforms]} (metabot-resources/table-derived-content table-id)]
    {:cards      (tools/project-all "concise" (projections/spec :card) cards)
     :transforms (tools/project-all "concise" (projections/spec :transform) transforms)}))

(defn- table-unit
  "One projected table with its projected fields, in field position order. Detailed adds each field's
   whole REST record (fingerprint, `has_field_values`), sample values, and the table's derived content.

   Detailed enrichment costs a value-list fetch and a derived-content query per table, so a unit is built
   only when the budget has room for it — never for a table that ends up in `omitted`."
  [response-format {:keys [fields] :as table}]
  (let [detailed? (tools/detailed? response-format)
        ordered   (vec (sort-by (fn [f] [(or (:position f) 0) (:id f)]) fields))
        enriched  (cond->> ordered detailed? with-sample-values)
        base      (tools/project response-format (projections/spec :table) (dissoc table :fields))]
    (cond-> (assoc base :fields (tools/project-all response-format (projections/spec :field) enriched))
      detailed? (assoc :derived (derived-content (:id table))))))

(def ^:private budget-omitted-reason
  "response budget — request it in a separate call")

(def ^:private inaccessible-reason
  "not found, or you do not have access to it")

(defn- budget-omitted-entry
  [table]
  {:id (:id table) :name (:name table) :reason budget-omitted-reason})

(defn- pack
  "Walk `tables` in request order, building each unit as it is reached, and decide how the response is
   bounded:

   - `{:mode :slice :table t :unit u :omitted [t…]}` when one table's unit alone exceeds the budget. It is
     sliced and every other requested table is omitted, wherever in `table_ids` it sat: a slice beside whole
     tables would be two bounding rules in one response.
   - `{:mode :whole :taken [[t u]…] :omitted [t…]}` otherwise — complete units until the budget runs out."
  [response-format tables]
  (loop [[table & more] tables
         spent          0
         taken          []]
    (if (nil? table)
      {:mode :whole :taken taken :omitted []}
      (let [unit  (table-unit response-format table)
            cost  (long (tools/estimate-tokens unit))
            spent (+ spent cost)]
        (cond
          (> cost tools/token-budget)
          {:mode :slice :table table :unit unit :omitted (into (mapv first taken) more)}

          (and (seq taken) (> spent tools/token-budget))
          {:mode :whole :taken taken :omitted (vec (cons table more))}

          :else
          (recur more spent (conj taken [table unit])))))))

(defn- slice-unit
  "An explicit slice of one over-budget `unit`: complete field rows in position order from `offset` until
   the token budget runs out — at least one either way, so a pathologically wide field still surfaces.
   Returns the sliced unit carrying `returned`/`total` field counts, plus the `:next-offset` to continue
   from when fields remain."
  [unit table-name offset]
  (let [fields (vec (:fields unit))
        total  (count fields)
        base   (dissoc unit :fields)]
    (when (>= offset total)
      (tools/teaching-error!
       (str "`offset: " offset "` is past the end — " table-name " has " total " fields.")))
    (loop [i     offset
           spent (tools/estimate-tokens base)
           taken []]
      (if (>= i total)
        {:unit (assoc base :fields taken :returned (count taken) :total total)}
        (let [cost       (long (tools/estimate-tokens (nth fields i)))
              next-spent (+ spent cost)]
          (if (or (empty? taken) (<= next-spent tools/token-budget))
            (recur (inc i) next-spent (conj taken (nth fields i)))
            {:unit        (assoc base :fields taken :returned (count taken) :total total)
             :next-offset i}))))))

(defn- slice-continuation-message
  [table sliced next-offset]
  (str (:name table) ": " (:returned sliced) " of " (:total sliced) " fields — continue with "
       "`browse_data(action: \"get_fields\", table_ids: [" (:id table) "], offset: " next-offset ")`."))

(defn- sliced-response
  "The one-table-slice response (or its explicit `offset` continuation), with every other requested table
   named in `omitted`."
  [table unit offset {:keys [requested omitted]}]
  (let [{sliced :unit :keys [next-offset]} (slice-unit unit (:name table) offset)]
    (tools/publish-read-event! :model/Table table)
    (tools/list-envelope
     [sliced]
     (cond-> {:total requested :omitted omitted}
       next-offset (assoc :truncation-message (slice-continuation-message table sliced next-offset))))))

(defn- whole-tables-response
  "Complete tables in request order until the budget ran out, then the rest named in `omitted`. Only the
   budget marks the response truncated: a table the caller may not read was never going to be in it."
  [taken {:keys [requested omitted budget-cut?]}]
  (doseq [[table _unit] taken]
    (tools/publish-read-event! :model/Table table))
  (tools/list-envelope
   (mapv second taken)
   (cond-> {:total requested :omitted omitted}
     budget-cut?
     (assoc :truncation-message
            (str (count taken) " of " requested " tables returned — the rest exceeded the response budget; "
                 "request each omitted table in its own `get_fields` call.")))))

(defn- get-fields
  [{:keys [table_ids include_hidden offset response_format]}]
  (let [ids          (into [] (distinct) (map #(tools/resolve-id :model/Table %) table_ids))
        metadatas    (schema.table/batch-fetch-table-query-metadatas
                      ids {:include-hidden-fields? (boolean include_hidden)})
        by-id        (m/index-by :id metadatas)
        ;; the batch fetch silently drops tables the caller may not read (and ids that name nothing);
        ;; name them back rather than letting the response read as "these tables don't exist"
        inaccessible (into [] (comp (remove by-id) (map (fn [id] {:id id :reason inaccessible-reason}))) ids)
        tables       (into [] (keep by-id) ids)
        requested    (count ids)]
    (cond
      (empty? tables)
      (tools/list-envelope [] {:total requested :omitted inaccessible})

      ;; `offset` continues a slice, and the argument check has already established it names one table.
      (some? offset)
      (sliced-response (first tables) (table-unit response_format (first tables)) offset
                       {:requested requested :omitted inaccessible})

      :else
      (let [{:keys [mode taken table unit] cut :omitted} (pack response_format tables)
            omitted (into (mapv budget-omitted-entry cut) inaccessible)]
        (if (= :slice mode)
          (sliced-response table unit 0 {:requested requested :omitted omitted})
          (whole-tables-response taken {:requested   requested
                                        :omitted     omitted
                                        :budget-cut? (boolean (seq cut))}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(mu/defn browse-data :- ::tools/list-response
  "Run the `browse_data` tool. See the tool's description on `POST /v2/browse-data` for the argument
   contract."
  [{:keys [action] :as params} :- Params]
  (check-action-args! params)
  (case action
    "list_databases" (list-databases params)
    "list_schemas"   (list-schemas params)
    "list_tables"    (list-tables params)
    "list_models"    (list-models params)
    "get_fields"     (get-fields params)))
