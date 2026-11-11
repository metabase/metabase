(ns metabase.lib.schema.visualization
  "Schemas for the visualization settings the frontend authors for cards, dashboard cards and the like, normalizing
  them to the shape their columns store: keyword keys all the way down, but for the JSON-encoded column keys of
  `:column_settings`, with the legacy MBQL references that older settings give in place of column names normalized.
  Every key the backend reads is typed, and normalization drops a value that doesn't match its type, so that one
  setting the frontend wrote wrong never makes the others unreadable."
  (:require
   #?(:clj [metabase.util.i18n :as i18n])
   #?@(:clj ([malli.core :as mc]
             [malli.transform :as mtx]
             [metabase.util.json :as json]
             [metabase.util.memoize :as u.memo]))
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

(defn- drop-invalid-settings
  "The settings `m` without the values of the keys of `schemas` that don't match their schemas."
  [schemas m]
  (if (map? m)
    (reduce-kv (fn [m k schema]
                 (cond-> m
                   (and (contains? m k) (not (mr/validate [:maybe schema] (get m k)))) (dissoc k)))
               m
               schemas)
    m))

(defn- settings-map
  "An open map schema with the optional, nullable `entries`, given as `[k schema]` pairs, whose normalization runs the
  `:decode/normalize` of `props` first and then drops the values that don't match their schemas."
  [props & entries]
  (let [schemas (into {} entries)
        enter   (:decode/normalize props)]
    (into [:map (-> (merge {:closed false, ::mr/deliberately-open true} props)
                    (assoc :decode/normalize (cond-> {:leave (partial drop-invalid-settings schemas)}
                                               enter (assoc :enter enter))))]
          (map (fn [[k schema]]
                 [k {:optional true} [:maybe schema]]))
          entries)))

(defn- keywordize-key
  "The map key `k` as a keyword when it's a string."
  [k]
  (cond-> k (string? k) keyword))

(defn- keywordize-keys
  "`x` with the string keys of every map in it turned into keywords, keeping the order of the entries, which the
  frontend reads some settings in, such as the columns of a visualizer card."
  [x]
  (perf/postwalk (fn [form]
                   (if (and (map? form) (perf/some string? (keys form)))
                     (into (empty form) (map (fn [[k v]] [(keywordize-key k) v])) form)
                     form))
                 x))

(mr/def ::legacy-reference
  "A legacy MBQL reference to a column, as older settings give it."
  [:ref :metabase.legacy-mbql.schema/Reference])

(mr/def ::column-name-or-ref
  "How a setting refers to a column: by name, as newer settings do, by legacy MBQL reference, as older ones do, or by
  something else the frontend wrote, which is kept as it is."
  [:or :string ::legacy-reference :any])

(mr/def ::click-behavior.dimension
  "The `:dimension` a click behavior parameter maps to, with the legacy MBQL reference of its column."
  [:or
   [:tuple [:= {:decode/normalize lib.schema.common/normalize-string-key} "dimension"] [:maybe ::legacy-reference]]
   [:tuple [:= {:decode/normalize lib.schema.common/normalize-string-key} "dimension"] [:maybe ::legacy-reference]
    ::lib.schema.parameter/dimension.options]
   :any])

(mr/def ::click-behavior.parameter-ref
  "The source or target of a click behavior parameter, with the dimension a target of type `dimension` maps to."
  (settings-map {:description "click behavior parameter reference"}
                [:dimension ::click-behavior.dimension]))

