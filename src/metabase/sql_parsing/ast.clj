(ns metabase.sql-parsing.ast
  "Helpers for navigating the polyglot-sql-ffi JSON AST (keywordized).

  Expression nodes are single-key tagged maps like `{:select {...}}`, `{:column {...}}` or
  `{:eq {:left .. :right ..}}`. Structural maps (clause bodies, identifiers like
  `{:name \"x\" :quoted false}`, CTE/join entries) are plain multi-key maps and have no tag."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]))

(set! *warn-on-reflection* true)

(defn tag
  "The tag keyword of an expression node (`:select`, `:column`, ...), or nil for anything that is
  not a tagged node."
  [node]
  (when (and (map? node)
             (= 1 (count node))
             (map? (val (first node))))
    (key (first node))))

(defn content
  "The content map of a tagged expression node."
  [node]
  (val (first node)))

(def set-op-tags
  "Tags of set-operation query nodes."
  #{:union :intersect :except})

(def query-tags
  "Tags of nodes that form a complete query scope."
  (conj set-op-tags :select))

(defn ident-name
  "The string name of an identifier map like `{:name \"x\" :quoted false}`."
  [ident]
  (:name ident))

(defn table-parts
  "`[catalog schema table]` for a table node's content, or nil when the source has no usable table
  name (e.g. table functions)."
  [table-content]
  (let [table-name (get-in table-content [:name :name])]
    (when (and (string? table-name) (seq table-name))
      [(get-in table-content [:catalog :name])
       (get-in table-content [:schema :name])
       table-name])))

;; Table and column references appear both as tagged nodes (`{:table {...}}`) and as bare content
;; maps in statement bodies (INSERT/UPDATE targets), so shape checks match on content: both have a
;; `:name` identifier map, tables carry `:hints`, columns carry `:join_mark`.

(defn table-content?
  "Whether `m` is the content map of a table reference."
  [m]
  (and (map? m) (map? (:name m)) (contains? m :hints)))

(defn column-content?
  "Whether `m` is the content map of a column reference."
  [m]
  (and (map? m) (map? (:name m)) (contains? m :join_mark)))

(defn- ident
  [ident-name]
  {:name ident-name :quoted true :trailing_comments []})

(defn split-quoted-table-paths
  "Split table references whose whole dotted path is quoted as a single identifier — BigQuery's
  `` `project.dataset.table` `` style — into separate catalog/schema/table identifiers, the way
  sqlglot parses them."
  [node]
  (walk/postwalk
   (fn [x]
     (if (and (table-content? x)
              (nil? (:schema x))
              (nil? (:catalog x))
              (get-in x [:name :quoted])
              (str/includes? (get-in x [:name :name]) "."))
       (let [parts (str/split (get-in x [:name :name]) #"\.")]
         (case (count parts)
           2 (assoc x
                    :schema (ident (parts 0))
                    :name   (assoc (:name x) :name (parts 1)))
           3 (assoc x
                    :catalog (ident (parts 0))
                    :schema  (ident (parts 1))
                    :name    (assoc (:name x) :name (parts 2)))
           x))
       x))
   node))

(defn unwrap-annotated
  "Strip `:annotated` wrappers (attached SQL comments) from an expression node."
  [expr]
  (if (= (tag expr) :annotated)
    (recur (:this (content expr)))
    expr))

(defn dot-column-content
  "Flatten a `:dot` chain (how references qualified more deeply than `table.column` parse, e.g.
  `schema.table.column`) into column-node content `{:name ident :table ident}`, or nil when the
  chain does not bottom out in a column."
  [dot-content]
  (loop [{:keys [this field]} dot-content
         fields               (list field)]
    (case (tag this)
      :dot    (recur (content this) (conj fields (:field (content this))))
      :column (let [c        (content this)
                    segments (into [(:table c) (:name c)] fields)
                    segments (into [] (remove nil?) segments)]
                {:name  (peek segments)
                 :table (get segments (- (count segments) 2))})
      nil)))
