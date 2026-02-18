(ns metabase-enterprise.replacement.source-swap
  (:require
   [clojure.string :as str]
   [clojure.walk]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.events.core :as events]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.parameters.parse :as lib.params.parse]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.walk :as lib.walk]
   [metabase.models.visualization-settings :as vs]
   [metabase.sql-tools.core :as sql-tools]
   ;; sql-tools.init registers multimethod implementations for :macaw parser backend
   [metabase.sql-tools.init]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::source-ref
  "A reference to a card or table, e.g. [:card 123] or [:table 45].

   Called 'source-ref' because these are things that can be a query's :source-card or
   :source-table. This is distinct from 'entity keys' in the dependency system —
   dashboards, transforms, etc. can *depend on* sources (and appear in `usages` output)
   but cannot themselves *be* sources."
  [:tuple
   [:enum :card :table]
   pos-int?])

;;; ====================== Placeholder Helpers for Native SQL ======================
;;;
;;; These functions convert Metabase template tag syntax to/from placeholder syntax
;;; that SQL parsers can handle:
;;;   - {{tags}} → __MB_N__ (valid SQL identifiers)
;;;   - [[optionals]] → /*__MB_OPT_START__*/.../*__MB_OPT_END__*/ (SQL comments)
;;;
;;; We use unique markers (__MB_OPT_START__, __MB_OPT_END__) to avoid collisions
;;; with user SQL that might contain [[, ]], or similar patterns in comments.
;;;
;;; This allows sql-tools/replace-names to do AST-level table renaming while
;;; preserving the template tags.

(def ^:private opt-start-marker "/*__MB_OPT_START__*/")
(def ^:private opt-end-marker "/*__MB_OPT_END__*/")

(defn- process-tokens
  "Process a sequence of parsed tokens, returning {:sql ... :placeholders ... :idx ...}.
   Recursively handles optional clause contents."
  [tokens initial-idx]
  (loop [tokens tokens
         sql ""
         placeholders {}
         idx initial-idx]
    (if (empty? tokens)
      {:sql sql :placeholders placeholders :idx idx}
      (let [[token & rest-tokens] tokens]
        (if (string? token)
          (recur rest-tokens (str sql token) placeholders idx)
          ;; It's a param or optional
          (case (:lib/type token)
            ::lib.params.parse.types/param
            (let [placeholder (str "__MB_" idx "__")
                  original (str "{{" (:k token) "}}")]
              (recur rest-tokens
                     (str sql placeholder)
                     (assoc placeholders placeholder original)
                     (inc idx)))

            ::lib.params.parse.types/optional
            ;; Wrap optional with unique comment markers and recursively process contents
            (let [{inner-sql :sql
                   inner-placeholders :placeholders
                   new-idx :idx} (process-tokens (:args token) idx)]
              (recur rest-tokens
                     (str sql opt-start-marker inner-sql opt-end-marker)
                     (merge placeholders inner-placeholders)
                     new-idx))

            ;; Unknown token type - skip
            (recur rest-tokens sql placeholders idx)))))))