(mr/def ::click-behavior.parameter-mapping
  "The `:parameterMapping` of a click behavior: what each parameter of its destination gets, by the JSON-encoded id of
  that parameter or dimension."
  [:map-of {:decode/normalize #(cond-> % (map? %) (perf/update-keys lib.schema.common/normalize-string-key))}
   :string
   [:maybe (settings-map {:description "click behavior parameter mapping"}
                         [:source ::click-behavior.parameter-ref]
                         [:target ::click-behavior.parameter-ref])]])

(defn- normalize-link-type
  "The link type `x`, with the `page` that older settings give for a dashboard as `dashboard`."
  [x]
  (if (= x "page") "dashboard" x))

(mr/def ::click-behavior
  "The `:click_behavior` of a visualization or column: what clicking a value does, with the parameters of its
  destination and the dimensions they map to."
  (settings-map {:description "click behavior"}
                [:type                   [:enum "action" "actionMenu" "crossfilter" "link"]]
                [:linkType               [:enum {:decode/normalize normalize-link-type} "question" "dashboard" "url"]]
                [:targetId               [:or ::lib.schema.id/card ::lib.schema.id/dashboard]]
                [:tabId                  ::lib.schema.id/dashboard-tab]
                [:linkTemplate           :string]
                [:linkTextTemplate       :string]
                [:parameterMapping       ::click-behavior.parameter-mapping]
                [:actionType             [:enum "insert" "update" "delete"]]
                [:tableId                ::lib.schema.id/table]
                [:objectDetailDashCardId ::lib.schema.id/dashcard]))

(defn- normalize-time-style
  "The time style `x`, with the deprecated `k:mm` as the `HH:mm` it means (#18112)."
  [x]
  (if (= x "k:mm") "HH:mm" x))

(mr/def ::column-settings.entry
  "The settings of one column: its title, how its values are formatted and displayed, and what clicking one does."
  (settings-map {:description "column settings", :decode/normalize keywordize-keys}
                [:column_title                   :string]
                [:date_style                     :string]
                [:date_separator                 :string]
                [:date_abbreviate                :boolean]
                [:time_enabled                   [:enum "minutes" "seconds" "milliseconds"]]
                [:time_style                     [:string {:decode/normalize normalize-time-style}]]
                [:number_style                   [:enum "decimal" "percent" "scientific" "currency"]]
                [:currency                       :string]
                [:currency_style                 [:enum "symbol" "narrowSymbol" "code" "name"]]
                [:currency_position              [:enum "before" "after"]]
                [:currency_in_header             :boolean]
                [:number_separators              :string]
                [:decimals                       [:int {:min 0}]]
                [:scale                          number?]
                [:prefix                         :string]
                [:suffix                         :string]
                [:view_as                        :string]
                [:link_text                      :string]
                [:link_url                       :string]
                [:show_mini_bar                  :boolean]
                [:text_wrapping                  :boolean]
                [:text_align                     [:enum "left" "middle" "right"]]
                [:click_behavior                 ::click-behavior]
                [:pivot_table.column_sort_order  [:enum "ascending" "descending"]]
                [:pivot_table.column_show_totals :boolean]))

(mr/def ::column-settings.key.ref
  "A `:column_settings` key that wraps a legacy MBQL reference in `ref`."
  [:tuple {:decode/normalize vec}
   [:= {:decode/normalize keyword} :ref]
   ::legacy-reference])

(mr/def ::column-settings.key.name
  "A `:column_settings` key that wraps the name of a column in `name`."
  [:tuple {:decode/normalize vec}
   [:= {:decode/normalize keyword} :name]
   :string])

(mr/def ::column-settings.key
  "A `:column_settings` key, decoded from its JSON: a legacy MBQL reference wrapped in `ref`, a column name wrapped in
  `name`, or a bare legacy MBQL reference."
  [:or ::column-settings.key.ref ::column-settings.key.name ::legacy-reference])

#?(:clj
   (def ^:private normalize-column-key
     "The `:column_settings` key `k`, the JSON-encoded reference or name of a column, with its legacy MBQL reference
     normalized; nil for one that isn't valid."
     (u.memo/fast-bounded
      (fn [k]
        (let [decoded (json/decode k)]
          (some-> (if (sequential? decoded)
                    (let [decode     (mr/cached ::column-settings.key-decoder ::column-settings.key
                                                #(mc/decoder ::column-settings.key (mtx/transformer {:name :normalize})))
                          normalized (decode decoded)]
                      (when (mr/validate ::column-settings.key normalized)
                        normalized))
                    decoded)
                  json/encode)))
      :bounded/threshold 4096)))

(defn- normalize-column-settings
  "The `column-settings` with their keys normalized, without the settings whose key isn't valid or that aren't maps."
  [column-settings]
  (if (map? column-settings)
    (into {}
          (keep (fn [[k v]]
                  (when-let [k (and (or (nil? v) (map? v))
                                    #?(:clj  (some-> k lib.schema.common/normalize-string-key normalize-column-key)
                                       :cljs (lib.schema.common/normalize-string-key k)))]
                    [k v])))
          column-settings)
    column-settings))

