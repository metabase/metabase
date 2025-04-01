(ns metabase.models.util.spec-update
  "Perform Creation/Update/Deletion with a spec."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;; Helpers
(defn- format-path [path]
  (str (str/join " / " (map #(if (keyword? %) (name %) %) path)) ":"))

;; Schema definition
(mr/def ::Spec
  [:schema {:registry {::spec [:map {:closed true}
                               [:model                         :keyword]
                               [:id-col       {:optional true
                                               :default :id}   :keyword]
                               ;; whether this nested model is a sequentials with respect to the parent model
                               [:multi-row?   {:optional true
                                               :default false} :boolean]
                               ;; the foreign key column in the nested model with respect to the parent model
                               [:fk-column    {:optional true} :keyword]
                               ;; the column in parent model that references this nested model (reverse relationship)
                               [:ref-in-parent {:optional true} :keyword]
                               ;; A list of columns that should be compared to determine if the row has changed
                               [:compare-cols {:optional true} [:sequential :keyword]]
                               ;; other columns that are not part of compare-cols but are part of the table
                               ;; these columns will be added when create / update
                               [:extra-cols   {:optional true} [:sequential :keyword]]
                               [:nested-specs {:optional true} [:map-of :keyword [:ref ::spec]]]]}}
   [:ref ::spec]])

(defn decode-spec
  "Decode a spec with default value transformer."
  [spec]
  (mc/decode
   ::Spec
   spec
   (mtx/default-value-transformer {::mtx/add-optional-keys true})))

(defn validate-spec!
  "Check whether a given spec is valid"
  [spec]
  (when-let [info (mr/explain ::Spec spec)]
    (throw (ex-info (str "Invalid spec for " (:model spec) ": " (me/humanize info)) info))))

(defmacro define-spec
  "Define a spec for update."
  [spec-name docstring spec]
  `(let [spec# ~spec]
     (validate-spec! spec#)
     (def ~spec-name ~docstring (decode-spec spec#))))

;; Helper functions for entity operations
(defn- get-comparison-fn [{:keys [compare-cols]}]
  (if compare-cols
    #(select-keys % compare-cols)
    identity))

(defn- get-sanitizer-fn [{:keys [compare-cols extra-cols fk-column]}]
  #(select-keys % (filter some? (concat compare-cols extra-cols [fk-column]))))

(declare process-entity!*)

;; Handle nested entity operations
(defn- process-nested-entities!
  [existing-entity new-entity nested-specs path]
  (doseq [[k spec] nested-specs]
    (process-entity!* (get existing-entity k) (get new-entity k) spec (conj path k))))

(defn- attach-parent-id
  [entity nested-specs parent-id]
  (into entity
        (for [[k {:keys [fk-column multi-row?]}] nested-specs
              :when fk-column]
          [k (if multi-row?
               (map #(assoc % fk-column parent-id) (get entity k))
               (some-> (get entity k)
                       (assoc fk-column parent-id)))])))

(declare process-single-entity!)

;; Reference handling
(defn- process-reverse-references
  [nested-specs parent-entity path]
  (when (and nested-specs parent-entity)
    (into {}
          (for [[k spec] nested-specs
                :let [ref-col      (:ref-in-parent spec)]
                :when ref-col
                :let [child-entity (get parent-entity k)
                      model (:model spec)
                      id-col (:id-col spec :id)
                      child-id (cond
                                 ;; If child entity exists with ID, check if we need to update it first
                                 (and child-entity (get child-entity id-col))
                                 (let [id (get child-entity id-col)
                                       existing-child (when id (t2/select-one model id))
                                       child-path (conj path k)]
                                   ;; Update the child if needed, then return its ID
                                   (if existing-child
                                     (process-single-entity! model existing-child child-entity spec child-path)
                                     id))

                                 ;; Create a new child if needed and get its ID
                                 child-entity
                                 (let [child-path (conj path k)]
                                   (process-single-entity! model nil child-entity spec child-path))

                                 ;; Handle explicit nil case
                                 (contains? parent-entity k)
                                 nil)]
                :when (or child-id (contains? parent-entity k))]
            [ref-col child-id]))))

(defn- with-processed-refs
  "Process reverse references for an entity and return the updated entity with reference IDs."
  [entity spec path]
  (if-let [nested-specs (:nested-specs spec)]
    (let [reverse-ref-fields (process-reverse-references nested-specs entity path)]
      (if (seq reverse-ref-fields)
        (let [entity-with-refs (merge entity reverse-ref-fields)]
          (log/debugf "%s Collected reverse references: %s"
                      (format-path path)
                      reverse-ref-fields)
          entity-with-refs)
        entity))
    entity))

;; Entity operations
(defn- process-single-entity!
  "Apply changes to a single entity. Returns the entity ID if created/updated, or nil if deleted."
  [model existing-entity new-entity spec path]
  (let [sanitize (get-sanitizer-fn spec)
        compare-fn (get-comparison-fn spec)
        id-col (:id-col spec)
        existing-id (when existing-entity (id-col existing-entity))]
    (cond
      ;; delete
      (nil? new-entity)
      (when existing-id
        (log/debugf "%s Deleting %s %s" (format-path path) model existing-id)
        (t2/delete! model existing-id)
        nil)

      ;; create
      (nil? existing-entity)
      (let [;; Process any ref-in-parent relationships FIRST
            new-entity-with-refs (with-processed-refs new-entity spec path)
            new-entity-sanitized (sanitize new-entity-with-refs)
            entity-id (t2/insert-returning-pk! model new-entity-sanitized)]
        (log/debugf "%s Created a new entity %s %s" (format-path path) model entity-id)
        entity-id)

      ;; delete and create when id changes
      (and existing-id (not= (id-col new-entity) existing-id))
      (do
        (log/debugf "%s ID changed from %s to %s - deleting and recreating"
                    (format-path path) existing-id (id-col new-entity))
        (t2/delete! model existing-id)
        (let [;; Process any ref-in-parent relationships FIRST
              new-entity-with-refs (with-processed-refs new-entity spec path)
              new-entity-sanitized (sanitize new-entity-with-refs)
              entity-id (t2/insert-returning-pk! model new-entity-sanitized)]
          (log/debugf "%s Created a new entity %s %s" (format-path path) model entity-id)
          entity-id))

      ;; update - process refs first, then compare if changes are needed
      :else
      (let [;; Process any ref-in-parent relationships FIRST
            new-entity-with-refs (with-processed-refs new-entity spec path)
            new-entity-sanitized (sanitize new-entity-with-refs)]
        (if (not= (compare-fn new-entity-sanitized) (compare-fn (sanitize existing-entity)))
          (do
            (log/debugf "%s Updating %s %s" (format-path path) model existing-id)
            (t2/update! model existing-id new-entity-sanitized)
            existing-id)
          (do
            (log/debugf "%s No change detected for %s %s" (format-path path) model existing-id)
            existing-id))))))

(defn- process-entity-with-nested!
  [entity existing-entities {:keys [nested-specs id-col model] :as spec} path]
  (when nested-specs
    (log/tracef "%s Nested models detected, updating nested models" (format-path path))
    (let [existing-entity (m/find-first #(= (id-col entity) (id-col %)) existing-entities)
          entity-id (id-col entity)
          ;; Process nested refs to get updated references
          entity-with-refs (with-processed-refs entity spec (conj path entity-id))

          ;; Extract just the reference fields to update in the database
          reference-updates (select-keys entity-with-refs
                                         (for [[k spec] nested-specs
                                               :when (:ref-in-parent spec)]
                                           (:ref-in-parent spec)))]

      ;; Update the parent entity with new references if there are any
      (when (seq reference-updates)
        (log/debugf "%s Updating parent with references: %s"
                    (format-path (conj path entity-id))
                    reference-updates)
        (t2/update! model entity-id reference-updates))

      ;; Now attach parent ID to nested models
      (let [entity-with-parent-refs (attach-parent-id entity-with-refs nested-specs entity-id)]
        ;; Process nested entities with updated references
        (process-nested-entities!
         existing-entity
         entity-with-parent-refs
         nested-specs
         (conj path entity-id))))))

(defn- process-multi-row!
  [existing-entities new-entities {:keys [model nested-specs id-col] :as spec} path]
  (let [{:keys [to-update to-create to-delete to-skip]}
        (u/row-diff existing-entities new-entities
                    :to-compare (get-comparison-fn spec) :id-fn id-col)
        sanitize (get-sanitizer-fn spec)]

    ;; Create new entities
    (when (seq to-create)
      (if nested-specs
        (do
          (log/tracef "%s Nested spec found, creating entities one by one" (format-path path))
          (doseq [entity to-create]
            ;; Process references first
            (let [entity-with-refs (with-processed-refs entity spec path)
                  ;; Then create with references properly set
                  sanitized-entity (sanitize entity-with-refs)
                  parent-id (t2/insert-returning-pk! model sanitized-entity)]
              (log/debugf "%s Created a new entity %s %s with references"
                          (format-path path) model parent-id)
              (process-nested-entities!
               nil
               (attach-parent-id entity-with-refs nested-specs parent-id)
               nested-specs
               (conj path parent-id)))))
        (do
          (log/tracef "%s No nested spec found, batch creating %d new entities of %s"
                      (format-path path) (count to-create) model)
          ;; Still process any references that might exist
          (t2/insert! model (map #(sanitize (with-processed-refs % spec path)) to-create)))))

    ;; Delete entities
    (when (seq to-delete)
      (log/debugf "%s Deleting %d entities with ids %s"
                  (format-path path) (count to-delete) (str/join ", " (map id-col to-delete)))
      (t2/delete! model id-col [:in (map id-col to-delete)]))

    ;; Update changed entities
    (when (seq to-update)
      (log/tracef "%s Updating %d entities of %s" (format-path path) (count to-update) model)
      (doseq [entity to-update]
        (let [entity-path (conj path (id-col entity))
              ;; Process references first
              entity-with-refs (with-processed-refs entity spec entity-path)
              ;; Update with all fields including references
              sanitized-entity (sanitize entity-with-refs)]
          (log/debugf "%s Updating with references" (format-path entity-path))
          (t2/update! model (id-col entity) sanitized-entity)
          (process-entity-with-nested! entity-with-refs existing-entities spec path))))

    ;; Process nested entities for unchanged entities
    (when (and (seq to-skip) nested-specs)
      (log/tracef "%s Processing nested models for unchanged entities" (format-path path))
      (doseq [entity to-skip]
        (log/tracef "%s Updating nested models for %s %s" (format-path path) model (id-col entity))
        (process-entity-with-nested! entity existing-entities spec path)))))

(defn- process-map-entity!
  [existing-entity new-entity {:keys [model nested-specs] :as spec} path]
  ;; Apply changes to this entity (already processes nested refs)
  (let [entity-id (process-single-entity! model existing-entity new-entity spec path)]
    ;; Handle nested updates if entity still exists
    (when (and entity-id nested-specs)
      (let [updated-path (conj path entity-id)]
        (process-nested-entities!
         existing-entity
         (attach-parent-id new-entity nested-specs entity-id)
         nested-specs
         updated-path)))))

(defn- process-entity!*
  [existing-entity new-entity spec path]
  (if (:multi-row? spec)
    (do
      (log/tracef "%s Multi-entity collection found" (format-path path))
      (process-multi-row! existing-entity new-entity spec path))
    (do
      (log/tracef "%s Single entity spec found" (format-path path))
      (process-map-entity! existing-entity new-entity spec path))))

(mu/defn do-update!
  "Update data in the database based on the diff between existing and new data.
  `spec` defines the structure of the data and how to compare it."
  [existing-data new-data spec :- ::Spec]
  (t2/with-transaction []
    (process-entity!* existing-data new-data spec ["root"])))
