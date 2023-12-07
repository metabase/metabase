(ns metabase.pulse.render.test-util
  "The goal of this namespace is to provide some utility functions that let us write static-viz tests
  without needing to make a card or run the query processor. It also allows us to write tests that check
  for actual visual changes in the render by providing a hiccup tree instead of a png metabase.pulse.render.test-util
  This way, we can write tests that only take data in, run that data through the real static-viz render pipeline, and confirm that the render behaves according to the given visual settings.

  To summarize, this namespace contains functions that:

  1. build a minimal card and query result dataset for different visualization types and settings (scenarios)
  2. run the real rendering pipeline, but, return a hiccup tree instead of png bytes
  3. provide quick ways to 'query' the tree for different content, to confirm that elements are properly rendered."
  (:require
   [clojure.string :as str]
   [clojure.zip :as zip]
   [metabase.formatter.datetime :as datetime]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.body :as body]
   [metabase.pulse.render.image-bundle :as image-bundle]
   [metabase.pulse.render.js-svg :as js-svg]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util :as u])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument AbstractElement$ExtendedNamedNodeHashMap)
   (org.apache.batik.dom GenericText)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

(def test-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased"]
    :graph.dimensions ["Price"]
    :table.column_formatting [{:columns       ["a"]
                               :type          :single
                               :operator      ">"
                               :value         5
                               :color         "#ff0000"
                               :highlight_row true}
                              {:columns       ["c"]
                               :type          "range"
                               :operator      "="
                               :min_type      "custom"
                               :min_value     3
                               :max_type      "custom"
                               :max_value     9
                               :colors        ["#00ff00" "#0000ff"]}]}})

(def test-combo-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased" "NumKazoos" "ExtraneousColumn"]
    :graph.dimensions ["Price"]}})

(def test-stack-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased" "NumKazoos"]
    :graph.dimensions ["Price"]
    :stackable.stack_type "stack"}})

(def test-combo-card-multi-x
  {:visualization_settings
   {:graph.metrics ["NumKazoos"]
    :graph.dimensions ["Price" "NumPurchased"]}})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    make-card-and-data
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; TOOD: find existing fns for this?
(defn- guess-type
  [sample]
  (cond
    (datetime/temporal-string? sample) :type/Temporal
    (string? sample) :type/Text
    :else :type/Number))

(defn- base-cols-settings
  "Create a basic settings map for a column, which ends up in the vector at [:data :cols].
  This mimics the shape of column-settings data returned from the query processor."
  [idx col-name col-sample]
  (let [ttype (guess-type col-sample)]
    {:name         col-name
     :display_name col-name
     :settings     nil
     :field_ref    [:field idx (when (= :type/Temporal ttype) {:temporal-unit :default})]
     :unit         :default
     :base_type    (guess-type col-sample)}))

(defn- fingerprint
  [vals]
  {:global {:distinct-count (-> vals distinct count) :nil% 0.0}
   :type   {:type/Number {:min (apply min vals)
                          :max (apply max vals)
                          :avg (double (/ (reduce + vals) (count vals)))}}})

(defn- base-results-metadata
  "Create a basic metadata map for a column, which ends up in a vector at [:data :results_metadata :columns].
  This mimics the shape of column-settings data returned from the query processor."
  [idx col-name col-vals]
  (let [ttype (guess-type (first col-vals))]
    {:name           col-name
     :display_name   col-name
     :field_ref      [:field idx {:base-type ttype}]
     :base_type      ttype
     :effective_type ttype
     :fingerprint (when (= :type/Number ttype) (fingerprint col-vals))}))

(defn base-viz-settings
  "Build the basic viz-settings map for a given `display-type` and x-axis configuration, `x-config`."
  ([display-type rows] (base-viz-settings display-type :single rows))
  ([display-type x-config rows]
   (let [header-row  (first rows)
         _sample-row (second rows)
         lab-viz     (if (= x-config :single)
                       {:graph.dimensions [(first header-row)]
                        :graph.metrics    (vec (rest header-row))}
                       {:graph.dimensions [(first header-row) "Grouping"]
                        :graph.metrics    ["Values"]})]
     (case display-type
       :line        lab-viz
       :area        lab-viz
       :bar         lab-viz
       :combo       lab-viz
       :pin_map     {}
       :state       {}
       :country     {}
       :pie         {}
       :funnel      {}
       :progress    {}
       :scalar      {}
       :smartscalar {}
       :gauge       {}
       :table       {}
       :scatter     {}
       :row         {}
       :list        {}
       :pivot       {}
       {}))))