(mr/def ::column-settings
  "The `:column_settings` of a visualization: the settings of each column, by its JSON-encoded reference or name."
  [:map-of {:decode/normalize normalize-column-settings}
   :string
   [:maybe ::column-settings.entry]])

(defn- normalize-table-column
  "The table `column` with the legacy MBQL reference older settings give it under `:fieldRef`, the key the other
  spellings mean, and without the unused `:key` they had."
  [column]
  (if (map? column)
    (let [field-ref (or (:fieldRef column) (:field_ref column) (:fieldref column))]
      (cond-> (dissoc column :key :field_ref :fieldref)
        (some? field-ref) (assoc :fieldRef field-ref)))
    column))

(mr/def ::table.column
  "A column of a table visualization: its name, whether it's shown, and the legacy MBQL reference older settings give
  it."
  (settings-map {:description "table column", :decode/normalize normalize-table-column}
                [:name     :string]
                [:enabled  :boolean]
                [:fieldRef ::column-name-or-ref]))

(mr/def ::table.columns
  "The `:table.columns` of a table visualization: its columns in display order."
  [:sequential [:maybe ::table.column]])

(mr/def ::table.column-formatting-rule
  "A conditional formatting rule of a table visualization: the columns it applies to, and either the color of the
  cells whose value matches its operator or the range of colors their values are spread over."
  (settings-map {:description "column formatting rule"}
                [:columns       [:sequential [:maybe ::column-name-or-ref]]]
                [:type          [:enum "single" "range"]]
                [:operator      :string]
                [:value         :any]
                [:color         :string]
                [:highlight_row :boolean]
                [:colors        [:sequential :string]]
                [:min_type      [:enum "custom" "all"]]
                [:max_type      [:enum "custom" "all"]]
                [:min_value     number?]
                [:max_value     number?]))

(mr/def ::table.column-formatting
  "The `:table.column_formatting` of a table visualization: its conditional formatting rules."
  [:sequential [:maybe ::table.column-formatting-rule]])

(mr/def ::column-names-or-refs
  "The columns a setting lists, by name or by the legacy MBQL reference older settings give."
  [:sequential [:maybe ::column-name-or-ref]])

(mr/def ::pivot-table.column-split
  "The `:pivot_table.column_split` of a pivot table: the columns it pivots into rows, columns and values."
  (settings-map {:description "pivot table column split"}
                [:rows    ::column-names-or-refs]
                [:columns ::column-names-or-refs]
                [:values  ::column-names-or-refs]))

(mr/def ::pivot-table.collapsed-rows
  "The `:pivot_table.collapsed_rows` of a pivot table: the row columns and the values whose rows are collapsed."
  (settings-map {:description "pivot table collapsed rows"}
                [:rows  ::column-names-or-refs]
                [:value [:sequential :any]]))

(mr/def ::scalar.segment
  "A segment of a scalar visualization: the color of the values from its minimum to its maximum."
  (settings-map {:description "scalar segment"}
                [:min   number?]
                [:max   number?]
                [:color :string]
                [:label :string]))

