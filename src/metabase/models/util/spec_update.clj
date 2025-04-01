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

(defn- format-path
  [path]
  (str (str/join #" / " (map #(if (keyword? %) (name %) %) path)) ":"))

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

(defn- compare-cols-fn
  [spec]
  (if-let [compare-cols (:compare-cols spec)]
    (fn [row]
      (select-keys row compare-cols))
    identity))

(declare handle-map-update!)
(declare do-update!*)

(defn- handle-nested-updates!
  [existing-row new-row nested-specs path]
  (doseq [[k spec] nested-specs]
    (do-update!* (get existing-row k) (get new-row k) spec (conj path k))))

(defn- with-parent-id
  [row nested-specs parent-id]
  (into row (for [[k {:keys [fk-column multi-row?]}] nested-specs
                  :when fk-column]
              [k (if multi-row?
                   (map #(assoc % fk-column parent-id) (get row k))
                   (some-> (get row k)
                           (assoc fk-column parent-id)))])))

(defn- sanitize-row-fn
  "Return a function that sanitizes the row to be inserted/updated."
  [{:keys [compare-cols extra-cols fk-column] :as _spec}]
  #(select-keys % (filter some? (concat compare-cols extra-cols [fk-column]))))

(defn- has-refs-to-parent?
  "Check if a spec has any nested specs with ref-in-parent relationships."
  [spec]
  (boolean (some (fn [[_k nested-spec]]
                   (:ref-in-parent nested-spec))
                 (:nested-specs spec))))

(declare process-nested-refs-for-row)
(declare process-reverse-references-and-get-fields)

;; Perform create/update/delete operations on a single entity and return its ID if created/updated
(defn- apply-entity-changes!
  "Apply changes to a single entity. Returns the entity ID if created/updated, or nil if deleted."
  [model existing-data new-data spec path]
  (let [sanitize-row       (sanitize-row-fn spec)
        compare-row        (compare-cols-fn spec)
        id-col             (:id-col spec)
        existing-id        (when existing-data (id-col existing-data))
        ;; Process any nested ref-in-parent relationships first
        new-data-with-refs (when new-data
                             (process-nested-refs-for-row new-data spec path))
        new-data-sanitized (when new-data-with-refs
                             (sanitize-row new-data-with-refs))]
    (cond
      ;; delete
      (nil? new-data)
      (when existing-id
        (log/debugf "%s Deleting %s %s" (format-path path) model existing-id)
        (t2/delete! model existing-id)
        nil)

      ;; create
      (nil? existing-data)
      (let [entity-id (t2/insert-returning-pk! model new-data-sanitized)]
        (log/debugf "%s Created a new entity %s %s" (format-path path) model entity-id)
        entity-id)

      ;; delete and create when id changes
      (and existing-id (not= (id-col new-data) existing-id))
      (do
        (log/debugf "%s ID changed from %s to %s - deleting and recreating"
                    (format-path path) existing-id (id-col new-data))
        (t2/delete! model existing-id)
        (let [entity-id (t2/insert-returning-pk! model new-data-sanitized)]
          (log/debugf "%s Created a new entity %s %s" (format-path path) model entity-id)
          entity-id))

      ;; update
      (not= (compare-row new-data-sanitized) (compare-row (sanitize-row existing-data)))
      (do
        (log/debugf "%s Updating %s %s" (format-path path) model existing-id)
        (t2/update! model existing-id new-data-sanitized)
        existing-id)

      ;; no change
      :else
      (do
        (log/debugf "%s no change detected for %s %s" (format-path path) model existing-id)
        existing-id))))

;; Process any nested model with a ref-in-parent relationship and return field updates
(defn- process-reverse-references-and-get-fields
  [nested-specs parent-data path]
  (when (and nested-specs parent-data)
    (let [field-updates (atom {})]
      (doseq [[k spec] nested-specs]
        (when-let [ref-col (:ref-in-parent spec)]
          (log/debugf "%s Processing reverse reference: %s with ref-in-parent column %s"
                      (format-path path) k ref-col)
          (let [child-data (get parent-data k)
                model (:model spec)
                child-id (cond
                          ;; Create or update if we have child data
                           child-data
                           (let [id (get child-data (:id-col spec :id))
                                 existing-child (when id (t2/select-one model id))
                                 child-path (conj path k)]
                            ;; Use our common entity update function
                             (apply-entity-changes! model existing-child child-data spec child-path))

                          ;; Handle explicit nil case - don't create or delete, leave ref as nil
                           (contains? parent-data k)
                           nil)]
            ;; Add field update to our collection - only when the value should be updated
            (when (or child-id (contains? parent-data k))
              (swap! field-updates assoc ref-col child-id)))))
      @field-updates)))

(defn- process-nested-refs-for-row
  "Process reverse references for a row and return the updated row with reference IDs.
   If update-db? is true, also updates the row in the database with the new reference IDs."
  [row spec path & {:keys [update-db?]}]
  (if-let [nested-specs (:nested-specs spec)]
    (let [reverse-ref-fields (process-reverse-references-and-get-fields nested-specs row path)]
      (if (seq reverse-ref-fields)
        (let [row-with-refs (merge row reverse-ref-fields)]
          ;; Update the database if requested and we have an ID
          (when (and update-db? ((:id-col spec :id) row))
            (log/debugf "%s Updating with reverse references: %s"
                        (format-path path)
                        reverse-ref-fields)
            (t2/update! (:model spec) ((:id-col spec :id) row) reverse-ref-fields))
          row-with-refs)
        row))
    row))

(defn- handle-row-nested-updates!
  [row existing-rows {:keys [nested-specs id-col] :as spec} path]
  (when nested-specs
    (log/tracef "%s nested models detected, updating nested models" (format-path path))
    (let [existing-row (m/find-first #(= (id-col row) (id-col %)) existing-rows)
          row-id (id-col row)
          ;; Process nested refs and update row in database if needed
          row-with-refs (process-nested-refs-for-row row spec (conj path row-id) :update-db? true)]

      ;; Continue with regular nested updates
      (handle-nested-updates!
       existing-row
       (with-parent-id row-with-refs nested-specs row-id)
       nested-specs
       (conj path row-id)))))

(defn- handle-sequential-updates!
  [existing-rows new-rows {:keys [model nested-specs id-col] :as spec} path]
  (let [{:keys [to-update
                to-create
                to-delete
                to-skip]} (u/row-diff existing-rows new-rows
                                      :to-compare (compare-cols-fn spec) :id-fn id-col)
        sanitize-row     (sanitize-row-fn spec)]
    (when (seq to-create)
      (if nested-specs
        (do
          (log/tracef "%s nested spec found, creating rows one by one" (format-path path))
          (doseq [row to-create]
            ;; Process nested refs for new rows before creating
            (let [row-with-refs (process-nested-refs-for-row row spec path)
                  parent-id (t2/insert-returning-pk! model (sanitize-row row-with-refs))]
              (log/debugf "%s created a new entity %s %s" (format-path path) model parent-id)
              (handle-nested-updates! nil (with-parent-id row nested-specs parent-id) nested-specs (conj path parent-id)))))
        (do
          (log/tracef "%s no nested spec found, batch creating %d new rows of %s" (format-path path) (count to-create) model)
          (let [rows (map sanitize-row to-create)]
            (t2/insert! model rows)))))

    (when (seq to-delete)
      ;; TODO: cascade deletes?
      (log/debugf "%s deleting %d rows with ids %s" (format-path path) (count to-delete) (str/join ", " (map id-col to-delete)))
      (t2/delete! model id-col [:in (map id-col to-delete)]))

    (when (seq to-update)
      (log/tracef "%s Attempt updating %s rows of %s" (format-path path) (count to-update) model)
      (doseq [row to-update]
        (let [path (conj path (id-col row))]
          (log/debugf "%s Updating" (format-path path))
          (t2/update! model (id-col row) (sanitize-row row))
          (handle-row-nested-updates! row existing-rows spec path))))

    ;; the row might not change, but the nested models might
    (when (and (seq to-skip) nested-specs)
      (log/tracef "%s nested models detected, updating unchanged nested models for %s %s"
                  (format-path path) model (id-col (first to-skip)))
      (doseq [row to-skip]
        (log/tracef "%s updating nested models for %s %s" (format-path path) model (id-col row))
        (handle-row-nested-updates! row existing-rows spec path)))))

(defn- handle-map-update!
  [existing-data new-data {:keys [model nested-specs] :as spec} path]
  ;; Apply changes to this entity (already processes nested refs)
  (let [entity-id (apply-entity-changes! model existing-data new-data spec path)]
    ;; Handle nested updates if entity still exists
    (when (and entity-id nested-specs)
      (let [updated-path (conj path entity-id)]
        (handle-nested-updates!
         existing-data
         (with-parent-id new-data nested-specs entity-id)
         nested-specs
         updated-path)))))

(defn- do-update!*
  [existing-data new-data spec path]
  (if (:multi-row? spec)
    (do
      (log/tracef "%s multi-row spec found" (format-path path))
      (handle-sequential-updates! existing-data new-data spec path))
    (do
      (log/tracef "%s single row spec found" (format-path path))
      (handle-map-update! existing-data new-data spec path))))

(mu/defn do-update!
  "Update data in the database based on the diff between existing and new data.
  `spec` defines the structure of the data and how to compare it."
  [existing-data new-data spec :- ::Spec]
  (t2/with-transaction []
    (do-update!* existing-data new-data spec ["root"])))
