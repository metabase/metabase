(ns metabase.models.util.spec-update
  "Perform Creation/Update/Deletion with a spec."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.events.core :as events]
   [metabase.models.db :as models.db]
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

(mr/def ::generic-row
  "A row of arbitrary shape, whatever the caller-supplied `spec` describes; not fixed by this namespace."
  [:maybe [:map {:closed false, :description "shape depends on the caller-supplied spec"}]])

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
                               [:nested-specs {:optional true} [:sequential [:tuple :keyword [:ref ::spec]]]]]}}
   [:ref ::spec]])

(mr/def ::topics
  "The lifecycle topics to publish the writes of the update under, as a map from a model to its `:create`, `:update` and
  `:delete` topics, any of which may be left out."
  [:maybe [:map-of :keyword [:map {:closed true}
                             [:create {:optional true} qualified-keyword?]
                             [:update {:optional true} qualified-keyword?]
                             [:delete {:optional true} qualified-keyword?]]]])

(defn- insert!
  "Insert the `rows` of `model`, publishing their create event when `topics` has a topic for it, and return the instances."
  [model rows topics]
  (let [instances (models.db/insert-entities-returning-instances! {:model model :rows rows})]
    (when-let [topic (get-in topics [model :create])]
      (events/publish-event! topic (events/create-event instances)))
    instances))

(defn- insert-one!
  "Insert the `row` of `model` as [[insert!]] does, and return its primary key."
  [model row topics]
  (get (first (insert! model [row] topics)) (first (t2/primary-keys model))))

(defn- update!
  "Write the columns `row` to the row of `model` with `id`, stored as `existing`, publishing its update event when
  `topics` has a topic for it."
  [model id existing row topics]
  (models.db/update-entity! id {:model model :row row})
  (when-let [topic (get-in topics [model :update])]
    (events/publish-event! topic (events/update-event {id (t2/instance model existing)} [(assoc row :id id)]))))

(defn- delete-many!
  "Delete the stored `rows` of `model`, publishing their delete event first when `topics` has a topic for it."
  [model id-col rows topics]
  (when (seq rows)
    (when-let [topic (get-in topics [model :delete])]
      (events/publish-event! topic (events/delete-event (mapv #(t2/instance model %) rows))))
    (models.db/delete-entities-with-ids! model id-col (map id-col rows))))

(defn- delete-one!
  "Delete the stored row `existing` of `model` with `id` as [[delete-many!]] does."
  [model id existing topics]
  (when existing
    (when-let [topic (get-in topics [model :delete])]
      (events/publish-event! topic (events/delete-event [(t2/instance model existing)])))
    (models.db/delete-entity! model id)))

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
  [existing-row new-row nested-specs path topics]
  (doseq [[k spec] nested-specs]
    (do-update!* (get existing-row k) (get new-row k) spec (conj path k) topics)))

(defn- handle-refs-in-parent!
  "Process nested models with ref-in-parent, returning a map with updated parent foreign keys."
  [existing-row new-row nested-specs path topics]
  (let [ref-specs (ref-nested-models nested-specs)]
    (when (seq ref-specs)
      (reduce (fn [parent-updates [k {:keys [ref-in-parent] :as spec}]]
                (let [existing-nested (get existing-row k)
                      new-nested      (get new-row k)
                      path            (conj path k)]
                  (log/tracef "%s processing ref-in-parent for %s" (format-path path) ref-in-parent)
                  (assoc parent-updates ref-in-parent (handle-map-update! existing-nested new-nested spec path topics))))
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
  [row existing-rows {:keys [model nested-specs id-col] :as spec} path topics & {:keys [force-update?] :or {force-update? true}}]
  (let [existing-row (m/find-first #(= (id-col row) (id-col %)) existing-rows)
        update-path (if force-update? (conj path (id-col row)) path)
        _ (when force-update? (log/debugf "%s Updating" (format-path update-path)))
        ;; Process any ref-in-parent models first
        parent-updates (handle-refs-in-parent! existing-row row nested-specs update-path topics)
        row-with-refs (merge row parent-updates)
        sanitize-row (sanitize-row-fn spec)
        updates-needed? (and parent-updates
                             (not= (sanitize-row (merge existing-row parent-updates))
                                   (sanitize-row row)))]
    ;; Update the parent row if needed
    (when (or force-update? updates-needed?)
      (update! model (id-col row) existing-row (sanitize-row row-with-refs) topics))
    ;; Handle non-ref nested models
    (when nested-specs
      (let [nested-without-refs (non-ref-nested-models nested-specs row)]
        (when (seq nested-without-refs)
          (handle-nested-updates!
           existing-row
           (with-parent-id row-with-refs nested-without-refs (id-col row))
           nested-without-refs
           update-path
           topics))))
    (or force-update? updates-needed?)))

(defn- handle-sequential-updates!
  [existing-rows new-rows {:keys [model nested-specs id-col] :as spec} path topics]
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
                  parent-updates (handle-refs-in-parent! nil row nested-specs path topics)
                  row-with-refs  (merge row parent-updates)
                  parent-id (insert-one! model (sanitize-row row-with-refs) topics)]
              (log/debugf "%s created a new entity %s %s" (format-path path) model parent-id)
              ;; Only process non-ref nested models
              (let [nested-without-refs (non-ref-nested-models nested-specs row)]
                (when (seq nested-without-refs)
                  (handle-nested-updates!
                   nil
                   (with-parent-id row-with-refs nested-without-refs parent-id)
                   nested-without-refs
                   (conj path parent-id)
                   topics))))))
        (do
          (log/tracef "%s no nested spec found, batch creating %d new rows of %s" (format-path path) (count to-create) model)
          (let [rows (map sanitize-row to-create)]
            (insert! model (vec rows) topics)))))
    (when (seq to-delete)
      ;; TODO: cascade deletes?
      (log/debugf "%s deleting %d rows with ids %s" (format-path path) (count to-delete) (str/join ", " (map id-col to-delete)))
      (delete-many! model id-col to-delete topics))
    (when (seq to-update)
      (log/tracef "%s Attempt updating %s rows of %s" (format-path path) (count to-update) model)
      (doseq [row to-update]
        (handle-rows-update! row existing-rows spec path topics)))
    ;; the row might not change, but the nested models might
    (when (and (seq to-skip) nested-specs)
      (log/tracef "%s nested models detected, updating unchanged nested models for %s %s"
                  (format-path path) model (id-col (first to-skip)))
      (doseq [row to-skip]
        (handle-rows-update! row existing-rows spec path topics :force-update? false)))))

