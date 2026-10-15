(ns metabase-enterprise.library-branching.snapshot
  "The snapshot: the synced content of an instance or of a commit, as a plain value.

  A snapshot maps the identity of each item to the item's content. Two items are equal iff their values are equal."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def kinds
  "The closed set of item kinds."
  #{:collection :metric :published-table :snippet})

(def may-contain
  "`{kind #{kind}}`: for each kind of [[kinds]], the kinds of the items that an item of that kind can contain."
  {:collection      #{:collection :metric :published-table :snippet}
   :metric          #{}
   :published-table #{}
   :snippet         #{}})

(mr/def ::kind
  (into [:enum] (sort kinds)))

(mr/def ::entity-id
  ms/NanoIdString)

(mr/def ::natural-key
  "The natural key of an environment object: the database name, then the schema, table and field names, as far as the
  object needs. A schema name can be nil."
  [:and
   [:vector {:min 1} [:maybe :string]]
   [:fn {:error/message "the database name is a string"} (comp string? first)]])

(mr/def ::table-key
  "The natural key of a table: `[database schema table]`."
  [:and
   ::natural-key
   [:fn {:error/message "a table key has three parts"} #(= 3 (count %))]
   [:fn {:error/message "the table name is a string"} (comp string? peek)]])

(mr/def ::identity
  "The identity of an item: the natural key of its table for a published table, else an entity id."
  [:or ::entity-id ::table-key])

(mr/def ::target
  "The target of a reference: an item, or an environment object by its natural key."
  [:or ::identity [:tuple [:= :env] ::natural-key]])

(mr/def ::ref
  "A reference: `[role target]`."
  [:tuple :keyword ::target])

(mr/def ::item
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
    (mr/validate ::table-key id)
    (mr/validate ::entity-id id)))

(mr/def ::snapshot
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
