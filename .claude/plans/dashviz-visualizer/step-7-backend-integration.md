# Backend Integration for Visualizer Feature

## Component Index

```
src/metabase/
├── api/
│   └── dashboard.clj            # Dashboard API with visualizer support
├── channel/
│   ├── render/
│   │   ├── util.clj             # Core visualizer utilities including merge-visualizer-data
│   │   ├── card.clj             # Card rendering with visualizer support 
│   │   └── body.clj             # Rendering implementations including visualizer-specific types
│   └── impl/
│       └── email.clj            # Email implementation with visualizer dashcard handling
```

## Feature Summary

The backend component of the visualizer feature enables the storage, processing, and rendering of visualizer dashcards. Unlike traditional dashboard cards that display data from a single source, visualizer dashcards can combine data from multiple sources with complex column mappings and transformations. The backend implementation focuses on:

1. **Data Persistence**: Storing visualizer-specific settings in the existing dashboard card model
2. **Data Merging**: Combining data from multiple sources based on column mappings
3. **Rendering Support**: Extending the rendering system to handle visualizer-specific chart types
4. **API Enhancements**: Adding support for operations like dashboard duplication with visualizer cards
5. **Integration with Email/Subscriptions**: Ensuring visualizer dashcards render properly in emails

## Key Components

### 1. Visualizer Detection and Settings Structure

The system identifies visualizer dashcards using the `is-visualizer-dashcard?` function in `metabase/channel/render/util.clj`:

```clojure
(defn is-visualizer-dashcard?
  "true if dashcard has visualizer specific viz settings"
  [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))
```

Visualizer-specific settings have four distinct parts:
1. **Display Type**: The visualization type (e.g., funnel, pie, cartesian)
2. **Settings**: Visualization-specific settings for the display type
3. **Columns**: "Virtual" column definitions that are compositions of actual columns with remapped names
4. **Column Value Mappings**: References to the cards supplying the data, with metadata about relevant values

### 2. Data Merging and Transformation

A key component of the backend integration is the `merge-visualizer-data` function in `metabase/channel/render/util.clj`. This function:

1. Takes a dashcard series/column data and returns a row-major matrix of data based on visualizer column settings
2. Processes two types of data sources:
   - Value sources: References to specific columns in specific cards
   - Name references: References to card names (e.g., `$_card:191_name`)
3. Handles the complex column remapping required for visualizer dashcards

```clojure
(defn merge-visualizer-data
  "Takes visualizer dashcard series/column data and returns a row-major matrix of data
   with respect to the visualizer specific column settings."
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
```

### 3. Dashboard API Enhancements

The dashboard API has been enhanced in `metabase/api/dashboard.clj` to support visualizer dashcards, particularly for handling column value mapping during dashboard duplication:

```clojure
(defn- update-colvalmap-setting
  "Visualizer dashcards have unique visualization settings which embed column id remapping metadata
  This function iterates through the `:columnValueMapping` viz setting and updates referenced card ids"
  [col->val-source id->new-card]
  (let [update-cvm-item (fn [item]
                          (if-let [source-id (:sourceId item)]
                            (if-let [[_ card-id] (and (string? source-id)
                                                      (re-find #"^card:(\d+)$" source-id))]
                              (if-let [new-card (get id->new-card (Long/parseLong card-id))]
                                (assoc item :sourceId (str "card:" (:id new-card)))
                                item)
                              item)
                            item))
        update-cvm      (fn [cvm]
                          (when (map? cvm)
                            (update-vals cvm #(mapv update-cvm-item %))))]
    (update-cvm col->val-source)))
```

### 4. Rendering System Integration

The rendering system in `metabase/channel/render/body.clj` includes special handling for visualizer chart types, with particular attention to funnel charts:

```clojure
(mu/defmethod render :funnel :- ::RenderedPartCard
  "Fork the rendering implementation based on visualizer status and funnel type"
  [_chart-type render-type timezone-id card dashcard data]
  (let [visualizer?    (render.util/is-visualizer-dashcard? dashcard)
        viz-settings   (if visualizer?
                         (get-in dashcard [:visualization_settings :visualization])
                         (get card :visualization_settings))
        funnel-type    (if visualizer?
                         (get-in viz-settings [:settings :funnel.type] "funnel")
                         (get viz-settings :funnel.type))
        processed-data (if (and visualizer? (= "funnel" funnel-type))
                         (render.util/merge-visualizer-data (series-cards-with-data dashcard card data) viz-settings)
                         data)]
    (if (= "bar" funnel-type)
      (render :javascript_visualization render-type timezone-id card dashcard processed-data)
      (render :funnel_normal render-type timezone-id card dashcard processed-data))))
```