(defn- handle-map-update!
  [existing-data new-data {:keys [model nested-specs id-col] :as spec} path topics]
  (let [sanitize-row            (sanitize-row-fn spec)
        compare-row             (compare-cols-fn spec)
        existing-id             (when existing-data (id-col existing-data))
        ;; Process any ref-in-parent models first
        parent-updates          (when (and nested-specs new-data)
                                  (handle-refs-in-parent! existing-data new-data nested-specs path topics))
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
                                         (conj path parent-id)
                                         topics)))))]
    (cond
      ;; delete
      (nil? new-data)
      (do
        (log/debugf "%s Deleting" (format-path (conj path existing-id)))
        (delete-one! model existing-id existing-data topics)
        (handle-nested! existing-data new-data existing-id)
        nil)

      ;; create
      (nil? existing-data)
      (let [parent-id (insert-one! model new-data-sanitized topics)
            path      (conj path parent-id)]
        (log/debugf "%s Created a new entity %s %s" (format-path path) model parent-id)
        (handle-nested! nil new-data parent-id)
        parent-id)

      ;; delete and create when id changes
      (and existing-id (not= (id-col new-data) existing-id))
      (do
        (log/debugf "%s ID changed from %s to %s - deleting and recreating"
                    (format-path path) existing-id (id-col new-data))
        (delete-one! model existing-id existing-data topics)
        (let [parent-id (insert-one! model new-data-sanitized topics)
              path      (conj path parent-id)]
          (log/debugf "%s Created a new entity %s %s" (format-path path) model parent-id)
          (handle-nested! nil new-data parent-id)
          parent-id))

      ;; update
      (not= (compare-row new-data-sanitized) (compare-row existing-data-sanitized))
      (do
        (log/debugf "%s Updating" (format-path (conj path existing-id)))
        (update! model existing-id existing-data new-data-sanitized topics)
        (handle-nested! existing-data new-data existing-id)
        existing-id)

      :else
      (do
        (log/debugf "%s no change detected for %s %s" (format-path path) model existing-id)
        (handle-nested! existing-data new-data existing-id)
        existing-id))))

(defn- do-update!*
  [existing-data new-data spec path topics]
  (if (:multi-row? spec)
    (do
      (log/tracef "%s multi-row spec found" (format-path path))
      (handle-sequential-updates! existing-data new-data spec path topics))
    (do
      (log/tracef "%s single row spec found" (format-path path))
      (handle-map-update! existing-data new-data spec path topics))))

(mu/defn do-update!
  "Update data in the database based on the diff between existing and new data, in a transaction.
  `spec` defines the structure of the data and how to compare it. The writes publish their lifecycle events under the
  `topics` of [[::topics]], when given."
  ([existing-data :- ::generic-row
    new-data      :- ::generic-row
    spec          :- ::Spec]
   (do-update! existing-data new-data spec nil))
  ([existing-data :- ::generic-row
    new-data      :- ::generic-row
    spec          :- ::Spec
    topics        :- ::topics]
   (t2/with-transaction []
     (do-update!* existing-data new-data spec ["root"] topics))))
