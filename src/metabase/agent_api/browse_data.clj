(ns metabase.agent-api.browse-data
  "The v2 `browse_data` tool: one tool for the whole data hierarchy.

   The action is a named enum — `list_databases`, `list_schemas`, `list_tables`, `list_models`,
   `get_fields` — never inferred from which arguments happen to be present: argument-presence dispatch
   is an unnamed enum that strict clients cannot validate and transcripts cannot read.

   Every action delegates to the domain function its public REST endpoint calls, so the permission
   filtering is the endpoint's own and cannot drift: databases through
   [[warehouses.browse/visible-databases]], schemas through [[warehouses.browse/database-schemas]],
   tables through [[warehouses.browse/schema-tables-list]], fields through the (sandbox-aware)
   [[schema.table/batch-fetch-table-query-metadatas]]. Models have no REST listing endpoint, so
   `list_models` shares [[metabot-resources/database-models]] with the v1 resource reader.

   Bounding differs by action shape. The `list_*` actions page with `limit`/`offset` and steer with a
   truncation message naming the narrowing parameter. `get_fields` takes explicit ids, so its bound is
   the response budget with per-table fault isolation: complete tables until the budget runs out, then
   the rest named in `omitted` — never a silent half-table, because a truncated column list reads as
   \"that's all the columns\" and corrupts the query the agent writes next. When a single requested
   table alone exceeds the budget, the response is an explicit slice — fields in position order with
   returned/total counts and the `offset` to continue from. The rule bans silent truncation, not
   slicing."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.metabot.tools.resources :as metabot-resources]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(def ^:private actions-requiring-database
  #{"list_schemas" "list_tables" "list_models"})

(defn- check-action-args!
  "Per-action argument requirements, enforced at runtime with teaching errors — the schema only
   requires `action` itself, so a strict client's always-send-every-property shape validates."
  [{:keys [action database_id schema search table_ids limit offset]}]
  (when (and (actions-requiring-database action) (nil? database_id))
    (tools/teaching-error
     (tru "`{0}` requires `database_id`. Find one with `action: \"list_databases\"`." action)))
  (when (and (some? schema) (not= "list_tables" action))
    (tools/teaching-error (tru "`schema` only scopes `list_tables`. Drop it, or switch the action.")))
  (when (and (some? search) (not= "list_tables" action))
    (tools/teaching-error (tru "`search` only filters `list_tables`. Drop it, or switch the action.")))
  (when (and (seq table_ids) (not= "get_fields" action))
    (tools/teaching-error (tru "`table_ids` only applies to `get_fields`. Drop it, or switch the action.")))
  (when (= "get_fields" action)
    (when (empty? table_ids)
      (tools/teaching-error
       (tru "`get_fields` requires `table_ids` — up to {0} table ids per call. Find them with `action: \"list_tables\"`."
            (str max-tables-per-call))))
    (when (> (count table_ids) max-tables-per-call)
      (tools/teaching-error
       (tru "`get_fields` takes at most {0} tables per call — you asked for {1}. Split the request."
            (str max-tables-per-call) (str (count table_ids)))))
    (when (some? limit)
      (tools/teaching-error
       (tru "`limit` pages the `list_*` actions. `get_fields` bounds itself by response budget: a too-wide table comes back as an explicit slice with the `offset` to continue from.")))
    (when (and (some? offset) (not= 1 (count table_ids)))
      (tools/teaching-error
       (tru "`offset` applies to `get_fields` only with a single table in `table_ids` — it continues a table too wide for one response.")))))

;;; ──────────────────────────────────────────────────────────────────
;;; The list_* actions — page, project, steer
;;; ──────────────────────────────────────────────────────────────────

(defn- paged-envelope
  "The bounded list envelope over the full `rows` set the domain function returned: slice the page,
   project it, and when rows remain behind it, steer with the narrowing parameters and the next
   offset. The backing endpoints return full sets, so `total` is always exact."
  [rows {:keys [limit offset response_format spec noun scope narrow-with]}]
  (let [limit     (min (or limit default-limit) max-limit)
        offset    (or offset 0)
        rows      (vec rows)
        total     (count rows)
        page      (into [] (comp (drop offset) (take limit)) rows)
        projected (if spec
                    (tools/project-all response_format (projections/spec spec) page)
                    page)
        more?     (< (+ offset (count page)) total)]
    (tools/list-envelope
     projected
     (cond-> {:total total}
       more? (assoc :truncation-message
                    (tools/truncation-message {:total       total
                                               :returned    (count page)
                                               :noun        noun
                                               :scope       scope
                                               :narrow-with narrow-with
                                               :offset      offset
                                               :limit       limit}))))))

(defn- list-databases
  [params]
  (paged-envelope (warehouses.browse/visible-databases)
                  (assoc params :spec :database :noun "databases")))

(defn- list-schemas
  [{:keys [database_id include_hidden] :as params}]
  (let [db-id (tools/resolve-id :model/Database database_id)]
    (paged-envelope (warehouses.browse/database-schemas db-id {:include-hidden? (boolean include_hidden)})
                    (assoc params :noun "schemas"))))

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
                              (tools/teaching-error
                               (tru "Schema {0} has no tables in database {1}, or does not exist. `action: \"list_schemas\"` names the schemas."
                                    (pr-str schema) (str db-id))
                               404))
                            tables)
                          (mapcat #(schema-tables db-id % include-hidden?)
                                  (warehouses.browse/database-schemas
                                   db-id {:include-hidden? include-hidden?})))
        matches?        (fn [{table-name :name}]
                          (str/includes? (u/lower-case-en (str table-name))
                                         (u/lower-case-en search)))
        tables          (cond->> tables
                          search (filter matches?))]
    (paged-envelope tables
                    (assoc params
                           :spec :table
                           :noun "tables"
                           :scope (when-not (str/blank? schema)
                                    (str "in schema `" schema "`"))
                           :narrow-with (cond-> []
                                          (nil? schema) (conj :schema)
                                          (nil? search) (conj :search))))))