This shows how the rendering system needs to accommodate both traditional and visualizer dashcards with different data structures.

### 5. Email and Notification Integration

The email and notification system has been updated to support visualizer dashcards:

- The `visualizer-dashcard-href` function creates deep linking URLs for visualizer dashcards in emails
- The `assoc-attachment-booleans` function matches on both card ID and dashboard card ID to properly handle visualizer dashcards

```clojure
(defn- assoc-attachment-booleans [part-configs parts]
  (for [{{result-card-id :id} :card :as result} parts
        :let [result-dashboard-card-id (:id (:dashcard result))
              ;; We match on both the card id and the dashboard card id to support visualizer dashcards
              noti-dashcard (m/find-first (fn [config]
                                            (and (= (:card_id config) result-card-id)
                                                 (= (:dashboard_card_id config) result-dashboard-card-id)))
                                          part-configs)]]
    (if result-card-id
      (update result :card merge (select-keys noti-dashcard [:include_csv :include_xls :format_rows :pivot_results]))
      result)))
```

## Implementation Details

### Persistence and Data Model

The visualizer feature leverages the existing dashboard card model rather than creating new database tables. The visualizer-specific data is stored in the existing `visualization_settings` JSON column of the dashboard card table, nested under a new `:visualization` key. This approach allows for flexible storage of the complex visualizer configuration without requiring schema migrations.

Example visualizer settings structure:
```clojure
{:visualization
  {:display 'funnel',
   :columns
     [{:name 'COLUMN_2',
       :base_type 'type/BigInteger', ...}
      {:name 'DIMENSION',
       :base_type 'type/Text', ...}],
   :columnValuesMapping
     {:COLUMN_2
       [{:sourceId 'card:191', :originalName 'count', :name 'COLUMN_2'}
        {:sourceId 'card:192', :originalName 'count', :name 'COLUMN_3'}
        {:sourceId 'card:190', :originalName 'count', :name 'COLUMN_4'}],
      :DIMENSION
       ['$_card:191_name'
        '$_card:192_name'
        '$_card:190_name']},
   :settings
     {:funnel.metric 'COLUMN_2',
      :funnel.dimension 'DIMENSION',
      :funnel.order_dimension 'DIMENSION',
      ...}}}
```

### Security and Permissions

The visualizer dashcards follow the same permission model as regular dashboard cards. Since they are an extension of existing dashboard cards, they inherit the same security checks through the standard dashboard API endpoints:

- Users need appropriate permissions to view dashboards containing visualizer cards
- Editing visualizer dashcards requires dashboard write permissions
- API endpoints use existing permission checks such as `api/read-check` and `api/write-check`

### Frontend-Backend Communication Pattern

The backend implements a robust communication pattern with the frontend:

1. **Storage**: The frontend sends visualizer-specific settings which the backend stores in the dashboard card model
2. **Retrieval**: When loading a dashboard, the backend sends the complete visualization settings to the frontend
3. **Processing**: For rendering in emails or generating images, the backend processes the visualizer settings to merge data and create appropriate visualizations
4. **Duplication**: When duplicating dashboards, the backend updates card references in visualizer settings

### Integration Patterns

The backend implementation uses a combination of pattern recognition and type-based dispatch:

1. **Pattern Recognition**: Functions like `is-visualizer-dashcard?` identify visualizer elements
2. **Type-Based Dispatch**: Multimethod implementations in the rendering system handle visualizer dashcards differently
3. **Data Transformation**: Special functions transform the complex nested structure of visualizer dashcards into formats suitable for rendering

This approach maintains backward compatibility while enabling the new visualizer functionality.

## Summary

The backend integration for the visualizer feature demonstrates a thoughtful approach to extending Metabase's capabilities without disrupting the existing architecture. By leveraging the existing dashboard card model and enhancing the rendering system, the implementation enables powerful new visualization capabilities while maintaining security, performance, and backward compatibility.

Key strengths of the implementation include:
1. Minimal database schema changes
2. Reuse of existing permission models
3. Clear separation of visualizer-specific logic
4. Specialized data merging functionality
5. Comprehensive support across the system, including email subscriptions

The backend components work in concert with the frontend to deliver a seamless experience for users creating and viewing visualizer dashcards.