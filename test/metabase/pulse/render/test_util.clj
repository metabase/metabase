(ns metabase.pulse.render.test-util
  "The goal of this namespace is to provide some utility functions that let us write static-viz tests
  without needing to make a card or run the query processor. It also allows us to write tests that check
  for actual visual changes in the render by providing a hiccup tree instead of a png metabase.pulse.render.test-util
  This way, we can write tests that only take data in, run that data through the real static-viz render pipeline, and confirm that the render behaves according to the given visual settings.

  To summarize, this namespace contains functions that:

  1. build a minimal card and query result dataset for different visualization types and settings (scenarios)
  2. run the real rendering pipeline, but, return a hiccup tree instead of png bytes
  3. provide quick ways to 'query' the tree for different content, to confirm that elements are properly rendered."
  (:require [clojure.zip :as zip]
            [metabase.pulse.render :as render]
            [metabase.pulse.render.body :as body]
            [metabase.pulse.render.datetime :as datetime]
            [metabase.pulse.render.image-bundle :as image-bundle]
            [metabase.pulse.render.js-svg :as js-svg])
  (:import java.io.ByteArrayInputStream
           java.nio.charset.StandardCharsets
           [org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument]
           [org.w3c.dom Element Node]))

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
                               :min_type      "custom"
                               :min_value     3
                               :max_type      "custom"
                               :max_value     9
                               :colors        ["#00ff00" "#0000ff"]}]}})

(def test-combo-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
    :graph.dimensions ["Price"]}})

(def test-stack-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
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
  [col-name col-sample]
  {:name         col-name
   :display_name col-name
   :settings     nil
   :base_type    (guess-type col-sample)})

(defn base-viz-settings
  [display-type rows]
  (let [header-row (first rows)
        sample-row (second rows)]
    ({:pin_map     {}
      :state       {}
      :country     {}
      :line        {:graph.dimensions [(first header-row)]
                    :graph.metrics (vec (rest header-row))}
      :area        {:graph.dimensions [(first header-row)]
                    :graph.metrics (vec (rest header-row))}
      :bar         {:graph.dimensions [(first header-row)]
                    :graph.metrics (vec (rest header-row))}
      :combo       {:graph.dimensions [(first header-row)]
                    :graph.metrics (vec (rest header-row))}
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
      :pivot       {}} display-type)))

(defn- make-card-and-data
  [display-type rows]
  {:card {:display display-type
          :visualization_settings (base-viz-settings display-type rows)}
   :data {:viz-settings {}
          :cols (mapv base-cols-settings (first rows) (second rows))
          :rows (vec (rest rows))}})

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
   :pie         #{}
   :funnel      #{}
   :progress    #{}
   :scalar      #{}
   :smartscalar #{}
   :gauge       #{}
   :table       #{}
   :scatter     #{}
   :row         #{}
   :list        #{}
   :pivot       #{}})

(defn- validate-viz-scenario
  [display-type viz-scenario]
  (->> viz-scenario
       (filter (valid-viz-scenarios display-type))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    apply viz-scenarios
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defmulti ^:private apply-viz-scenario-key
  "WIP. Create a map of card and data mimicking a valid card and dataset-query result according to a `visualization-scenario`.

  A `visualization-scenario` is a set of keys dictating the various visualization settings possible."
  (fn [scenario-key _] scenario-key))

(defmethod apply-viz-scenario-key :default
  [_ card-and-data]
  card-and-data)

(defmethod apply-viz-scenario-key :goal-line
  [_ card-and-data]
  (update-in card-and-data [:data :viz-settings] merge
             {:graph.show_goal  true
              :graph.goal_label "Goal"
              :graph.goal_value 0}))

(defn- next-char-string [s]
  (apply str (map (comp char inc int) s)))

(defmethod apply-viz-scenario-key :multi-series
  [_ card-and-data]
  (let [rows (get-in card-and-data [:data :rows])]
    (if (> (count (first rows)) 2)
      card-and-data
      (let [new-col-name (next-char-string (last (get-in card-and-data [:card :visualization_settings :graph.metrics])))
            new-col-data (map inc (range (count rows)))
            new-rows (mapv conj rows new-col-data)]
        (-> card-and-data
            (update-in [:card :visualization_settings :graph.metrics] conj new-col-name)
            (update-in [:data :cols] conj (base-cols-settings new-col-name (first new-col-data)))
            (assoc-in [:data :rows] new-rows))))))

(defn- apply-viz-scenario
  [viz-scenario card-and-data]
  (if (seq viz-scenario)
    (let [viz-scenario-keys (vec viz-scenario)
          xf-card-and-data  (apply-viz-scenario-key (first viz-scenario-keys) card-and-data)]
      (recur (rest viz-scenario-keys) xf-card-and-data))
    card-and-data))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;    render-as-hiccup
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- node-attrs->map
  [attrs]
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
              (.getWholeText node)
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
    (and (= 1 (count node ))
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
      {:keys [dataset_query] :as card} (db/select-one card/Card :id card-id)
      user                             (db/select-one user/User)
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
  [rows display-type viz-scenario]
  (let [valid-viz-scenario (validate-viz-scenario display-type viz-scenario)
        card-and-data      (->> rows
                                (make-card-and-data display-type)
                                (apply-viz-scenario valid-viz-scenario))]
    (assoc card-and-data :viz-tree (render-as-hiccup card-and-data))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;   verification-utils
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn nodes-with-text
  "Returns a list of nodes from the `tree` that contain an exact match of `text` as the last entry of the node.
  The tree is assumed to be a valid hiccup-style tree.

  `(nodes-with-text \"the text\" [:svg [:tspan [:text \"the text\"]]]) -> ([:text \"the text\"])`"
  [text tree]
  (->> tree
       (tree-seq vector? (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(#{text} (last %)))))

(defn nodes-with-tag
  "Returns a list of nodes from the `tree` that contain an exact match of `tag` as the first entry of the node.
  The tag can be any valid hiccup key, but will often be a keyword or a string. The tree is assumed to be a valid hiccup-style tree.

  `(nodes-with-tag :tspan [:svg [:tspan [:text \"the text\"]]]) -> ([:tspan [:text \"the text\"]])`"
  [tag tree]
  (->> tree
       (tree-seq vector? (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(#{tag} (first %)))))

(defn remove-attrs
  [tree]
  (let [matcher (fn [loc] (map? (second (zip/node loc))))
        edit-fn (fn [loc]
                  (let [[k m & c] (zip/node loc)]
                    (zip/replace loc (into [k] c))))]
    (edit-nodes tree matcher edit-fn)))
