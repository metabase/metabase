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

(defn- ref-nested-models
  "Return a map of nested models that have a ref-in-parent."
  [nested-specs]
  (into {} (filter (comp :ref-in-parent second)) nested-specs))

(defn- non-ref-nested-models
  "Return a map of nested models that don't have a ref-in-parent.
   When row is provided, only return models that are present in the row."
  ([nested-specs]
   (into {} (filter (comp not :ref-in-parent second)) nested-specs))
  ([nested-specs row]
   (into {} (for [[k spec] nested-specs
                  :when (and (not (:ref-in-parent spec))
                             (contains? row k))]
              [k spec]))))

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
                               ;; the foreign key column in the parent model with respect to the nested model
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
      (let [ref-cols (keep (fn [[_ nested-spec]]
                             (:ref-in-parent nested-spec))
                           (:nested-specs spec))]
        (select-keys row (concat compare-cols ref-cols))))
    identity))

(declare handle-map-update!)
(declare do-update!*)

(defn- handle-nested-updates!
  [existing-row new-row nested-specs path]
  (doseq [[k spec] nested-specs]
    (do-update!* (get existing-row k) (get new-row k) spec (conj path k))))

(defn- handle-refs-in-parent!
  "Process nested models with ref-in-parent, returning a map with updated parent foreign keys."
  [existing-row new-row nested-specs path]
  (let [ref-specs (ref-nested-models nested-specs)]
    (when (seq ref-specs)
      (reduce (fn [parent-updates [k {:keys [ref-in-parent] :as spec}]]
                (let [existing-nested (get existing-row k)
                      new-nested      (get new-row k)
                      path            (conj path k)]
                  (log/tracef "%s processing ref-in-parent for %s" (format-path path) ref-in-parent)
                  (assoc parent-updates ref-in-parent (handle-map-update! existing-nested new-nested spec path))))
              {} ref-specs))))

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
  [{:keys [compare-cols extra-cols fk-column nested-specs] :as _spec}]
  (let [ref-in-parent-cols (when nested-specs
                             (keep (fn [[_ {:keys [ref-in-parent]}]]
                                     ref-in-parent)
                                   nested-specs))]
    #(select-keys % (filter some? (concat compare-cols extra-cols [fk-column] ref-in-parent-cols)))))

(defn- handle-rows-update!
  "Process updates for a single row, handling both parent refs and nested models.
   Returns true if any changes were made."
  [row existing-rows {:keys [model nested-specs id-col] :as spec} path & {:keys [force-update?] :or {force-update? true}}]
  (let [existing-row (m/find-first #(= (id-col row) (id-col %)) existing-rows)
        update-path (if force-update? (conj path (id-col row)) path)
        _ (when force-update? (log/debugf "%s Updating" (format-path update-path)))
        ;; Process any ref-in-parent models first
        parent-updates (handle-refs-in-parent! existing-row row nested-specs update-path)
        row-with-refs (merge row parent-updates)
        sanitize-row (sanitize-row-fn spec)
        updates-needed? (and parent-updates
                             (not= (sanitize-row (merge existing-row parent-updates))
                                   (sanitize-row row)))]

    ;; Update the parent row if needed
    (when (or force-update? updates-needed?)
      (t2/update! model (id-col row) (sanitize-row row-with-refs)))

    ;; Handle non-ref nested models
    (when nested-specs
      (let [nested-without-refs (non-ref-nested-models nested-specs row)]
        (when (seq nested-without-refs)
          (handle-nested-updates!
           existing-row
           (with-parent-id row-with-refs nested-without-refs (id-col row))
           nested-without-refs
           update-path))))

    (or force-update? updates-needed?)))

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
            (let [;; Process any ref-in-parent models first
                  parent-updates (handle-refs-in-parent! nil row nested-specs path)
                  row-with-refs  (merge row parent-updates)
                  parent-id (t2/insert-returning-pk! model (sanitize-row row-with-refs))]
              (log/debugf "%s created a new entity %s %s" (format-path path) model parent-id)
              ;; Only process non-ref nested models
              (let [nested-without-refs (non-ref-nested-models nested-specs row)]
                (when (seq nested-without-refs)
                  (handle-nested-updates!
                   nil
                   (with-parent-id row-with-refs nested-without-refs parent-id)
                   nested-without-refs
                   (conj path parent-id)))))))
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
        (handle-rows-update! row existing-rows spec path)))

    ;; the row might not change, but the nested models might
    (when (and (seq to-skip) nested-specs)
      (log/tracef "%s nested models detected, updating unchanged nested models for %s %s"
                  (format-path path) model (id-col (first to-skip)))
      (doseq [row to-skip]
        (handle-rows-update! row existing-rows spec path :force-update? false)))))

(defn- handle-map-update!
  [existing-data new-data {:keys [model nested-specs id-col] :as spec} path]
  (let [sanitize-row            (sanitize-row-fn spec)
        compare-row             (compare-cols-fn spec)
        existing-id             (when existing-data (id-col existing-data))
        ;; Process any ref-in-parent models first
        parent-updates          (when (and nested-specs new-data)
                                  (handle-refs-in-parent! existing-data new-data nested-specs path))
        new-data-with-refs      (if parent-updates (merge new-data parent-updates) new-data)
        new-data-sanitized      (when new-data-with-refs (sanitize-row new-data-with-refs))
        existing-data-sanitized (when existing-data (sanitize-row existing-data))
        handle-nested!          (fn [existing-data new-data parent-id]
                                  (when nested-specs
                                    (let [nested-without-refs (non-ref-nested-models nested-specs)]
                                      (when (seq nested-without-refs)
                                        (log/tracef "%s standard nested models detected, updating nested models %s %s"
                                                    (format-path path) model parent-id)
                                        (handle-nested-updates!
                                         existing-data
                                         (with-parent-id new-data nested-without-refs parent-id)
                                         nested-without-refs
                                         (conj path parent-id))))))]
    (cond
      ;; delete
      (nil? new-data)
      (do
        (log/debugf "%s Deleting" (format-path (conj path existing-id)))
        (t2/delete! model existing-id)
        (handle-nested! existing-data new-data existing-id)
        nil)

      ;; create
      (nil? existing-data)
      (let [parent-id (t2/insert-returning-pk! model new-data-sanitized)
            path      (conj path parent-id)]
        (log/debugf "%s Created a new entity %s %s" (format-path path) model parent-id)
        (handle-nested! nil new-data parent-id)
        parent-id)

      ;; delete and create when id changes
      (and existing-id (not= (id-col new-data) existing-id))
      (do
        (log/debugf "%s ID changed from %s to %s - deleting and recreating"
                    (format-path path) existing-id (id-col new-data))
        (t2/delete! model existing-id)
        (let [parent-id (t2/insert-returning-pk! model new-data-sanitized)
              path      (conj path parent-id)]
          (log/debugf "%s Created a new entity %s %s" (format-path path) model parent-id)
          (handle-nested! nil new-data parent-id)
          parent-id))

      ;; update
      (not= (compare-row new-data-sanitized) (compare-row existing-data-sanitized))
      (do
        (log/debugf "%s Updating" (format-path (conj path existing-id)))
        (t2/update! model existing-id new-data-sanitized)
        (handle-nested! existing-data new-data existing-id)
        existing-id)

      :else
      (do
        (log/debugf "%s no change detected for %s %s" (format-path path) model existing-id)
        (handle-nested! existing-data new-data existing-id)
        existing-id))))

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
