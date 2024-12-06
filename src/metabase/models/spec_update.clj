(ns metabase.models.spec-update
  "Perform Creation/Update/Deletion with a spec."
  (:require
   [clojure.data :refer [diff]]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^{:dynamic true
       :private true} *current-path* [])

(defn- current-path
  []
  (str (str/join #" / " (map #(if (keyword? %) (name %) %) *current-path*)) ":"))

;; TODO: add :id-column, and also assert that all rows has an id
(def ^:private Spec
  [:schema {:registry {::spec [:map {:closed true}
                               [:model                         [:fn #(isa? % :metabase/model)]]
                               ;; whether this nested model is a sequentials with respect to the parent model
                               [:multi-row?   {:optional true} :boolean]
                               ;; the foreign key column in the nested model with respect to the parent model
                               [:fk-column    {:optional true} :keyword]
                               ;; a function to get row into a comparable state
                               [:compare-row  {:optional true} :any #_[:=> [:cat :map] :map]]
                               [:nested-specs {:optional true} [:map-of :keyword [:ref ::spec]]]]}}
   [:ref ::spec]])

(defmacro ^:private with-enter-path
  [path & body]
  `(binding [*current-path* (conj *current-path* ~path)]
     (log/debugf "%s enter" (current-path))
     (u/prog1 ~@body
       (log/debugf "%s exit" (current-path)))))

(declare do-map-update!)
(declare do-update!*)

(defn- handle-nested-updates!
  [existing-row new-row nested-specs]
  (doseq [[k spec] nested-specs]
    (with-enter-path k
      (do-update!* (get existing-row k) (get new-row k) spec))))

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
  [{:keys [compare-row nested-specs]}]
  (comp (or compare-row identity) #(apply dissoc % (keys nested-specs))))

(defn- do-sequential-updates!
  [existing-rows new-rows {:keys [compare-row model nested-specs] :as spec}]
  (let [{:keys [to-update
                to-create
                to-delete
                to-skip]
         :as _updates}    (u/row-diff existing-rows new-rows :to-compare (or compare-row identity))
        sanitize-row      (sanitize-row-fn spec)]
    (log/trace (current-path) _updates)
    (when (seq to-create)
      (if nested-specs
        (do
          (log/debugf "%s nested spec found, creating rows one by one" (current-path))
          (doseq [row to-create]
            (log/trace (current-path) row)
            (let [parent-id (t2/insert-returning-pk! model (sanitize-row row))]
              (log/debugf "%s Created a new entity %s %d" (current-path) model parent-id)
              (with-enter-path parent-id
                (handle-nested-updates! nil (with-parent-id row nested-specs parent-id) nested-specs)))))
        (do
          (log/debugf "%s no nested spec found, batch creating %d new rows of %s" (current-path) (count to-create) model)
          (let [rows (map sanitize-row to-create)]
            (log/trace (current-path) rows)
            (t2/insert! model rows)))))
    (when (seq to-delete)
      ;; TODO: cascade deletes?
      (log/debugf "%s Deleting %d rows with ids %s" (current-path) (count to-delete) (str/join ", " (map :id to-delete)))
      (t2/delete! model :id [:in (map :id to-delete)]))

    (when (seq to-update)
      (log/debugf "%s Attempt updating %d rows of %s" (current-path) (count to-update) model)
      (doseq [row to-update]
        (with-enter-path (:id row)
          (let [new-row (sanitize-row row)]
            (log/debugf "%s Updating %s" (current-path) new-row)
            (log/tracef "%s %s" (current-path) new-row)
            (t2/update! model (:id row) new-row))
          (when nested-specs
            (let [existing-row (first (filter #(= (:id row) (:id %)) existing-rows))]
              (log/debugf "%s nested models detected, updating" (current-path))
              (handle-nested-updates! existing-row row nested-specs))))))

    ;; the row might not change, but the nested models might
    (when (and (seq to-skip) nested-specs)
      (doseq [row to-skip]
        (with-enter-path (:id row)
          (handle-nested-updates! (first (filter #(= (:id row) (:id %)) existing-rows))
                                  row
                                  nested-specs))))))

(defn- do-map-update!
  [existing-data new-data {:keys [model nested-specs] :as spec}]
  (let [sanitize-row        (sanitize-row-fn spec)
        new-data-clean      (sanitize-row new-data)
        existing-data-clean (sanitize-row existing-data)]
    (cond
      ;; delete
      (nil? new-data)
      (with-enter-path (:id existing-data)
        (log/debugf "%s Deleting" (current-path))
        (t2/delete! model (:id existing-data)))

      ;; create
      (nil? existing-data)
      (let [parent-id (t2/insert! model new-data-clean)]
        (log/debugf "%s Created a new entity %s %d" (current-path) model parent-id)
        (when nested-specs
          (log/debugf "%s nested models detected, creating nested models" (current-path))
          (with-enter-path parent-id
            (handle-nested-updates! nil (with-parent-id new-data nested-specs parent-id) nested-specs))))

      ;; update
      (not= new-data-clean existing-data-clean)
      (with-enter-path (:id existing-data)
        (log/debugf "%s Updating %s" (current-path) (second (diff existing-data-clean new-data-clean)))
        #_(log/tracef "%s %s" (current-path) new-data-clean)
        (t2/update! model (:id existing-data) new-data-clean))

      :else
      (log/debugf "%s no change detected for %s %d" (current-path) model (:id existing-data)))

    (when nested-specs
      (log/debugf "%s nested models detected, updating nested models %s %d" (current-path) model (:id new-data))
      (with-enter-path (:id new-data)
        (handle-nested-updates! existing-data new-data nested-specs)))))

(defn- do-update!*
  [existing-data new-data spec]
  (with-enter-path "root"
    (if (:multi-row? spec)
      (do
        (log/debugf "%s multi-row spec found" (current-path))
        (do-sequential-updates! existing-data new-data spec))
      (do
        (log/debugf "%s single row spec found" (current-path))
        (do-map-update! existing-data new-data spec)))))

(mu/defn do-update!
  "Update data in the database based on the diff between existing and new data.
  `spec` defines the structure of the data and how to compare it."
  [existing-data new-data spec :- Spec]
  (t2/with-transaction []
    (do-update!* existing-data new-data spec)))