(defn- sql->placeholders
  "Convert SQL with template tags to SQL with placeholders.
   - Template tags {{x}} become __MB_N__ placeholders
   - Optional clauses [[...]] become /*__MB_OPT_START__*/.../*__MB_OPT_END__*/

   Returns {:sql \"...\" :placeholders {\"__MB_0__\" \"{{x}}\" ...}}"
  [sql]
  (let [parsed (lib.params.parse/parse sql)
        {:keys [sql placeholders]} (process-tokens parsed 0)]
    {:sql sql :placeholders placeholders}))

(def ^:private mb-start-re #"/\*\s*__MB_OPT_START__\s*\*/")
(def ^:private mb-stop-re #"/\*\s*__MB_OPT_END__\s*\*/")

(defn- restore-placeholders
  "Restore original syntax from placeholder SQL.
   - Replaces __MB_N__ with original {{tag}} syntax
   - Replaces /*__MB_OPT_START__*/ and /*__MB_OPT_END__*/ markers back to [[ and ]]
   - Handles spacing variations SQL parsers may introduce in comments"
  [sql placeholders]
  (-> (reduce (fn [s [placeholder original]]
                (str/replace s placeholder original))
              sql
              placeholders)
      ;; Restore optional clause markers (handle spacing variations)
      (str/replace mb-start-re "[[")
      (str/replace mb-stop-re "]]")))

;;; ====================== Table Tag Helpers ======================
;;;
;;; Table tags are `:type :table` template tags like {{my_table}} where
;;; the SQL uses a stable variable name and the tag has a `:table-id`.
;;; Unlike card tags ({{#123}}), the SQL doesn't embed the ID directly.

(defn- find-table-tags
  "Find all template tags of :type :table that reference the given table-id.
   Returns a seq of [tag-key tag-map] pairs."
  [template-tags table-id]
  (filter (fn [[_k v]]
            (and (= (:type v) :table)
                 (= (:table-id v) table-id)))
          template-tags))

(defn- replace-tag-in-sql
  "Replace {{old-tag-name}} with {{new-tag-name}} in parsed SQL tokens.
   Returns the reconstructed SQL string."
  [parsed old-tag-name new-tag-name]
  (apply str
         (for [token parsed]
           (cond
             (string? token)
             token

             (params/Param? token)
             (str "{{" (if (= (:k token) old-tag-name) new-tag-name (:k token)) "}}")

             (params/Optional? token)
             (str "[[" (replace-tag-in-sql (:args token) old-tag-name new-tag-name) "]]")

             :else
             (str token)))))

(defn- update-table-tags-for-table-swap
  "Update :type :table template tags when swapping table→table.
   Just updates the :table-id field."
  [template-tags old-table-id new-table-id]
  (reduce-kv
   (fn [acc k tag]
     (if (and (= (:type tag) :table)
              (= (:table-id tag) old-table-id))
       (assoc acc k (assoc tag :table-id new-table-id))
       (assoc acc k tag)))
   {}
   template-tags))

;;; ====================== Dimension Tag Helpers ======================
;;;
;;; Dimension tags are `:type :dimension` (field filters) containing
;;; `:dimension [:field <field-id> opts]`. When swapping tables, we need
;;; to remap field IDs to the equivalent fields on the new table.

(defn- update-dimension-tags
  "Update :type :dimension template tags, remapping field IDs from old table to new table.
   Finds matching fields by name."
  [template-tags old-table-id new-table-id]
  (reduce-kv
   (fn [acc k tag]
     (if (= (:type tag) :dimension)
       (let [dimension  (:dimension tag)
             field-id   (when (and (vector? dimension)
                                   (= :field (first dimension)))
                          (second dimension))
             field      (when field-id
                          (t2/select-one :model/Field :id field-id))]
         (if (and field (= (:table_id field) old-table-id))
           ;; Find matching field on new table by name
           (if-let [new-field (t2/select-one :model/Field
                                             :name (:name field)
                                             :table_id new-table-id)]
             (assoc acc k (assoc tag :dimension [:field (:id new-field) (nth dimension 2 nil)]))
             ;; No matching field - leave as-is (will error at runtime)
             (assoc acc k tag))
           (assoc acc k tag)))
       (assoc acc k tag)))
   {}
   template-tags))

(defn- update-table-tags-for-card-swap
  "Update :type :table template tags when swapping table→card.
   Changes tag type from :table to :card, updates SQL to use {{#id-slug}} syntax.
   Preserves optional fields like :required and :default from the original tag.
   Returns {:sql new-sql :template-tags new-tags}."
  [sql template-tags old-table-id new-card-id new-card-name]
  (let [table-tags   (find-table-tags template-tags old-table-id)
        card-slug    (-> (u/slugify new-card-name) (str/replace "_" "-"))
        card-tag-key (str "#" new-card-id "-" card-slug)]
    (if (empty? table-tags)
      {:sql sql :template-tags template-tags}
      ;; Replace each table tag with a card tag
      (let [;; Replace all matching tag names in SQL
            new-sql (reduce (fn [s [old-tag-name _]]
                              (replace-tag-in-sql (params.parse/parse s) old-tag-name card-tag-key))
                            sql
                            table-tags)
            ;; Get first old tag to preserve its optional fields (:required, :default)
            ;; Note: :id is NOT preserved - new tag gets a new UUID
            [_ first-old-tag] (first table-tags)
            preserved-fields (select-keys first-old-tag [:required :default])
            ;; Update template-tags: remove old table tags, add new card tag
            new-tags (as-> template-tags tags
                       ;; Remove old table tags
                       (reduce (fn [t [k _]] (dissoc t k)) tags table-tags)
                       ;; Add new card tag with preserved fields
                       (assoc tags card-tag-key (merge preserved-fields
                                                       {:type         :card
                                                        :card-id      new-card-id
                                                        :name         card-tag-key
                                                        :display-name card-tag-key})))]
        {:sql new-sql :template-tags new-tags}))))

(defn- replace-table-in-native-sql
  "Replace table names in native SQL, preserving template tags.
   Uses sql-tools/replace-names-impl for AST-level table renaming.

   Both old-table and new-table use the same convention:
   - A string like \"ORDERS\" (no schema)
   - A map like {:table \"ORDERS\" :schema \"PUBLIC\"} (with schema)
   - {:table \"ORDERS\"} or {:table \"ORDERS\" :schema nil} (no schema, same as string)

   When old-table has a schema and new-table doesn't, the schema is actively cleared
   from the SQL AST (e.g., `FROM public.orders` → `FROM new_orders`, not
   `FROM public.new_orders`)."
  [driver sql old-table new-table]
  (let [{placeholder-sql :sql
         placeholders :placeholders} (sql->placeholders sql)
        ;; Normalize both to maps
        old-spec   (if (string? old-table) {:table old-table} old-table)
        new-spec   (if (string? new-table) {:table new-table} new-table)
        old-schema (:schema old-spec)
        new-schema (:schema new-spec)
        ;; When old has a schema but new doesn't, actively clear the schema via {:schema nil}
        ;; so `FROM public.orders` becomes `FROM new_orders` (not `FROM public.new_orders`)
        new-spec   (if (and old-schema (not new-schema))
                     (assoc new-spec :schema nil)
                     new-spec)
        ;; Build replacement entries with both schema-qualified and unqualified keys
        ;; so both `FROM orders` and `FROM public.orders` are matched.
        base-key      {:table (:table old-spec)}
        schema-key    (cond-> base-key old-schema (assoc :schema old-schema))
        table-entries (cond-> {schema-key new-spec}
                        old-schema (assoc base-key new-spec))
        replaced (sql-tools/replace-names-impl
                  :macaw  ;; parser backend
                  driver
                  placeholder-sql
                  {:tables table-entries}
                  ;; allow-unused? needed when new-table contains special chars
                  ;; like {{#123}} which aren't valid SQL identifiers, and also when
                  ;; only one of the two keys (qualified/unqualified) matches.
                  {:allow-unused? true})
        restored (restore-placeholders replaced placeholders)]
    restored))

(defn- replace-table-in-native-query
  "Replace table references in a native query's SQL.
   Handles both:
   - Raw SQL table names (AST-level replacement)
   - Table template tags (:type :table with :table-id)

   Parameters:
   - query: pMBQL query with native stage
   - old-table-id: ID of table to replace
   - new-table-id: ID of replacement table"
  [query old-table-id new-table-id]
  (let [old-table (t2/select-one :model/Table :id old-table-id)
        new-table (t2/select-one :model/Table :id new-table-id)
        database  (t2/select-one :model/Database :id (:db_id old-table))
        driver    (:engine database)
        sql       (get-in query [:stages 0 :native])
        ;; 1. Replace raw SQL table references (handles both schema-qualified and unqualified)
        old-spec  (cond-> {:table (:name old-table)}
                    (:schema old-table) (assoc :schema (:schema old-table)))
        new-spec  (cond-> {:table (:name new-table)}
                    (:schema new-table) (assoc :schema (:schema new-table)))
        new-sql   (replace-table-in-native-sql driver sql old-spec new-spec)]
    (-> query
        (assoc-in [:stages 0 :native] new-sql)
        ;; 2. Update :type :table template tags
        (update-in [:stages 0 :template-tags] update-table-tags-for-table-swap old-table-id new-table-id)
        ;; 3. Update :type :dimension template tags (field filters)
        (update-in [:stages 0 :template-tags] update-dimension-tags old-table-id new-table-id))))

(defn- replace-table-with-card-in-native
  "Replace table references in native SQL with a card template tag.
   Handles both:
   - Raw SQL table names → {{#card-id-slug}}
   - Table template tags ({{my_table}}) → {{#card-id-slug}}

   E.g., `FROM orders` → `FROM {{#123-my-card}}`
   E.g., `FROM {{my_table}}` → `FROM {{#123-my-card}}`

   Parameters:
   - query: pMBQL query with native stage
   - old-table-id: ID of table to replace
   - new-card-id: ID of card to reference"
  [query old-table-id new-card-id]
  (let [old-table      (t2/select-one :model/Table :id old-table-id)
        new-card       (t2/select-one :model/Card :id new-card-id)
        database       (t2/select-one :model/Database :id (:db_id old-table))
        driver         (:engine database)
        sql            (get-in query [:stages 0 :native])
        template-tags  (get-in query [:stages 0 :template-tags])
        ;; Generate card tag with slug
        card-slug      (-> (u/slugify (:name new-card))
                           (str/replace "_" "-"))
        card-tag       (str "#" new-card-id "-" card-slug)
        card-ref       (str "{{" card-tag "}}")
        ;; 1. Replace raw SQL table name with card reference
        old-spec       (cond-> {:table (:name old-table)}
                         (:schema old-table) (assoc :schema (:schema old-table)))
        sql-after-raw  (replace-table-in-native-sql driver sql old-spec card-ref)
        ;; 2. Handle any :type :table template tags pointing to old-table-id
        {:keys [sql template-tags]} (update-table-tags-for-card-swap
                                     sql-after-raw
                                     template-tags
                                     old-table-id
                                     new-card-id
                                     (:name new-card))
        ;; 3. Add new card template tag entry (for raw SQL replacement)
        new-tag        {:type         :card
                        :card-id      new-card-id
                        :name         card-tag
                        :display-name card-tag}]
    (-> query
        (assoc-in [:stages 0 :native] sql)
        (assoc-in [:stages 0 :template-tags] template-tags)
        ;; Add card tag if not already present (from table tag conversion)
        (update-in [:stages 0 :template-tags] #(if (contains? % card-tag) % (assoc % card-tag new-tag))))))

(defn- find-tag-by-card-id
  "Find the key in template-tags map for a given card-id.
   Handles both plain (#42) and slugged (#42-my-query) formats."
  [template-tags card-id]
  (some (fn [[k v]]
          (when (= (:card-id v) card-id)
            k))
        template-tags))

(defn- replace-card-refs-with-table
  "Walk parsed SQL tokens, replacing card references to old-card-id with table-name.
   Returns the reconstructed SQL string."
  [parsed old-card-id table-name]
  (let [old-tag (str "#" old-card-id)]
    (apply str
           (for [token parsed]
             (cond
               (string? token)
               token

               (params/Param? token)
               (let [k (:k token)]
                 (if (or (= k old-tag)
                         (str/starts-with? k (str old-tag "-")))
                   table-name
                   (str "{{" k "}}")))

               (params/Optional? token)
               (str "[[" (replace-card-refs-with-table (:args token) old-card-id table-name) "]]")

               :else
               (str token))))))

(defn- replace-card-with-table-in-native
  "Replace card template tag reference in native SQL with a direct table reference.
   E.g., `FROM {{#123-my-card}}` → `FROM orders`

   This is the inverse of `replace-table-with-card-in-native`.

   Parameters:
   - query: pMBQL query with native stage
   - old-card-id: ID of card template tag to replace
   - new-table-id: ID of table to reference directly"
  [query old-card-id new-table-id]
  (let [new-table   (t2/select-one :model/Table :id new-table-id)
        old-card    (t2/select-one :model/Card :id old-card-id)
        database    (t2/select-one :model/Database :id (:database_id old-card))
        _driver     (:engine database)
        sql         (get-in query [:stages 0 :native])
        parsed      (params.parse/parse sql)
        ;; Use schema-qualified name when the target table has a schema
        table-ref   (if (:schema new-table)
                      (str (:schema new-table) "." (:name new-table))
                      (:name new-table))
        new-sql     (replace-card-refs-with-table parsed old-card-id table-ref)
        old-tag-key (find-tag-by-card-id (get-in query [:stages 0 :template-tags]) old-card-id)]
    (cond-> query
      true        (assoc-in [:stages 0 :native] new-sql)
      old-tag-key (update-in [:stages 0 :template-tags] dissoc old-tag-key))))

(defn- normalize-mbql-stages [query]
  (lib.walk/walk-clauses
   query
   (fn [query path-type path clause]
     (when (lib/is-field-clause? clause)
       (-> (lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)
           lib/ref)))))

;; see [QUE-3121: update parameters](https://linear.app/metabase/issue/QUE-3121/update-parameters)
(mu/defn- upgrade-parameter-target :- ::lib.schema.parameter/target
  "Upgrades parameter target refs to use strings where appropriate

   (upgrade-parameter-target query [:dimension [:field 7 nil] {:stage-number 0}])
-> [:dimension [:field \"TOTAL\" {:base-type :type/Float}] {:stage-number 0}]"
  [query :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when-let [field-ref (lib/parameter-target-field-ref target)]
        (let [{:keys [stage-number], :as options, :or {stage-number -1}} (lib/parameter-target-dimension-options target)
              stage-count (lib/stage-count query)]
          (when (and (>= stage-number -1)
                     (< stage-number stage-count))
            (let [filterable-columns (lib/filterable-columns query stage-number)]
              (when-let [matching-column (lib/find-matching-column query stage-number field-ref filterable-columns)]
                #_{:clj-kondo/ignore [:discouraged-var]} ;; ignore ->legacy-MBQL
                [:dimension (-> matching-column lib/ref lib/->legacy-MBQL) options])))))
      target))

(defn- normalize-native-stages [query]
  ;; TODO: make this work
  query)

(defn- normalize-query [query]
  (cond-> query
    (lib/any-native-stage? query) normalize-native-stages
    (not (lib/native-only-query? query)) normalize-mbql-stages))

(def ^:private source-type->stage-key
  {:card :source-card
   :table :source-table})

(defn- update-mbql-stages [query [old-source-type old-source-id] [new-source-type new-source-id] id-updates]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (metabase.lib.walk/walk
     query
     (fn [query path-type path stage-or-join]
       (cond-> stage-or-join
         (= (old-key stage-or-join) old-source-id) (-> (dissoc old-key)
                                                       (assoc new-key new-source-id)))))))

(defn- replace-template-tags
  "Replaces references to `old-card-id` with `new-card-id` in a template-tags map.
   Preserves slug format: if old key was `#42-my-query`, new key will be `#99-new-query-name`."
  [tags old-card-id new-card-id new-card-name]
  (let [old-tag (str "#" old-card-id)
        new-slug (when new-card-name
                   (-> (u/slugify new-card-name)
                       (str/replace "_" "-")))]
    (reduce-kv
     (fn [acc k v]
       (if (= (:card-id v) old-card-id)
         (let [;; Check if old key had a slug (e.g., "#42-my-query" vs "#42")
               had-slug? (str/starts-with? k (str old-tag "-"))
               new-key (if (and had-slug? new-slug)
                         (str "#" new-card-id "-" new-slug)
                         (str "#" new-card-id))]
           (assoc acc new-key
                  (assoc v
                         :card-id new-card-id
                         :name new-key
                         :display-name new-key)))
         (assoc acc k v)))
     {}
     tags)))

(defn- replace-card-refs-in-parsed
  "Walk parsed SQL tokens, replacing card references to old-card-id with new-card-id.
   Returns the reconstructed SQL string.
   Handles card refs with slugs like {{#42-my-query-name}}.
   When a slugged ref is found, generates a new slug from `new-card-name`."
  [parsed old-card-id new-card-id new-card-name]
  (let [old-tag (str "#" old-card-id)
        new-slug (when new-card-name
                   (-> (u/slugify new-card-name)
                       (str/replace "_" "-")))]
    (apply str
           (for [token parsed]
             (cond
               (string? token)
               token

               (params/Param? token)
               (let [k (:k token)]
                 (cond
                   ;; Match exact tag (no slug) -> replace with plain format
                   (= k old-tag)
                   (str "{{#" new-card-id "}}")

                   ;; Match tag with slug suffix (e.g., #42-my-query) -> replace with new slug
                   (str/starts-with? k (str old-tag "-"))
                   (if new-slug
                     (str "{{#" new-card-id "-" new-slug "}}")
                     (str "{{#" new-card-id "}}"))

                   :else
                   (str "{{" k "}}")))

               (params/Optional? token)
               (str "[[" (replace-card-refs-in-parsed (:args token) old-card-id new-card-id new-card-name) "]]")

               :else
               (str token))))))

(defn- swap-card-in-native-query
  "Pure transformation: replaces references to `old-card-id` with `new-card-id`
   in a native dataset-query's query text and template-tag map.
   Handles pMBQL format ([:stages 0 :native] and [:stages 0 :template-tags]).

   Uses the Metabase parameter parser to properly identify card references,
   handling edge cases like:
   - Card refs with slugs: {{#42-my-query}}
   - Card refs with whitespace: {{ #42 }}
   - Card refs in optional clauses: [[...{{#42}}...]]"
  [dataset-query old-card-id new-card-id]
  (let [sql (get-in dataset-query [:stages 0 :native])
        new-card-name (:name (t2/select-one [:model/Card :name] :id new-card-id))
        parsed (params.parse/parse sql)
        new-sql (replace-card-refs-in-parsed parsed old-card-id new-card-id new-card-name)]
    (-> dataset-query
        (assoc-in [:stages 0 :native] new-sql)
        (update-in [:stages 0 :template-tags] replace-template-tags old-card-id new-card-id new-card-name))))

(defn- update-native-stages [query [old-source-type old-source-id] [new-source-type new-source-id] _id-updates]
  (case [old-source-type new-source-type]
    [:card :card]   (swap-card-in-native-query query old-source-id new-source-id)
    [:table :table] (replace-table-in-native-query query old-source-id new-source-id)
    [:table :card]  (replace-table-with-card-in-native query old-source-id new-source-id)
    [:card :table]  (replace-card-with-table-in-native query old-source-id new-source-id)
    ;; No-op for unknown combinations
    query))

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query)
    (update-native-stages old-source new-source id-updates)

    (not (lib/native-only-query? query))
    (update-mbql-stages old-source new-source id-updates)))

(defn- upgrade-legacy-field-ref
  "Given a card's dataset_query (pMBQL) and a legacy field ref
  ([\"field\" 42 {...}]), resolve it through the metadata system and return
  an upgraded version."
  [query field-ref]
  (let [pmbql-ref   (lib.convert/legacy-ref->pMBQL query field-ref)
        col-meta    (lib/metadata query 0 pmbql-ref)
        upgraded    (lib/ref col-meta)
        legacy-back (lib/->legacy-MBQL upgraded)]
    legacy-back))

(defn- upgrade-column-settings-keys
  "Given a card's dataset_query (pMBQL) and a column_settings map (from visualization_settings),
  return a new column_settings map with upgraded parameter-mapping. Keys are JSON-encoded strings."
  [query column-settings]
  (when (some? column-settings)
    (clojure.walk/postwalk
     (fn [form]
       (if (lib/is-field-clause? form)
         (upgrade-legacy-field-ref query form)
         form))
     column-settings)))

(defn- swap-field-ref [mp field-ref old-table new-table]
  (let [field-ref (lib.convert/legacy-ref->pMBQL mp field-ref)]
    (if-some [field-id (lib/field-ref-id field-ref)]
      (if-some [field-meta (t2/select-one :model/Field :id field-id :table_id old-table)]
        (let [field-name (:name field-meta)
              new-field (t2/select-one :model/Field :name field-name :table_id new-table)]
          (when (nil? new-field)
            (throw (ex-info "Could not find field with matching name." {:name field-name
                                                                        :original-field field-meta
                                                                        :table_id new-table})))
          (let [new-field-meta (lib.metadata/field mp (:id new-field))]
            (lib/->legacy-MBQL (lib/ref new-field-meta))))
        ;; Can be here for two reasons:
        ;;  1. field-id doesn't exist. Oh, well. We just give up.
        ;;  2. field is not from the table we're swapping.
        field-ref)
      field-ref)))

(defn- ultimate-table-id [[source-type source-id]]
  (case source-type
    :table source-id))

(defn- swap-field-refs [mp form old-source [new-source-type new-source-id]]
  (case new-source-type
    :table
    (let [new-table-id new-source-id
          old-table-id (ultimate-table-id old-source)]
      (clojure.walk/postwalk
       (fn [exp]
         (if (lib/is-field-clause? exp)
           (swap-field-ref mp exp old-table-id new-table-id)
           exp))
       form))

    :card
    form))

(defn- update-dashcards-column-settings!
  "After a card's query has been updated, upgrade the column_settings keys on all
  DashboardCards that display this card."
  [card-id query old-source new-source]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (let [viz      (vs/db->norm (:visualization_settings dashcard))
          col-sets (::vs/column-settings viz)]
      (when (seq col-sets)
        (let [upgraded (upgrade-column-settings-keys query col-sets)
              swapped  (swap-field-refs query col-sets old-source new-source)]
          (when (not= col-sets upgraded)
            (t2/update! :model/DashboardCard (:id dashcard)
                        {:visualization_settings (-> viz
                                                     (assoc ::vs/column-settings swapped)
                                                     vs/norm->db)})))))))

(defn- update-entity [entity-type entity-id old-source new-source]
  (case entity-type
    :card (let [card (t2/select-one :model/Card :id entity-id)]
            (when-let [query (:dataset_query card)]
              (let [new-query (-> query normalize-query (update-query old-source new-source {}))
                    updated   (assoc card :dataset_query new-query)]
                (t2/update! :model/Card entity-id {:dataset_query new-query})
                (update-dashcards-column-settings! entity-id new-query old-source new-source)
                ;; TODO: not sure we really want this code to have to know about dependency tracking
                ;; TODO: publishing this event twice per update seems bad
                (events/publish-event! :event/card-dependency-backfill
                                       {:object updated}))))
    ;; TODO (eric 2026-02-13): Convert field refs in query.
    :transform (let [transform (t2/select-one :model/Transform :id entity-id)]
                 (when-let [query (get-in transform [:source :query])]
                   (let [new-query (-> query normalize-query (update-query old-source new-source {}))]
                     (when (not= query new-query)
                       (t2/update! :model/Transform entity-id
                                   {:source (assoc (:source transform) :query new-query)})))))
    nil))

(mu/defn swap-source
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead.

   Returns {:swapped [...]} with the list of entities that were updated."
  [old-source :- ::source-ref
   new-source :- ::source-ref]
  (let [found-usages (usages/usages old-source)]
    (t2/with-transaction [_conn]
      (doseq [[entity-type entity-id] found-usages]
        (update-entity entity-type entity-id old-source new-source)))
    {:swapped (vec found-usages)}))

(defn swap-native-card-source!
  "Updates a single card's native query, replacing references to `old-card-id`
   with `new-card-id` in both the query text and template tags. Persists the
   change and publishes a dependency-backfill event."
  [card-id old-card-id new-card-id]
  (update-entity :card card-id [:card old-card-id] [:card new-card-id]))