(mr/def ::series-order.entry
  "An entry of the order of the series or rows of a visualization: its key and name, color, and whether it's shown."
  (settings-map {:description "series order entry"}
                [:key     :string]
                [:name    :string]
                [:enabled :boolean]
                [:color   :string]))

(mr/def ::link-card.entity-id
  "The id of the entity a link card links to."
  [:or
   ::lib.schema.id/card
   ::lib.schema.id/collection
   ::lib.schema.id/dashboard
   ::lib.schema.id/database
   ::lib.schema.id/document
   ::lib.schema.id/table])

(mr/def ::link-card
  "The `:link` of a link card: the URL it links to, or the model and id of the entity it links to."
  (settings-map {:description "link card"}
                [:url    :string]
                [:entity (settings-map {:description "link card entity"}
                                       [:id    ::link-card.entity-id]
                                       [:model :string])]))

(mr/def ::global-column-settings
  "The column settings the formatting settings of the instance give every column of a type, by that type."
  [:map-of :keyword [:maybe ::column-settings.entry]])

(defn- normalize-pie-percent-visibility
  "The `settings` with the `:pie.percent_visibility` that the pie legend settings of older settings mean, when they
  have none."
  [{legend? :pie.show_legend, percent? :pie.show_legend_perecent, :as settings}]
  (let [visibility (cond
                     legend?  "inside"
                     percent? "legend")]
    (cond-> settings
      (and visibility (not (contains? settings :pie.percent_visibility))) (assoc :pie.percent_visibility visibility))))

(defn- normalize-visualization-settings
  "The `settings` with keyword keys all the way down, but for the keys of `:column_settings`, keeping the order of the
  entries, and with the settings that replaced the deprecated ones of older settings."
  [settings]
  (if (map? settings)
    (normalize-pie-percent-visibility
     (into (empty settings)
           (map (fn [[k v]]
                  (let [k (keywordize-key k)]
                    [k (cond-> v (not= k :column_settings) keywordize-keys)])))
           settings))
    settings))

(mr/def ::visualization-settings
  "Chart-rendering settings authored by the frontend, as their column stores them. Keys the backend doesn't read are
  kept as they are; the `:qp/` keys are the ones the query processor adds for exports, never stored or accepted from
  the REST API."
  (settings-map {:decode/normalize normalize-visualization-settings
                 :decode/api       lib.schema.common/remove-internal-keys
                 :encode/api       lib.schema.common/remove-internal-keys
                 :encode/serialize lib.schema.common/remove-internal-keys
                 :description      #?(:clj (i18n/deferred-tru "Value must be a map.") :cljs "visualization settings")
                 #?@(:clj [:error/fn (constantly (i18n/deferred-tru "Value must be a map."))])}
                [:column_settings                 ::column-settings]
                [:click_behavior                  ::click-behavior]
                [:table.columns                   ::table.columns]
                [:table.column_formatting         ::table.column-formatting]
                [:table.column_widths             [:sequential [:maybe number?]]]
                [:table.pivot                     :boolean]
                [:table.pivot_column              :string]
                [:table.cell_column               :string]
                [:pivot_table.column_split        ::pivot-table.column-split]
                [:pivot_table.collapsed_rows      ::pivot-table.collapsed-rows]
                [:pivot.show_row_totals           :boolean]
                [:pivot.show_column_totals        :boolean]
                [:pivot.condense_duplicate_totals :boolean]
                [:scalar.field                    :string]
                [:scalar.segments                 [:sequential [:maybe ::scalar.segment]]]
                [:funnel.dimension                :string]
                [:funnel.metric                   :string]
                [:funnel.rows                     [:sequential [:maybe ::series-order.entry]]]
                [:map.region                      :string]
                [:map.latitude_column             :string]
                [:map.longitude_column            :string]
                [:pie.percent_visibility          [:enum "off" "legend" "inside" "both"]]
                [:card.title                      :string]
                [:link                            ::link-card]
                [:qp/global-column-settings       ::global-column-settings]
                [:qp/display                      ::lib.schema.common/keyword]))