(defn- list-models
  [{:keys [database_id] :as params}]
  (let [db-id (tools/resolve-id :model/Database database_id)]
    (paged-envelope (metabot-resources/database-models db-id)
                    (assoc params :spec :card :noun "models"))))

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
   whole REST record (fingerprint, `has_field_values`), sample values, and the table's derived content."
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
  [unit]
  {:id (:id unit) :name (:name unit) :reason budget-omitted-reason})

(defn- slice-table-unit
  "An explicit slice of one over-budget table `unit`: complete field rows in position order from
   `offset` until the token budget runs out — at least one either way, so a pathologically wide field
   still surfaces. Returns the sliced unit carrying `returned`/`total` field counts, plus the
   `:next-offset` to continue from when fields remain."
  [unit offset]
  (let [fields (vec (:fields unit))
        total  (count fields)
        base   (dissoc unit :fields)]
    (when (>= offset total)
      (tools/teaching-error
       (tru "`offset: {0}` is past the end — {1} has {2} fields." (str offset) (:name unit) (str total))))
    (loop [i     offset
           spent (tools/estimate-tokens base)
           taken []]
      (if (>= i total)
        {:unit (assoc base :fields taken :returned (count taken) :total total)}
        (let [cost       (long (tools/estimate-tokens (nth fields i)))
              next-spent (+ spent cost)]
          (if (or (empty? taken) (<= next-spent tools/token-warn))
            (recur (inc i) next-spent (conj taken (nth fields i)))
            {:unit        (assoc base :fields taken :returned (count taken) :total total)
             :next-offset i}))))))

(defn- slice-continuation-message
  [unit next-offset]
  (str (:name unit) ": " (:returned unit) " of " (:total unit) " fields — continue with "
       "`browse_data(action: \"get_fields\", table_ids: [" (:id unit) "], offset: " next-offset ")`."))

(defn- sliced-fields-response
  "The single-table-over-budget response (or its explicit `offset` continuation): a slice of the first
   table, with every other requested table named omitted — a slice plus whole tables would be two
   bounding rules in one response."
  [{:keys [units tables inaccessible requested offset]}]
  (let [{:keys [unit next-offset]} (slice-table-unit (first units) (or offset 0))]
    (tools/publish-read-event! :model/Table (first tables))
    (cond-> {:data     [unit]
             :returned 1
             :total    requested}
      next-offset (assoc :truncated true
                         :truncation_message (slice-continuation-message unit next-offset))
      (or (seq (rest units)) (seq inaccessible))
      (assoc :omitted (into (mapv budget-omitted-entry (rest units)) inaccessible)))))

(defn- budgeted-fields-response
  "Complete tables in request order until the budget runs out, then the rest named in `omitted`."
  [{:keys [units tables inaccessible requested]}]
  (let [{:keys [included omitted truncated?]} (tools/budget-units units {})
        returned (count included)]
    (doseq [table (take returned tables)]
      (tools/publish-read-event! :model/Table table))
    (cond-> {:data     included
             :returned returned
             :total    requested}
      truncated? (assoc :truncated true
                        :truncation_message
                        (str returned " of " requested " tables returned — the rest exceeded "
                             "the response budget; request each omitted table in its own "
                             "`get_fields` call."))
      (or (seq omitted) (seq inaccessible))
      (assoc :omitted (into (mapv budget-omitted-entry omitted) inaccessible)))))

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
        parts        {:units        (mapv #(table-unit response_format %) tables)
                      :tables       tables
                      :inaccessible inaccessible
                      :requested    (count ids)
                      :offset       offset}]
    (if (and (seq tables)
             (or (some? offset)
                 (> (tools/estimate-tokens (first (:units parts))) tools/token-warn)))
      (sliced-fields-response parts)
      (budgeted-fields-response parts))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn browse-data
  "Run the `browse_data` tool. See the tool's description on `POST /v2/browse-data` for the argument
   contract."
  [{:keys [action] :as params}]
  (check-action-args! params)
  (case action
    "list_databases" (list-databases params)
    "list_schemas"   (list-schemas params)
    "list_tables"    (list-tables params)
    "list_models"    (list-models params)
    "get_fields"     (get-fields params)))
