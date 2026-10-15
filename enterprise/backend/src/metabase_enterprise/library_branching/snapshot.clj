(ns metabase-enterprise.library-branching.snapshot
  "The snapshot: the synced content of an instance or of a commit, as a plain value.

  A snapshot maps the identity of each item to the item's content. Two items are equal iff their values are equal."
  (:require
   [metabase-enterprise.library-branching.collation :as collation]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def kinds
  "The closed set of item kinds."
  #{:collection :dashboard :glossary-term :measure :metric :model :published-table :question :segment :snippet})

(def may-contain
  "`{kind #{kind}}`: for each kind of [[kinds]], the kinds of the items that an item of that kind can contain."
  {:collection      #{:collection :dashboard :metric :model :published-table :question :snippet}
   :dashboard       #{}
   :glossary-term   #{}
   :measure         #{}
   :metric          #{}
   :model           #{}
   :published-table #{:measure :segment}
   :question        #{}
   :segment         #{}
   :snippet         #{}})

(def unique-keys
  "`{kind {:path path :name? bool}}`: the kinds whose key the app DB keeps unique over all rows of the kind, the path of
  that key in an item, and whether the key is a name. Two names are one key iff their [[fold-name]] forms are equal.
  An item whose key is nil has none."
  {:snippet {:path [:name] :name? true}})

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

(def ref-kinds
  "`{kind {role #{kind}}}`: a reference of `role` from an item of `kind` names an item of one of these kinds. The
  table can name kinds outside [[kinds]]."
  {:action    {:model #{:model}}
   :dashboard {:action #{:action} :dashboard #{:dashboard}}})

(def system-ids
  "The identities of the system items that every instance of a release has from the install on: the Library
  collection and its sections Data, Metrics and Dashboards."
  #{"librarylibrarylibrary" "librarylibrarydatadat" "librarylibrarymetrics" "librarylibrarydashbrd"})

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
