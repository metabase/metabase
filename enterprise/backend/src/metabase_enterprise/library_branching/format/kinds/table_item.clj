(ns metabase-enterprise.library-branching.format.kinds.table-item
  "What the codecs of the kinds that live on a published table share (`:segment`, `:measure`). The place is the
  table key of the published table, under `table`. The attribute `:definition` is an MBQL 5 query in its portable JSON
  form, with one MBQL stage whose source table is the place; the file omits the `:lib/type` keys that the query's
  structure implies."
  (:require
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn stage
  "The stage of `definition` when it has exactly one, else nil."
  [definition]
  (let [stages (:stages definition)]
    (when (and (vector? stages) (= 1 (count stages)) (map? (first stages)))
      (first stages))))

(defn table-stage?
  "True iff `definition` has one stage, whose source table is a table key. Each kind says which other keys the stage
  may have."
  [definition]
  (registry/validate ::snapshot/table-key (:source-table (stage definition))))

(defn stage-keys?
  "True iff the stage of `definition` has no keys but `:lib/type`, `:source-table` and those of `allowed`."
  [allowed definition]
  (every? (into #{:lib/type :source-table} allowed) (keys (stage definition))))

(registry/def ::definition
  [:and
   [:map
    [:database :string]
    [:stages [:vector {:min 1} [:map-of :keyword :any]]]]
   [:fn {:error/message "every stage of the definition has its :lib/type"} portable/implied-keys?]
   [:fn {:error/message "the definition is one MBQL stage on a table"} #'table-stage?]])

(defn source-table
  "The source table of the stage of `definition`, or nil."
  [definition]
  (:source-table (stage definition)))

(defn on-its-table?
  "True iff the place of `item` is the source table of its definition, and the database of the definition is the
  place's database."
  [{:keys [place attrs]}]
  (let [{:keys [definition]} attrs]
    (and (= place (source-table definition))
         (= (first place) (:database definition)))))

(def place-check
  "The item check of a table item: [[on-its-table?]]."
  [:fn {:error/message "the place is the table of the definition"} #'on-its-table?])

(defn home
  "A root-level table item, which a well-formed snapshot never has, is in `library/`."
  [_item]
  {:dir ["library"]})

(defn refs
  "The references of the definition of a table item."
  [_id attrs]
  (portable/query-refs (:definition attrs)))

(defn encode-attrs
  "The attributes as the file holds them: the definition without its implied keys."
  [attrs]
  (cond-> attrs
    (contains? attrs :definition) (update :definition portable/omit-implied)))

(defn decode-attrs
  "The inverse of [[encode-attrs]]."
  [attrs]
  (cond-> attrs
    (contains? attrs :definition) (update :definition portable/restore-implied)))

(defn spec
  "The codec spec of the table item kind `kind`, whose word is `word`, whose attributes are `attrs` (with
  `:definition`), and whose items also satisfy each schema of `checks`."
  [kind word attrs checks]
  {:kind         kind
   :word         word
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :place-key    :table
   :place-schema ::snapshot/table-key
   :attrs        attrs
   :encode-attrs #'encode-attrs
   :decode-attrs #'decode-attrs
   :refs         #'refs
   :checks       (into [place-check] checks)})
