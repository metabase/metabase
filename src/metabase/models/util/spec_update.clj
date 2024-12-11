(ns metabase.models.util.spec-update
  "Perform Creation/Update/Deletion with a spec."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- format-path
  [path]
  (str (str/join #" / " (map #(if (keyword? %) (name %) %) path)) ":"))

;; TODO: add :id-column, currently it assumes all models use :id
(def ^:private Spec
  [:schema {:registry {::spec [:map {:closed true}
                               [:model                         [:fn #(isa? % :metabase/model)]]
                               ;; whether this nested model is a sequentials with respect to the parent model
                               [:multi-row?   {:optional true} :boolean]
                               ;; the foreign key column in the nested model with respect to the parent model
                               [:fk-column    {:optional true} :keyword]
                               ;; A list of columns that should be compared to determine if the row has changed
                               [:compare-row  {:optional true} [:sequential :keyword]]
                               [:nested-specs {:optional true} [:map-of :keyword [:ref ::spec]]]]}}
   [:ref ::spec]])

(defn- compare-row-fn
  [spec]
  (if-let [compare-row (:compare-row spec)]
    (fn [row]
      (select-keys row compare-row))
    identity))

(declare do-map-update!)
(declare do-update!*)

(defn- handle-nested-updates!
  [existing-row new-row nested-specs path]
  (doseq [[k spec] nested-specs]
    (do-update!* (get existing-row k) (get new-row k) spec (conj path k))))

(defn- with-parent-id
  [row nested-specs parent-id]
  (merge row
         (into {}
               (for [[k {:keys [fk-column multi-row?]}] nested-specs]
                 [k (if fk-column
                      (if multi-row?
                        (map #(assoc % fk-column parent-id) (get row k))
                        (assoc (get row k) fk-column parent-id))
                      row)]))))

(defn- sanitize-row-fn
  [{:keys [nested-specs] :as spec}]
  (comp (compare-row-fn spec) #(apply dissoc % (keys nested-specs))))

(defn- do-sequential-updates!
  [existing-rows new-rows {:keys [model nested-specs] :as spec} path]
  (let [{:keys [to-update
                to-create
                to-delete
                to-skip]
         :as _updates}    (u/row-diff existing-rows new-rows :to-compare (compare-row-fn spec))
        sanitize-row      (sanitize-row-fn spec)]
    (when (seq to-create)
      (if nested-specs
        (do
          (log/debugf "%s nested spec found, creating rows one by one" (format-path path))
          (doseq [row to-create]
            (let [parent-id (t2/insert-returning-pk! model (sanitize-row row))]
              (log/debugf "%s Created a new entity %s %d" (format-path path) model parent-id)
              (handle-nested-updates! nil (with-parent-id row nested-specs parent-id) nested-specs (conj path parent-id)))))
        (do
          (log/debugf "%s no nested spec found, batch creating %d new rows of %s" (format-path path) (count to-create) model)
          (let [rows (map sanitize-row to-create)]
            (t2/insert! model rows)))))
    (when (seq to-delete)
      ;; TODO: cascade deletes?
      (log/debugf "%s Deleting %d rows with ids %s" (format-path path) (count to-delete) (str/join ", " (map :id to-delete)))
      (t2/delete! model :id [:in (map :id to-delete)]))

    (when (seq to-update)
      (log/debugf "%s Attempt updating %d rows of %s" (format-path path) (count to-update) model)
      (doseq [row to-update]
        (let [path (conj path (:id row))]
          (let [new-row (sanitize-row row)]
            (log/debugf "%s Updating" (format-path path))
            (t2/update! model (:id row) new-row))
          (when nested-specs
            (let [existing-row (first (filter #(= (:id row) (:id %)) existing-rows))]
              (log/debugf "%s nested models detected, updating" (format-path path))
              (handle-nested-updates! existing-row row nested-specs path))))))

    ;; the row might not change, but the nested models might
    (when (and (seq to-skip) nested-specs)
      (doseq [row to-skip]
        (handle-nested-updates! (first (filter #(= (:id row) (:id %)) existing-rows))
                                row
                                nested-specs
                                (conj path (:id row)))))))

(defn- do-map-update!
  [existing-data new-data {:keys [model nested-specs] :as spec} path]
  (let [sanitize-row        (sanitize-row-fn spec)
        new-data-clean      (sanitize-row new-data)
        existing-data-clean (sanitize-row existing-data)]
    (cond
      ;; delete
      (nil? new-data)
      (do
        (log/debugf "%s Deleting" (format-path (conj path (:id existing-data))))
        (t2/delete! model (:id existing-data)))

      ;; create
      (nil? existing-data)
      (let [parent-id (t2/insert! model new-data-clean)
            path      (conj path parent-id)]
        (log/debugf "%s Created a new entity %s %d" (format-path path) model parent-id)
        (when nested-specs
          (log/debugf "%s nested models detected, creating nested models" (format-path path))
          (handle-nested-updates! nil (with-parent-id new-data nested-specs parent-id) nested-specs path)))

      ;; update
      (not= new-data-clean existing-data-clean)
      (do
        (log/debugf "%s Updating" (format-path (conj path (:id existing-data))))
        (t2/update! model (:id existing-data) new-data-clean))

      :else
      (log/debugf "%s no change detected for %s %d" (format-path path) model (:id existing-data)))

    (when nested-specs
      (log/debugf "%s nested models detected, updating nested models %s %d" (format-path path) model (:id new-data))
      (handle-nested-updates! existing-data new-data nested-specs (conj path (:id new-data))))))

(defn- check-id-exists
  "if x is a map, check if it has :id key, if x is a seq, check if all elements have :id key."
  [x]
  (when x
    (assert (if (sequential? x)
              (every? :id x)
              (:id x))
            (format ":id is missing in %s" x))))

(defn- do-update!*
  [existing-data new-data spec path]
  (check-id-exists existing-data)
  (check-id-exists new-data)
  (if (:multi-row? spec)
    (do
      (log/debugf "%s multi-row spec found" (format-path path))
      (do-sequential-updates! existing-data new-data spec path))
    (do
      (log/debugf "%s single row spec found" (format-path path))
      (do-map-update! existing-data new-data spec path))))

(mu/defn do-update!
  "Update data in the database based on the diff between existing and new data.
  `spec` defines the structure of the data and how to compare it."
  [existing-data new-data spec :- Spec]
  (t2/with-transaction []
    (do-update!* existing-data new-data spec ["root"])))
