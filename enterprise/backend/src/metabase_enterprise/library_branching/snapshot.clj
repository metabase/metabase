(ns metabase-enterprise.library-branching.snapshot
  "The snapshot: the synced content of an instance or of a commit, as a plain value.

  A snapshot maps the identity of each item to the item's content. Two items are equal iff their values are equal."
  (:require
   [metabase-enterprise.library-branching.collation :as collation]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def kinds
  "The closed set of item kinds."
  #{:collection :dashboard :glossary-term :measure :metric :model :published-table :question :segment :snippet
    :timeline})

(def may-contain
  "`{kind #{kind}}`: for each kind of [[kinds]], the kinds of the items that an item of that kind can contain."
  {:collection      #{:collection :dashboard :metric :model :published-table :question :snippet :timeline}
   :dashboard       #{}
   :glossary-term   #{}
   :measure         #{}
   :metric          #{}
   :model           #{}
   :published-table #{:measure :segment}
   :question        #{}
   :segment         #{}
   :snippet         #{}
   :timeline        #{}})

(def shared-tables
  "Sets of kinds whose items the app DB keeps in one table, keyed by identity: an instance holds at most one item of
  the kinds of a set with one identity, and a change of kind inside a set changes that item."
  #{#{:metric :model :question}})

(defn same-row?
  "True iff an item of kind `a` and an item of kind `b` with one identity are one item of the app DB: `a` is `b`, or
  a set of [[shared-tables]] holds both."
  [a b]
  (or (= a b)
      (boolean (some #(and (contains? % a) (contains? % b)) shared-tables))))

(def unique-keys
  "`{kind {:path path :name? bool :max-length n}}`: the kinds whose key the app DB keeps unique over all rows of the
  kind, the trash included, the path of that key in an item, whether the key is a name, and the most characters that
  the app DB holds for the key. Two names are one key iff their [[fold-name]] forms are equal. An item whose key is
  nil has none."
  {:snippet {:path [:name] :name? true :max-length 254}})

(defn fold-name
  "Name `s` in the form in which two names are one key: its primary weights under utf8mb4_unicode_ci, so two names are
  one key iff that collation takes them as equal."
  ^String [^String s]
  ;; MySQL and MariaDB app DBs keep snippet names unique under utf8mb4_unicode_ci: case, accents, expansions such as ß
  ;; and ss, trailing spaces and ignorable characters do not count, and all supplementary characters are equal.
  ;; Postgres and H2 compare names exactly, so this form only refuses more there. The engine uses this one form on every
  ;; app DB, so a snapshot that validates on one app DB validates on all.
  (collation/primary-key s))

(defn unique-key
  "The unique key of `item` by `unique-keys` (in the form of [[unique-keys]]), in the form in which keys compare; nil
  when the kind of `item` has no key, or its key is nil."
  [unique-keys item]
  (when-let [{:keys [path name?]} (get unique-keys (:kind item))]
    (when-some [k (get-in item path)]
      (if (and name? (string? k)) (fold-name k) k))))

(def nested-ids
  "`{kind path}`: the kinds whose items hold nested entries with identities of their own, and the path in an item of the
  vector of those entries. Each entry has its identity under `:id`. The app DB keeps the identities of the entries of
  a kind unique over all items of the kind."
  {:timeline [:attrs :events]})

(defn nested-identities
  "The identities of the nested entries of `item` by `nested-ids` (in the form of [[nested-ids]])."
  [nested-ids item]
  (when-let [path (get nested-ids (:kind item))]
    (let [entries (get-in item path)]
      (when (sequential? entries)
        (keep #(when (map? %) (:id %)) entries)))))

(def ref-kinds
  "`{kind {role #{kind}}}`: a reference of `role` from an item of `kind` names an item of one of these kinds. The
  table can name kinds outside [[kinds]]."
  {:action    {:model #{:model}}
   :dashboard {:action #{:action} :dashboard #{:dashboard}}})

(def library-content
  "`{collection-type #{content-type}}`: the content types that a collection of each Library type can hold, as master's
  Library content check has them ([[content-type]]). A collection of another type holds any content type."
  ;; A copy of the table of `metabase-enterprise.library.validation`, which babashka cannot load; a test checks that the
  ;; two agree on every pair of a collection type and an item.
  {"library"            #{"library-data" "library-metrics" "library-dashboards"}
   "library-data"       #{:table "library-data"}
   "library-metrics"    #{:metric "library-metrics"}
   "library-dashboards" #{:model/Dashboard :dashboard-question :model/Pulse :model/Timeline "library-dashboards"}})

(def table-collection-type
  "The one collection type that can hold a published table, inside the Library or outside it."
  "library-data")

(defn content-type
  "The content type of `item` in the terms of master's Library content check: the `:type` of a collection, or
  `:collection` for one with none; `:dashboard-question` for a question of a dashboard; else the kind, or the model
  of the kind where master names the model."
  [{:keys [kind attrs]}]
  (case kind
    :collection      (or (:type attrs) :collection)
    :dashboard       :model/Dashboard
    :published-table :table
    :question        (if (some? (:dashboard_id attrs)) :dashboard-question :question)
    :snippet         :model/NativeQuerySnippet
    :timeline        :model/Timeline
    kind))

(def stub-kinds
  "The kinds whose new item an apply can write first without its references, as a stub, and complete in a later step:
  in a reference cycle, the items of these kinds leave out their references, so the items of other kinds need none."
  #{:dashboard})

(def system-ids
  "The identities of the system items that every instance of a release has from the install on: the Library
  collection and its sections Data, Metrics and Dashboards."
  #{"librarylibrarylibrary" "librarylibrarydatadat" "librarylibrarymetrics" "librarylibrarydashbrd"})

(def area-roots
  "`{identity area}`: the root of each area other than the Library, a system item with a fixed identity that no
  snapshot, file or app-DB row holds. A place that names an area root and no item of the snapshot is inside: an item
  at the top level of an area has the area root as its place. An area has `:area`, its keyword; `:name`, its name for
  a person; `:kinds`, the kinds of the items that its root can contain, also kinds outside [[kinds]]; and
  `:namespace`, the `:namespace` attribute of a collection at its root (the Glossary holds no collection)."
  {"dataactionsdataaction" {:area :data-actions :name "Data actions" :namespace "data-actions"
                            :kinds #{:action :collection}}
   "dataappsdataappsdatap" {:area :data-apps :name "Data apps" :namespace "data-apps"
                            :kinds #{:collection :data-app}}
   "glossaryglossarygloss" {:area :glossary :name "Glossary"
                            :kinds #{:glossary-term}}
   "snippetssnippetssnipp" {:area :snippets :name "Snippets" :namespace "snippets"
                            :kinds #{:collection :snippet}}
   "transformstransformst" {:area :transforms :name "Transforms" :namespace "transforms"
                            :kinds #{:collection :python-library :transform :transform-job :transform-tag}}})

(defn area-root
  "The identity of the root of the area whose `:area` is `area` (of [[area-roots]]), or nil."
  [area]
  (some (fn [[id a]] (when (= area (:area a)) id)) area-roots))

(registry/def ::kind
  (into [:enum] (sort kinds)))

(registry/def ::entity-id
  ;; The schema of `metabase.util.malli.schema/NanoIdString`, which babashka cannot load; a test checks that the two
  ;; agree.
  [:re #"^[A-Za-z0-9_\-]{21}$"])

(registry/def ::natural-key
  "The natural key of an environment object: the database name, then the schema, table and field names, as far as the
  object needs. A schema name can be nil."
  [:and
   [:vector {:min 1} [:maybe :string]]
   [:fn {:error/message "the database name is a string"} (comp string? first)]])

(registry/def ::table-key
  "The natural key of a table: `[database schema table]`."
  [:and
   ::natural-key
   [:fn {:error/message "a table key has three parts"} #(= 3 (count %))]
   [:fn {:error/message "the table name is a string"} (comp string? peek)]])

(registry/def ::identity
  "The identity of an item: the natural key of its table for a published table, else an entity id."
  [:or ::entity-id ::table-key])

(registry/def ::target
  "The target of a reference: an item, or an environment object by its natural key."
  [:or ::identity [:tuple [:= :env] ::natural-key]])

(registry/def ::ref
  "A reference: `[role target]`."
  [:tuple :keyword ::target])

(registry/def ::item
  "The content of an item. `:place` is the identity of its container, or nil at the root level. `:attrs` holds every
  other content attribute, in portable form, with no attribute at its default value."
  [:map {:closed true}
   [:kind  ::kind]
   [:name  [:string {:min 1}]]
   [:place [:maybe ::identity]]
   [:refs  [:set ::ref]]
   [:attrs [:map-of :keyword :any]]])

(defn- identity-fits-kind?
  [[id {:keys [kind]}]]
  (if (= :published-table kind)
    (registry/validate ::table-key id)
    (registry/validate ::entity-id id)))

(registry/def ::snapshot
  "`{identity item}`. A snapshot need not be well formed: a place or a reference can name an identity that is not in
  it."
  [:and
   [:map-of ::identity ::item]
   [:fn {:error/message "a published table has a table key as its identity, every other kind an entity id"}
    #(every? identity-fits-kind? %)]])

(defn compare-identities
  "A total order on identities: every entity id before every table key; entity ids by string order, table keys part
  by part, with a nil schema first."
  [a b]
  (let [sa (string? a), sb (string? b)]
    (cond
      (and sa sb) (compare a b)
      sa          -1
      sb          1
      :else       (compare a b))))
