(ns metabase.source-swap.sql
  "Render parsed template tokens and rename SQL tables without losing template syntax."
  (:require
   [clojure.string :as str]
   [metabase.lib.parameters.parse :as lib.params.parse]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.sql-tools.core :as sql-tools]
   ;; Registers the :macaw parser backend.
   [metabase.sql-tools.init]))

(defn render-tokens
  "Render parsed SQL using `param-fn` for parameters and optional delimiters (default: [[ and ]])."
  ([tokens param-fn]
   (render-tokens tokens param-fn ["[[" "]]"]))
  ([tokens param-fn [start end :as delimiters]]
   (apply str
          (map (fn [token]
                 (cond
                   (lib.params.parse.types/param? token) (param-fn (:k token))
                   (lib.params.parse.types/optional? token)
                   (str start (render-tokens (:args token) param-fn delimiters) end)
                   :else token))
               tokens))))

(defn template-ref
  "Wrap a template tag name in native SQL parameter syntax."
  [tag-name]
  (str "{{" tag-name "}}"))

(defn- sql->placeholders
  [sql]
  (let [placeholders (volatile! {})
        param-fn     (fn [tag-name]
                       (let [placeholder (str "__MB_" (count @placeholders) "__")]
                         (vswap! placeholders assoc placeholder (template-ref tag-name))
                         placeholder))
        rendered     (render-tokens (lib.params.parse/parse sql) param-fn
                                    ["/*__MB_OPT_START__*/" "/*__MB_OPT_END__*/"])]
    {:sql rendered :placeholders @placeholders}))

(defn- restore-placeholders
  [sql placeholders]
  (-> (reduce (fn [s [placeholder original]] (str/replace s placeholder original)) sql placeholders)
      ;; Parsers can add whitespace inside comments.
      (str/replace #"/\*\s*__MB_OPT_START__\s*\*/" "[[")
      (str/replace #"/\*\s*__MB_OPT_END__\s*\*/" "]]")))

(defn- table-spec
  [table]
  (if (string? table) {:table table} table))

(defn replace-table
  "Rename a SQL table, preserving template tags and optional clauses.
   Tables may be strings or maps with :table and optional :schema. An omitted new schema clears the old schema."
  [driver sql old-table new-table]
  (let [{placeholder-sql :sql, placeholders :placeholders} (sql->placeholders sql)
        {old-schema :schema :as old-spec} (table-spec old-table)
        new-spec      (table-spec new-table)
        new-spec      (cond-> new-spec
                        (and old-schema (not (:schema new-spec))) (assoc :schema nil))
        base-key      {:table (:table old-spec)}
        schema-key    (cond-> base-key old-schema (assoc :schema old-schema))
        table-entries (cond-> {schema-key new-spec}
                        old-schema (assoc base-key new-spec))]
    (-> (sql-tools/replace-names driver placeholder-sql {:tables table-entries}
                                 ;; Only one qualification may occur; card refs are not SQL identifiers.
                                 {:allow-unused? true})
        ;; Card template refs must be unquoted for the native query processor.
        (str/replace "\"{{" "{{")
        (str/replace "}}\"" "}}")
        (restore-placeholders placeholders))))
