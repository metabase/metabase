(ns metabase.channel.render.util
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [html]]
   [metabase.channel.render.style :as style]
   [metabase.parameters.shared :as shared.params]
   [metabase.system.core :as system]
   [metabase.util :as u]))

;;; --------------------------------------------------- Helpers ---------------------------------------------------

(defn- extract-value-sources
  "Extracts column references from mappings that aren't strings"
  [mappings]
  (->> mappings
       vals
       (apply concat)
       (filter (complement string?))))

(defn- value-source->card-id
  "Extracts the card entity_id out of a visualizer value source map
   e.g. {:sourceId 'card:UfzksyybSdOZv1wM7jYnn', ...} -> 'UfzksyybSdOZv1wM7jYnn'"
  [{:keys [sourceId]}]
  (second (str/split sourceId #":")))

(defn- name-source->card-id
  "Extracts card entity_id from a name source string e.g. '$_card:UfzksyybSdOZv1wM7jYnn_name'"
  [value]
  (try
    (second (re-find #":([^_]+)_" value))
    (catch Exception _
      nil)))

;;; --------------------------------------------------- Utils ---------------------------------------------------

(defn is-visualizer-dashcard?
  "true if dashcard has visualizer specific viz settings"
  [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))

(defn is-scalar-funnel?
  "Check if the visualization is a scalar funnel.
   Matches the frontend implementation in frontend/src/metabase/visualizer/visualizations/funnel.ts"
  [{:keys [display settings]}]
  (and (= display "funnel")
       (= (get settings :funnel.metric) "METRIC")
       (= (get settings :funnel.dimension) "DIMENSION")))

(defn- process-column-mapping
  "Processes a single mapping entry to create a visualization column.
   Returns nil for string mappings (name references) or when required data is missing."
  [mapping series-data]
  (when-not (string? mapping) ;; Skip string values which are name references
    (let [card-entity-id (value-source->card-id mapping)
          card-with-data (u/find-first-map series-data [:card :entity_id] card-entity-id)
          original-column (u/find-first-map
                           (get-in card-with-data [:data :cols])
                           [:name]
                           (:originalName mapping))
          card-name (get-in card-with-data [:card :name])]
      (when (and original-column card-name)
        (assoc original-column
               :name (:name mapping)
               :display_name (str card-name ": " (:display_name original-column)))))))

(defn get-visualization-columns
  "Creates visualization columns for a visualizer entity.
   Similar to the frontend implementation in src/metabase/visualizer/utils/get-visualization-columns.ts"
  [visualizer-definition series-data]
  (let [{:keys [columnValuesMapping settings] :as viz-def} visualizer-definition]
    (cond
      ;; Scalar funnel uses pre-defined metric and dimension columns
      (is-scalar-funnel? viz-def)
      (let [metric-column-name (get settings :funnel.metric)
            dimension-column-name (get settings :funnel.dimension)
            main-card-with-data (first series-data)
            base-type (get-in main-card-with-data [:data :cols 0 :base_type])]
        [{:name metric-column-name
          :display_name metric-column-name
          :base_type (or base-type :type/Number)
          :semantic_type :type/Quantity}
         {:name dimension-column-name
          :display_name dimension-column-name
          :base_type :type/Text
          :semantic_type :type/Category}])

      ;; For all other chart types, create visualization columns from column mappings
      ;; TODO: Non scalar visualizer funnels are currently not officially supported
      :else
      (reduce
       (fn [columns [_ column-mappings]]
         (concat
          columns
          (filter some?
                  (map
                   #(process-column-mapping % series-data)
                   column-mappings))))
       []
       columnValuesMapping))))

(defn merge-visualizer-data
  "Takes visualizer dashcard series/column data and returns a row-major matrix of data
   with respect to the visualizer specific column settings. The point of this function is to support visualizer display
   types in static viz that still hit the `LegacyRenderChart` entry point, though currently this has only been tested
   for funnel charts. ECharts display types use the shared version of this function thru the static viz bundle.
   See frontend/src/metabase/visualizer/utils/merge-data.ts or SHA 18259ef

   Visualizer specific settings have four distinct parts:
     1. [:display]  - The display type of the visualization
     2. [:settings] - The visualizer dashcard's actual viz settings
     3. [:columns]  - The 'virtual' column definitions of a visualizer dashcard. These are
                      compositions of actual columns, and have 'remapped' :name's e.g. 'COLUMN_1'
     4. [:columnValuesMapping]
                    - One entry per virtual column, keyed by the remapped names e.g. 'COLUMN_1', which
                      point to a vector of 'data sources' which are references to the cards actually supplying
                      the data. These come in two types, value sources and name references. Value sources are maps
                      containing metadata to identify the relevant values used from a particular card's column.
                      Name references are strings which are used to resolve a particular card's name.

   Example visualizer settings (trimmed):

   {:visualization
     {:display 'funnel',
      :columns
        [{:name 'COLUMN_2',
          :base_type 'type/BigInteger', ...}
         {:name 'DIMENSION',
          :base_type 'type/Text', ...}],
      :columnValuesMapping
        {:COLUMN_2
          [{:sourceId 'card:191', :originalName 'count', :name 'COLUMN_2'}  ;; Value comes from column 'count' on card with :id 191
           {:sourceId 'card:192', :originalName 'count', :name 'COLUMN_3'}
           {:sourceId 'card:190', :originalName 'count', :name 'COLUMN_4'}],
         :DIMENSION
          ['$_card:191_name'  ;; Value is the :name of the card with :id 191
           '$_card:192_name'
           '$_card:190_name']},
      :settings
        {:funnel.metric 'COLUMN_2',
         :funnel.dimension 'DIMENSION',
         :funnel.order_dimension 'DIMENSION',
         ...}}}

   The input `series-data` is the dashcard data series results from QP as a vector of maps, [{:card {...} :data {...}, ...]"
  [series-data {:keys [columns columnValuesMapping] :as visualizer-settings}]
  (let [viz-columns (if (seq columns)
                      columns
                      (get-visualization-columns visualizer-settings series-data))
        source-mappings-with-vals   (extract-value-sources columnValuesMapping)
        ;; Create map from virtual column name e.g. 'COLUMN_1' to a vector of values only for value sources
        remapped-col-name->vals     (reduce
                                     (fn [acc {:keys [name originalName] :as source-mapping}]
                                       (let [ref-card-entity-id (value-source->card-id source-mapping)
                                             card-with-data   (u/find-first-map series-data [:card :entity_id] ref-card-entity-id)
                                             card-cols        (get-in card-with-data [:data :cols])
                                             card-rows        (get-in card-with-data [:data :rows])
                                             col-idx-in-card  (first (u/find-first-map-indexed card-cols [:name] originalName))]
                                         (if col-idx-in-card
                                           (let [values (mapv #(nth % col-idx-in-card) card-rows)]
                                             (assoc acc name values))
                                           acc)))
                                     {}
                                     source-mappings-with-vals)
        ;; Create column-major matrix for all virtual columns, value and name ref sources
        unzipped-rows               (mapv
                                     (fn [column]
                                       (let [source-mappings (get columnValuesMapping (keyword (:name column)))]
                                         (->> source-mappings
                                              (mapcat
                                               (fn [source-mapping]
                                                 ;; Source is a name reference string, lookup card by entity_id to get its name
                                                 (if-let [card-entity-id (name-source->card-id source-mapping)]
                                                   (let [card (:card (u/find-first-map series-data [:card :entity_id] card-entity-id))]
                                                     (some-> (:name card) vector))
                                                   ;; Source is actual column data
                                                   (get remapped-col-name->vals (:name source-mapping)))))
                                              vec)))
                                     viz-columns)]
    {:viz-settings (:settings visualizer-settings)
     :cols viz-columns
     ;; Return in row-major format
     :rows (apply mapv vector unzipped-rows)}))

(defn render-parameters
  "Renders parameters as inline left-aligned spans for use inside a dashcard."
  [parameters]
  (html
   (let [locale (system/site-locale)]
     [:div {:style (style/style {:font-size "14px"
                                 :font-weight 700
                                 :padding-bottom "8px"})}
      (for [{:keys [name] :as param} parameters]
        [:div
         {:style (style/style {:margin-bottom "4px"})}
         [:span {:style (style/style {:color style/color-text-dark
                                      :padding-right "8px"})}
          name]
         [:span {:style (style/style {:color style/color-text-medium})}
          (shared.params/value-string param locale)]])])))
