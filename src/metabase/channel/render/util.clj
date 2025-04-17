(ns metabase.channel.render.util
  (:require
   [clojure.string :as str]
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
  "Parses the card id as an int out of a visualizer value source map
   e.g. {:sourceId 'card:191', ...} -> 191"
  [{:keys [sourceId]}]
  (parse-long (second (str/split sourceId #":"))))

(defn- name-source->card-id
  "Extracts card id from a name source string e.g. '$_card:191_name'"
  [value]
  (try
    (when-let [id-str (second (re-find #":(\d+)_" value))]
      (parse-long id-str))
    (catch Exception _
      nil)))

;;; --------------------------------------------------- Utils ---------------------------------------------------

(defn is-visualizer-dashcard?
  "true if dashcard has visualizer specific viz settings"
  [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))

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
  (let [source-mappings-with-vals   (extract-value-sources columnValuesMapping)
        ;; Create map from virtual column name e.g. 'COLUMN_1' to a vector of values only for value sources
        remapped-col-name->vals     (reduce
                                     (fn [acc {:keys [name originalName] :as source-mapping}]
                                       (let [ref-card-id      (value-source->card-id source-mapping)
                                             card-with-data   (u/find-first-map series-data [:card :id] ref-card-id)
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
                                                 ;; Source is a name ref so just return the name of the card with matching :id
                                                 (if-let [card-id (name-source->card-id source-mapping)]
                                                   (let [card (:card (u/find-first-map series-data [:card :id] card-id))]
                                                     (some-> (:name card) vector))
                                                   ;; Source is actual column data
                                                   (get remapped-col-name->vals (:name source-mapping)))))
                                              vec)))
                                     columns)]
    {:viz-settings (:settings visualizer-settings)
     :cols columns
     ;; Return in row-major format
     :rows (apply mapv vector unzipped-rows)}))
