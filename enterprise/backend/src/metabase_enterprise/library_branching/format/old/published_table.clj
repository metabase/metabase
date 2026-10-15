(ns metabase-enterprise.library-branching.format.old.published-table
  "The old format of the kind `:published-table`. One item comes from several files, each a part of it:

  - the settings of the table (serdes model TableUserSettings), with the publication; the file that v64 wrote holds
    the settings of the fields too, under `fields`;
  - the settings of each field (FieldUserSettings);
  - the remappings of the fields (Dimension, and the `dimensions` of a Field file that an older version wrote).

  A value of a settings file is an attribute iff the user set it, as the instance reads the settings rows: a column
  with a flag (`description_set`, ...) iff its flag is true, any other column iff it is not nil."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.old.common :as common]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Values ------------------------------------------------------

(def ^:private table-columns
  "The columns of a table settings file that are attributes."
  [:description :entity_type :field_order :caveats :points_of_interest :show_in_getting_started :data_authority
   :data_source :data_layer :owner_email])

(def ^:private table-flags
  {:description        :description_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set})

(def ^:private field-columns
  "The columns of a field settings file that are field settings, with `fk_target_field_id` as `:fk_target`."
  [:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
   :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity :custom_position
   :fk_target_field_id])

(def ^:private field-flags
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(def ^:private legacy-data-layers
  "The data layers of the medallion names before v59, and the value that Metabase stores for each."
  {"copper" "hidden", "bronze" "final", "silver" "final", "gold" "final"})

(defn- user-set?
  [flags doc column]
  (if-let [flag (get flags column)]
    (true? (get doc flag))
    (some? (get doc column))))

(defn- user-values
  [flags doc columns set?]
  (common/present (into {} (map (fn [column] [column (when (set? flags doc column) (get doc column))])) columns)))

(defn table-values
  "The attributes that table settings document `doc` gives, without `:fields`."
  [doc]
  (cond-> (user-values table-flags doc table-columns user-set?)
    (contains? legacy-data-layers (:data_layer doc)) (update :data_layer legacy-data-layers)))

(defn- field-set?
  [flags doc column]
  (if (= :coercion_strategy column)
    ;; As the instance reads it: a coercion strategy is the user's iff the user set the effective type.
    (some? (:effective_type doc))
    (user-set? flags doc column)))

(defn field-values
  "The field settings that field settings document `doc` gives."
  [doc]
  (let [values (user-values field-flags doc field-columns field-set?)]
    (cond-> (dissoc values :fk_target_field_id)
      (contains? values :fk_target_field_id) (assoc :fk_target (:fk_target_field_id values)))))

;;; ------------------------------------------------------ Parts -------------------------------------------------------

(defn- table-key!
  [k]
  (if (registry/validate ::snapshot/table-key k)
    k
    (codec/invalid! (str "The table is not a table key: " (pr-str k)))))

(defn- field-key!
  [k]
  (if (and (vector? k) (< 3 (count k)) (registry/validate ::snapshot/table-key (subvec k 0 3))
           (every? string? (subvec k 3)))
    k
    (codec/invalid! (str "The field is not a field key: " (pr-str k)))))

(defn- part
  [table-key type & {:as more}]
  (merge {:of [:published-table table-key] :type type} more))

(defn- field-part
  [source doc]
  (let [k (field-key! (:field_id doc))]
    (part (subvec k 0 3) :field :key k :values (field-values doc) :source source)))

(defn decode-table-settings
  "The parts of a table settings document: the table settings, and the field settings that a v64 file holds."
  [doc _opts]
  (let [k (table-key! (:table_id doc))]
    {:parts (cons (part k :table :doc doc)
                  (map (fn [entry]
                         (if (map? entry) (field-part :nested entry) (codec/invalid! "A field entry is not a map.")))
                       (:fields doc)))}))

(defn decode-field-settings
  "The part of a field settings document."
  [doc _opts]
  {:parts [(field-part :file doc)]})

(defn remapping
  "The `:remapping` field setting of dimension document `doc`. The old format holds no values of an internal remapping."
  [doc]
  (when-not (map? doc)
    (codec/invalid! "A dimension is not a map."))
  (case (some-> (:type doc) name)
    "external" {:type  "external"
                :name  (:name doc)
                :field (field-key! (or (:human_readable_field_id doc)
                                       (codec/invalid! "A foreign-key remapping has no target field.")))}
    "internal" {:type "internal" :name (:name doc)}
    (codec/invalid! (str "A dimension of an unknown type: " (pr-str (:type doc))))))

(defn decode-dimension
  "The part of a dimension document: a remapping of its field."
  [doc _opts]
  (let [k (field-key! (:field_id doc))]
    {:parts [(part (subvec k 0 3) :remapping :key k :remapping (remapping doc) :source :file)]}))

(defn decode-field
  "A field document that an older version wrote: the field itself is environment, and its `dimensions` are
  remappings."
  [doc _opts]
  (if-let [dimensions (seq (:dimensions doc))]
    (let [k (field-key! (conj (if (vector? (:parent_id doc)) (:parent_id doc) (table-key! (:table_id doc)))
                              (:name doc)))]
      {:parts (mapv (fn [d] (part (subvec k 0 3) :remapping :key k :remapping (remapping d) :source :field))
                    dimensions)})
    {:skip :environment}))

(defn decode-table
  "A table document: the table is environment; its settings file holds what the user set."
  [_doc _opts]
  {:skip :environment})

;;; ----------------------------------------------------- Assembly -----------------------------------------------------

(defn- field-path
  [field-key]
  (vec (interpose :fields (map keyword (subvec field-key 3)))))

(defn- from-file?
  "True iff field part `p` is of a field settings file, not of an entry in a v64 table settings file."
  [p]
  (= :file (:source p)))

(defn- by-field
  "`[[field-key part] ...]` of the parts `parts`: for each field, its part of a file of its own, else the first."
  [parts]
  (->> (group-by :key parts)
       (map (fn [[k ps]] [k (or (some (fn [p] (when (from-file? p) p)) ps) (first ps))]))
       (sort-by (comp pr-str first))))

(defn- fields-attr
  "The `:fields` attribute of the field parts `parts` and the remapping parts `remappings`: for each field, the part of
  its settings file, else the entry of a v64 table settings file; and the remapping of its Dimension file, else the
  first of the dimensions of its field file."
  [parts remappings]
  (let [settings (reduce (fn [acc [k {:keys [values]}]]
                           (if (seq values) (update-in acc (field-path k) merge values) acc))
                         {}
                         (by-field parts))]
    (reduce (fn [acc [k {:keys [remapping]}]]
              (assoc-in acc (conj (field-path k) :remapping) remapping))
            settings
            (by-field remappings))))

(defn- duplicates
  "`tree/duplicate-findings` of the parts `parts`, each with its `:file`, by `id-of`."
  [id-of parts]
  (tree/duplicate-findings (map (fn [p] {:item [(id-of p)] :file (:file p)}) parts)))

(defn assemble
  "The published table with key `table-key` from its parts `parts`: `{:doc d :file n}`, where `n` is the file of its
  settings; `{:skip reason}` when the table is not published; or `{:findings [f ...]}`. A table with no settings file
  is not published. With no display name in its settings, the name is `(get (:table-names opts) table-key)`, else
  the table name of the key."
  [table-key parts {:keys [table-names]}]
  (let [{settings :table fields :field remappings :remapping} (group-by :type parts)
        findings (concat (duplicates (constantly table-key) settings)
                         (duplicates :key (filter from-file? fields))
                         (duplicates :key (filter from-file? remappings)))
        {:keys [doc file]} (first settings)]
    (cond
      (seq findings)                 {:findings (vec findings)}
      (empty? settings)              {:skip :unpublished}
      (not (true? (:is_published doc))) {:skip :unpublished}
      :else
      {:file file
       :doc  (common/item-doc :published-table table-key
                              (merge (table-values doc)
                                     {:display_name (or (:display_name doc) (get table-names table-key) (peek table-key))
                                      :collection   (:collection_id doc)
                                      :fields       (fields-attr fields remappings)}))})))