(defn rows->multi-x-rows
  [header-and-rows]
  (let [[header & rows] header-and-rows
        rows (vec rows)
        x2s (vec (rest header))]
    (for [idx1 (range (count rows))
          idx2 (range (count x2s))]
      (let [[x1 & vs] (get rows idx1)
            vs (vec vs)]
        (conj [x1 (get x2s idx2)] (get vs idx2))))))

(defn make-card-and-data
  "Make a basic `card-and-data` map for a given `display-type` key. Useful for buildng up test viz data without the need for `viz-scenarios`.
  The `rows` should be a vector of vectors, where the first row is the header row.

  X-axis configuration, `x-config`, is either `:single` or `:multi`.
  The `x-config` is relevant for Line, Area, Bar, and Combo charts only, and alters how dimensions/metrics are split up.

  The Default :single corresponds to the UI having only 1 series in the X-AXIS group, and any number of series in the Y-AXIS.
  The :multi corresponds to the UI having 2 series in the X-AXIS and 1 in Y-AXIS.
  This situation comes up if you do something like summarize with a 'Sum of Total' BY 2 categories (eg. Created at and Product->Category).

  The thing is that this second :multi situation will be visually similar to a single-x-axis chart with several series, but the flow through render/body is somewhat different, so its important to provide ways to build test data for each situation."
  ([header-and-rows display-type] (make-card-and-data header-and-rows display-type :single))
  ([header-and-rows display-type x-config]
   (let [[header & rows] header-and-rows
         rows            (vec (case x-config
                                :single rows
                                :multi  (rows->multi-x-rows header-and-rows)
                                rows))
         header (vec (case x-config
                       :single header
                       :multi [(first header) "Grouping" "Values"]))
         indices         (range (count (first header-and-rows)))
         cols            (mapv (fn [idx] (mapv #(nth % idx) (vec rows))) indices)]
     {:card {:display                display-type
             :visualization_settings (base-viz-settings display-type x-config header-and-rows)}
      :data {:viz-settings     (base-viz-settings display-type x-config header-and-rows)
             :cols             (mapv base-cols-settings indices header (first rows))
             :rows             rows
             :results_metadata {:columns (mapv base-results-metadata indices header cols)}}})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    validate-viz-scenarios
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def valid-viz-scenarios
  {:pin_map     #{}
   :state       #{}
   :country     #{}
   :line        #{:goal-line :multi-series :stack}
   :area        #{:goal-line :multi-series :stack}
   :bar         #{:goal-line :multi-series :stack}
   :combo       #{:goal-line :multi-series :stack}
   :pie         #{:custom-column-formatting}
   :funnel      #{}
   :progress    #{:custom-column-formatting}
   :scalar      #{:custom-column-formatting}
   :smartscalar #{:custom-column-formatting}
   :gauge       #{}
   :table       #{:custom-column-names :reordered-columns :hidden-columns :custom-column-formatting}
   :scatter     #{}
   :row         #{}
   :list        #{}
   :pivot       #{}})

(defn- validate-viz-scenario
  [display-type viz-scenario]
  (select-keys viz-scenario (valid-viz-scenarios display-type)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    apply viz-scenarios
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn merge-viz-settings
  "Merges the provided viz-settings into the `[:data :viz-settings]` path of the `card-and-data` map.
  Notice that this does *not* merge settings into :visualization_settings of the card.

  What is the difference between :visualization_settings in a card's data and [:data :viz-settings]?
  The first is a key saved to the Card in the app-db, and does nothing until it is later used by the query processor's process-viz-settings middleware.
  The latter is returned by the query processor under :data :viz-settings, if the process-viz-settinsg middleware
  is run on the card's query. Since these util functions are mimicing a query result without running the processor,
  we have to add the appropriate viz-settings in this location, as if the card's query was actually processed."
  [card-and-data viz-settings]
  (update-in card-and-data [:data :viz-settings] merge viz-settings))

(defn- lisp-key
  "Convert a keyword or string `k` from `snake_case` to `lisp-case`."
  [k]
  (if (keyword? k)
    (keyword (lisp-key (name k)))
    (str/replace k #"_" "-")))

(defn- lisp-keys
  "Convert the keys in a map from `snake_case` to `lisp-case`."
  [m]
  (u/recursive-map-keys lisp-key m))

(defn- viz-namespaced-keys
  [m]
  (let [ns-key (fn [k]
                 (keyword (str "metabase.shared.models.visualization-settings/" (name k))))]
    (u/recursive-map-keys ns-key m)))

(defn- merge-column-settings-for-data
  "Merges the provided column-settings into the `[:data :column-settings]` path of the `card-and-data` map."
  [card-and-data column-settings]
  (update-in card-and-data [:data :viz-settings
                            ::mb.viz/column-settings]
             (fn [a b] (merge-with merge a b)) (-> column-settings
                                                   (update-vals lisp-keys)
                                                   (update-vals viz-namespaced-keys))))

(defn- merge-column-settings-for-card
  "Merges the provided column-settings into the `[:card :visualization_settings :column_settings]` path of the `card-and-data` map."
  [card-and-data column-settings]
  (update-in card-and-data [:card :visualization_settings
                            :column_settings]
             (fn [a b] (merge-with merge a b)) (update-vals column-settings u/snake-keys)))

(defn- make-settings-for-col
  "Make the column-settings map for the given `col` the :card or :data `destination`.
  This returns a map with one key and the settings.

  The key will look like {:field-id 0} for :data
  The key will be a json-stringified version of [\"ref\" [\"field\" 0 nil]] for :card."
  [{field-ref :field_ref} settings destination]
  (let [[_ id] field-ref
        norm-ref {::mb.viz/field-id id}]
    (case destination
      :data ;; goes in  [:data :viz-settings :column-settings]
      {norm-ref settings}

      :card ;; this goes in [:card :visualization_settings :column_settings]
      {(mb.viz/norm->db-column-ref norm-ref) settings})))

(defn make-column-settings
  "Makes and adds each map in the `column-settings` vector to the appropriate columns in `card-and-data`."
  [card-and-data column-settings]
  (let [cols (get-in card-and-data [:data :cols])
        cols-idx-map (update-vals (group-by #(second (:field_ref %)) cols) first)
        data-col-settings (into {} (map-indexed
                                    #(make-settings-for-col (get cols-idx-map %1) %2 :data) column-settings))
        card-col-settings (into {} (map-indexed
                                    #(make-settings-for-col (get cols-idx-map %1) %2 :card) column-settings))]
    (-> card-and-data
        (merge-column-settings-for-data data-col-settings)
        (merge-column-settings-for-card card-col-settings))))

(defmulti ^:private apply-viz-scenario-key
  (fn [scenario-key _ _] scenario-key))

(defmethod apply-viz-scenario-key :default
  [_ _scenario-settings card-and-data]
  card-and-data)

;; example scenario-settings for goal-line
#_{:goal-line {:graph.show_goal true
               :graph.goal_label "target"
               :graph.goal_value 10}}
(defmethod apply-viz-scenario-key :goal-line
  [_ scenario-settings card-and-data]
  (merge-viz-settings card-and-data
                      (merge {:graph.show_goal  true
                              :graph.goal_label "Goal"
                              :graph.goal_value 0}
                             scenario-settings)))

(defn- next-char-string [s]
  (apply str (map (comp char inc int) s)))

;; example scenario-settings for multi-series
#_{:multi-series {:rows ["C" 10 9 8]}}
(defmethod apply-viz-scenario-key :multi-series
  [_ scenario-settings card-and-data]
  (let [rows (get-in card-and-data [:data :rows])]
    (if (> (count (first rows)) 2)
      card-and-data
      (let [existing-cols (get-in card-and-data [:data :cols])
            provided-new-rows (:rows scenario-settings)
            new-col-name (or (first provided-new-rows)
                             (next-char-string (last (get-in card-and-data [:card :visualization_settings :graph.metrics]))))
            new-col-data (if provided-new-rows
                           (rest provided-new-rows)
                           (map inc (range (count rows))))
            new-rows (mapv conj rows new-col-data)]
        (-> card-and-data
            (update-in [:card :visualization_settings :graph.metrics] conj new-col-name)
            (update-in [:data :cols] conj (base-cols-settings (inc (count existing-cols)) new-col-name (first new-col-data)))
            (assoc-in [:data :rows] new-rows))))))

(defn- table-col
  "Make a table column map for `destination`, which is either :card or :data."
  [{col-name :name field-ref :field_ref} destination]
  (case destination
    :data ;; this goes in [:data :viz-settings :table-columns]
    {:table-column-name col-name
     :table-column-field-ref field-ref
     :table-column-enabled true}

    :card ;; this goes in [:card :visualization_settings :table.columns]
    {:name col-name
     :fieldRef field-ref
     :enabled true}))

(defn- make-table-cols-viz
  [cols destination]
  (mapv #(table-col % destination) cols))

(defmethod apply-viz-scenario-key :hidden-columns
  [_ scenario-settings card-and-data]
  (let [cols (get-in card-and-data [:data :cols])
        keep (if (:hide scenario-settings)
               (remove (set (:hide scenario-settings)) (range (count cols)))
               (range (dec (count cols))))
        cols-to-keep (->> cols
                         (filter #((set keep) (second (:field_ref %))))
                         (remove nil?)
                         vec)
        new-rows (mapv (fn [row] (mapv #(get row (second (:field_ref %))) cols-to-keep))
                       (get-in card-and-data [:data :rows]))]
    (-> card-and-data
        (update-in [:card :visualization_settings] merge {:table.columns (make-table-cols-viz cols-to-keep :card)})
        (merge-viz-settings (merge {:table-columns (make-table-cols-viz cols-to-keep :data)}))
        (assoc-in [:data :cols] cols-to-keep)
        (assoc-in [:data :rows] new-rows))))

#_{:reordered-columns {:order [2 0 1]}}
(defmethod apply-viz-scenario-key :reordered-columns
  [_ scenario-settings card-and-data]
  (let [cols (get-in card-and-data [:data :cols])
        order (or (:order scenario-settings)
                  (vec (reverse (range (inc (apply max (map #(second (:field_ref %)) cols)))))))
        cols-idx->rows-idx (into {} (map-indexed #(vector (second (:field_ref %2)) %1) cols))
        cols-idx-map (update-vals (group-by #(second (:field_ref %)) cols) first)
        reorder-row (fn [row]
                      (let [new-row (map #(get (vec row) (get cols-idx->rows-idx %)) order)]
                        (vec (remove nil? new-row))))]
    (-> card-and-data
        (update-in [:card :visualization_settings]
                   merge {:table.columns (->> (map #(get cols-idx-map %) order)
                                              (remove nil?)
                                              (#(make-table-cols-viz % :card)))})
        (merge-viz-settings
         (merge {:table-columns (->> (map #(get cols-idx-map %) order)
                                     (remove nil?)
                                     (#(make-table-cols-viz % :data)))}))
        (update-in [:data :rows] #(mapv reorder-row %))
        (assoc-in [:data :cols] (->> (map #(get cols-idx-map %) order)
                                     (remove nil?)
                                     vec)))))

;; HERE add viz-scenarios for tables:
;; {:custom-column-formatting}
(defmethod apply-viz-scenario-key :custom-column-names
  [_ scenario-settings card-and-data]
  (let [cols (sort-by #(second (:field_ref %)) (get-in card-and-data [:data :cols]))
        col-names (or (:names scenario-settings)
                      (mapv #(next-char-string (:name %)) cols))
        data-col-settings (apply merge (map #(make-settings-for-col % {:column-title (get col-names (second (:field_ref %)))} :data)
                                            cols))
        card-col-settings (apply merge (map #(make-settings-for-col % {:column_title (get col-names (second (:field_ref %)))} :card)
                                            cols))]
    (-> card-and-data
        (merge-column-settings-for-data data-col-settings)
        (update-in [:card :visualization_settings :column_settings] merge card-col-settings))))

(defn apply-viz-scenario
  "Add keys/vals to `card-and-data` mimicking a card and dataset-query result according to a `viz-scenario`.
  Note that `viz-scenario` is just a name used in this namespace to describe possible viz configurations, it
  does not map to any models.

  A `viz-scenario` is a combination of 'scenario-keys' and optional maps with settings for that scenario.
  For example, the following viz-scenario map will:
  - add a goal line with a custom value and label to the card if the display-type of the card allows goal lines.
  - add another series, using default data defined in the multi-series multimethod.

  {:goal-line {:goal.value 10 :goal.label \"My Goal\"}
   :multi-series ni}

  Any viz-scenario may have different key/value requirements for the settings map on that key, according to what
  the scenario actually needs to add/remove from the card-and-data. Every scenario has useful defaults for testing,
  so you can always pass {} or nil if you don't know the correct shape of the settings.

  Alternatively, if you already know what data is necessary and where, you can build up your own make-card-and-data
  map using the util fns in this namespace, and call `render-as-hiccup` on that to get the tree."
  [viz-scenario card-and-data]
  (if (seq viz-scenario)
    (let [viz-scenario-keys (vec (keys viz-scenario))
          scenario-key (first viz-scenario-keys)
          scenario-settings (get viz-scenario scenario-key)
          xf-card-and-data  (apply-viz-scenario-key scenario-key scenario-settings card-and-data)]
      (recur (dissoc viz-scenario scenario-key) xf-card-and-data))
    card-and-data))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    render-as-hiccup
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- node-attrs->map
  [^AbstractElement$ExtendedNamedNodeHashMap attrs]
  (when attrs
    (into {} (map (fn [i]
                    (let [item (bean (.item attrs i))]
                      [(keyword (:name item)) (:value item)]))
                  (range (.getLength attrs))))))

(defn- hiccup-zip
  [tree]
  (let [branch? vector?
        children (fn [s] (remove #(or (map? %) (string? %) (not (seqable? %))) s))
        make-node (fn [node c]
                    (let [[k maybe-attrs] (take 2 node)]
                      (into (if (map? maybe-attrs) [k maybe-attrs] [k]) c)))]
    (zip/zipper branch? children make-node tree)))

(defn- document-tag-hiccup
  "Builds a hiccup tree from an SVG document. All keys are keywords, attributes are kept in a map, and node contents are kept.
  All of this is kept for use in tests. For example, colors may only be saved in the attributes map, and you might want to see that."
  [^SVGOMDocument document]
  (letfn [(tree [^Node node]
            (if (instance? org.apache.batik.dom.GenericText node)
              (.getWholeText ^GenericText node)
              (into [(keyword (.getNodeName node)) (node-attrs->map (.getAttributes node))]
                    (map tree
                         (when (instance? Element node)
                           (let [children (.getChildNodes node)]
                             (reduce (fn [cs i] (conj cs (.item children i)))
                                     [] (range (.getLength children)))))))))]
    (tree (.getDocumentElement document))))

(defn- edit-nodes
  "Returns a tree of nodes where any node that matches the `matcher` predicate is modified by the `edit-fn`.
  A `matcher` function takes a zipper location `loc`, and should return `true` or `false`.
  An `edit-fn` function takes a location `loc`, and returns a `loc`, which is easiest to modify with `zip/replace` or `zip/edit`.

  See the `render-as-hiccup` function for an example usage of this function."
  [tree matcher edit-fn]
  (loop [loc (hiccup-zip tree)]
    (if (zip/end? loc)
      (zip/root loc)
      (if (matcher loc)
        (recur (zip/next (edit-fn loc)))
        (recur (zip/next loc))))))

(defn- img-node?
  [loc]
  (= (first (zip/node loc)) :img))

(defn- wrapped-children?
  [loc]
  (let [children (remove #(or (map? %) (string? %) (nil? %)) (rest (zip/node loc)))]
    (and (every? seq? children)
         (seq children))))

(defn- wrapped-node?
  [loc]
  (let [node (zip/node loc)]
    (and (= 1 (count node))
         (seqable? node))))

(def ^:private parse-svg #'js-svg/parse-svg-string)

(defn- img-node->svg-node
  "Modifies an intentionally malformed [:img {:src \"<svg>...</svg>\"}] node by parsing the svg string and
  replacing the entire :img node with the `svg-content` hiccup tree. The malformed node is a result of the
  `render-as-hiccup` function which redefines some functionality of the static-viz rendering pipeline. See
  `render-as-hiccup` in this namespace for details."
  [loc]
  (let [[_ attrs] (zip/node loc)
        svg-content (-> attrs :src parse-svg document-tag-hiccup)]
    (zip/replace loc svg-content)))

(defn- unwrap-children
  [loc]
  (let [node (zip/node loc)
        k (first node)
        attrs (if (map? (second node)) (second node) {})
        children (remove #(or (map? %) (nil? %)) (rest (zip/node loc)))]
    (zip/replace loc (into [k attrs] (first children)))))

(defn- unwrap-node
  [loc]
  (zip/replace loc (first (zip/node loc))))

(defn render-as-hiccup
  "Renders a card-and-data map using the static-viz rendering pipeline, returning a hiccup tree from the html/SVG.
  The input map requires:
  `:card` which contains a map with the necessary keys to configure a visualization.
  `:data` which is map that mimics the shape and settings returned by executing a card's :dataset_query with
  `metabase.query-processor/process-query-and-save-execution!`, and the :process-viz-settings? middleware.
  For example:

  ```
  (let [card-id 1
      {:keys [dataset_query] :as card} (t2/select-one card/Card :id card-id)
      user                             (t2/select-one user/User)
      query-results                    (binding [qp.perms/*card-id* nil]
                                         (qp/process-query-and-save-execution!
                                           (-> dataset_query
                                               (assoc :async? false)
                                               (assoc-in [:middleware :process-viz-settings?] true))
                                           {:executed-by (:id user)
                                            :context     :pulse
                                            :card-id     card-id}))]
  {:data query-results})
  ```

  The intent of these test utils, however, is to avoid the need to run the query processor like this, and just
  work with the data directly.

  Rendering the result as a hiccup tree is acheived by redefining 2 functions:

  `metabase.pulse.render.js-svg/svg-string->bytes` normally takes an svg-string from the static-viz js (via gaalvm)
  and returns PNG bytes. It is redefined to pass the svg-string without any encoding.

  `metabase.pulse.render.image-bundle/make-image-bundle` normally takes a render-type (:inline :attachment) and
  image-bytes, and returns a map containing the image as a base64 encoded string, suitable for an inline src string
  to embed the PNG in an html img tag. It is redefined to pass the string unmodified.

  This does result in a malformed img tag, because the src string ends up being an svg-string, but we immediately
  extract and replace this tag with the `img-node->svg-node` function."
  [{:keys [card data]}]
  (with-redefs [js-svg/svg-string->bytes       identity
                image-bundle/make-image-bundle (fn [_ s]
                                                 {:image-src   s
                                                  :render-type :inline})]
    (let [content (-> (body/render (render/detect-pulse-chart-type card nil data) :inline "UTC" card nil data)
                      :content)]
      (-> content
          (edit-nodes img-node? img-node->svg-node)          ;; replace the :img tag with its parsed SVG.
          (edit-nodes wrapped-node? unwrap-node)             ;; eg: ([:div "content"]) -> [:div "content"]
          (edit-nodes wrapped-children? unwrap-children))))) ;; eg: [:tr ([:td 1] [:td 2])] -> [:tr [:td 1] [:td 2]]

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    make-viz-data
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn make-viz-data
  "Given a `rows` vector, a `display-type` key, and a `viz-scenario` set, returns a map with :card, :data, and :viz-tree keys.

  Each entry in `rows` should be a vector of values, and each row should be of equal size.
  The first row in `rows` is assumed to be the header, and the first entry in each row is assumed to be the x-axis series.

  `display-type` is one of:
  `[:table :gauge :bar :pie :state :scatter :combo :scalar :line :list :area :pivot :funnel :progress :pin_map :smartscalar :country :row]`

  The output map will have:
  :card contains a map with the necessary keys that configure the given `viz-scenario`
  :"
  ([rows display-type viz-scenario] (make-viz-data rows display-type :single viz-scenario))
  ([rows display-type x-config viz-scenario]
   (let [valid-viz-scenario (validate-viz-scenario display-type viz-scenario)
         card-and-data      (->> (make-card-and-data rows display-type x-config)
                                 (apply-viz-scenario valid-viz-scenario))]
     (assoc card-and-data :viz-tree (render-as-hiccup card-and-data)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;   verification-utils
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn nodes-with-text
  "Returns a list of nodes from the `tree` that contain an exact match of `text` as the last entry of the node.
  The tree is assumed to be a valid hiccup-style tree.

  `(nodes-with-text \"the text\" [:svg [:tspan [:text \"the text\"]]]) -> ([:text \"the text\"])`"
  [tree text]
  (->> tree
       (tree-seq vector? (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(#{text} (last %)))))

(defn nodes-with-tag
  "Returns a list of nodes from the `tree` that contain an exact match of `tag` as the first entry of the node.
  The tag can be any valid hiccup key, but will often be a keyword or a string. The tree is assumed to be a valid hiccup-style tree.

  `(nodes-with-tag :tspan [:svg [:tspan [:text \"the text\"]]]) -> ([:tspan [:text \"the text\"]])`"
  [tree tag]
  (->> tree
       (tree-seq vector? (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(#{tag} (first %)))))

(defn remove-attrs
  [tree]
  (let [matcher (fn [loc] (map? (second (zip/node loc))))
        edit-fn (fn [loc]
                  (let [[k _m & c] (zip/node loc)]
                    (zip/replace loc (into [k] c))))]
    (edit-nodes tree matcher edit-fn)))
