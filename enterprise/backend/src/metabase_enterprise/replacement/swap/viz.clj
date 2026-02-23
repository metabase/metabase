(ns metabase-enterprise.replacement.swap.viz
  (:require
   [clojure.walk]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- ultimate-table-id
  [mp [source-type source-id]]
  (case source-type
    :table
    source-id

    :card
    (or (:table-id (lib.metadata/card mp source-id))
        (throw (ex-info "Cannot find ulimate card for source"
                        {:source-type source-type
                         :source-id   source-id})))))

(defn- query-source
  [mp [source-type source-id]]
  (case source-type
    :card
    (lib/query mp (lib.metadata/card mp source-id))

    :table
    (lib/query mp (lib.metadata/table mp source-id))))

(defn- swap-field-ref
  [field-ref mp old-source new-source]
  (if (lib/field-ref-name field-ref)
    field-ref ;; don't need to update if it's a name
    (let [source-table-id (ultimate-table-id mp old-source)
          field (lib.metadata/field mp (lib/field-ref-id field-ref))
          field-table-id (:table-id field)]
      (cond
        (not= source-table-id field-table-id)
        field-ref ;; not related to old-source

        (:source-field (lib/options field-ref))
        (throw (ex-info "Can't handle field-refs with joins"
                        {:field-ref field-ref
                         :old-source old-source
                         :new-source new-source}))

        :else ;; okay, we just have to switch it now
        (let [query   (query-source mp new-source)
              columns (lib/fieldable-columns query)
              column-matches (filter #(= (:name field) (:name %)) columns)]
          (if (= 1 (count column-matches))
            (lib/ref (first column-matches))
            (do (log/warnf "Expected 1 match for field %s, got %d; keeping original ref"
                           (:name field) (count column-matches))
                field-ref)))))))

(defn- swap-legacy-target
  [target mp old-source new-source]
  (let [field-ref (lib/parameter-target-field-ref         target)
        options   (lib/parameter-target-dimension-options target)]
    [:dimension (lib/->legacy-MBQL (swap-field-ref field-ref mp old-source new-source)) options]))

(defn- swap-target
  [target mp old-source new-source]
  (let [field-ref (lib/parameter-target-field-ref         target)
        options   (lib/parameter-target-dimension-options target)]
    [:dimension (swap-field-ref field-ref mp old-source new-source) options]))

(defn- swap-parameter-mappings
  [parameter-mapping mp old-source new-source]
  (update parameter-mapping :target swap-legacy-target mp old-source new-source))

(defn- swap-column-settings-field-refs
  [column-settings mp old-source new-source]
  (clojure.walk/postwalk
   (fn [form]
     ;; some forms don't get converted to keywords, so hack it
     (if (and (vector? form)
              (= "dimension" (first form)))
       (try
         (let [dim (-> form
                       (update 0 keyword)
                       (update-in [1 0] keyword)
                       (update-in [1 2 :base-type] keyword))]
           (swap-target dim mp old-source new-source))
         (catch Exception _
           form))
       form))
   column-settings))

(defn dashboard-card-update-field-refs!
  "After a card's query has been updated, swap the column_settings keys on all
  DashboardCards that display this card."
  [card-id query old-source new-source]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (let [viz      (vs/db->norm (:visualization_settings dashcard))
          viz'     (update viz ::vs/column-settings swap-column-settings-field-refs query old-source new-source)
          parameter-mappings (:parameter_mappings dashcard)
          parameter-mappings' (mapv #(swap-parameter-mappings % query old-source new-source) parameter-mappings)
          changes (cond-> {}
                    (not= viz viz')
                    (assoc :visualization_settings (vs/norm->db viz'))

                    (not= parameter-mappings parameter-mappings')
                    (assoc :parameter_mappings parameter-mappings'))]
      (when (seq changes)
        (t2/update! :model/DashboardCard (:id dashcard) changes)))))
