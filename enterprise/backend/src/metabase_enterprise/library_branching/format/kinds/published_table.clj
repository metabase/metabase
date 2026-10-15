(ns metabase-enterprise.library-branching.format.kinds.published-table
  "The codec of the kind :published-table: a warehouse table that the Library publishes, as the file
  `<display name>.table.yaml`. Its identity is the table's natural key `[database schema table]`, its name is its
  display name (under `display_name`), and its place is the collection, under `collection`. The attributes are the
  values a person sets on the table and its fields; `:fields` maps each field name to its settings, a nested field
  under its parent's `:fields`."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def ^:private field-setting-schemas
  {:display_name       [:string {:min 1}]
   :description        :string
   :semantic_type      :string
   :visibility_type    :string
   :has_field_values   :string
   :effective_type     :string
   :coercion_strategy  :string
   :caveats            :string
   :points_of_interest :string
   :nfc_path           [:vector :string]
   :json_unfolding     :boolean
   :settings           ::common/document-map
   :data_sensitivity   :string
   :custom_position    :int
   :fk_target          ::snapshot/natural-key})

(registry/def ::fields
  [:schema
   {:registry {::field  [:and
                         (into [:map {:closed true}
                                [:fields {:optional true} [:ref ::fields]]]
                               (for [[k s] (sort-by key field-setting-schemas)]
                                 [k {:optional true} s]))
                         [:fn {:error/message "a field entry has a setting"} seq]]
               ::fields [:map-of {:min 1} :keyword [:ref ::field]]}}
   ::fields])

(defn home
  "A root-level published table is in `library/`."
  [_item]
  {:dir ["library"]})

(defn field-refs
  "The references of the field settings `fields` of the fields under natural key `path`: each field with settings,
  and each foreign-key target."
  [path fields]
  (into #{}
        (mapcat (fn [[k entry]]
                  (let [path   (conj path (subs (str k) 1))
                        target (:fk_target entry)]
                    (concat [[:field [:env path]]]
                            (when target [[:fk-target [:env target]]])
                            (field-refs path (:fields entry))))))
        fields))

(defn refs
  "The references of the published table `id`: its table, and [[field-refs]] of its fields."
  [id attrs]
  (conj (field-refs (vec id) (:fields attrs)) [:table [:env id]]))

(defn- table-of
  "The table key of an item's own `:table` reference."
  [{:keys [refs]}]
  (some (fn [[role target]] (when (= :table role) (second target))) refs))

(def spec
  "The spec of the published-table codec. The `_set` flags of the user settings are an instance mechanism, not
  attributes: an attribute is the value that the table shows. The table's `visibility_type` is not an attribute:
  Metabase derives it from `data_layer` on each save of the data layer."
  {:kind       :published-table
   :word       "table"
   :directory? false
   :home       #'home
   :id-schema  ::snapshot/table-key
   :name-key   :display_name
   :place-key  :collection
   :attrs      {:description             {:schema :string}
                :entity_type             {:schema :string}
                :field_order             {:schema :string}
                :caveats                 {:schema :string}
                :points_of_interest      {:schema :string}
                :show_in_getting_started {:schema :boolean :default false}
                :data_authority          {:schema :string}
                :data_source             {:schema :string}
                ;; Only the values that Metabase stores as they are: it stores a legacy value as another one.
                :data_layer              {:schema [:enum "final" "internal" "hidden"]}
                :owner_email             {:schema :string}
                :fields                  {:schema ::fields :default {}}}
   :refs       #'refs
   :refs-id    #'table-of})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :published-table."
  (common/codec spec ::item))
