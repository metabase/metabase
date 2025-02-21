(ns metabase.pulse.render.test-util
  "The goal of this namespace is to provide some utility functions that let us write static-viz tests
  with assertions about rendered content.

  This is done by providing functions that render cards/dashcards to hiccup or hickory data structures,
  and a few util functions for 'querying' these structures to find elements against which assertions can be written."
  (:require
   [clojure.string :as str]
   [clojure.zip :as zip]
   [hiccup.core :as hiccup]
   [hickory.core :as hik]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pivot :as qp.pivot]
   [toucan2.core :as t2])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument AbstractElement$ExtendedNamedNodeHashMap)
   (org.apache.batik.dom GenericText)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

(def test-card
  {:id 1
   :visualization_settings
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
  A `matcher` function takes a zipper location `loc`, and should return `true` or `false`. An `edit-fn` function takes
  a location `loc`, and returns a `loc`, which is easiest to modify with `zip/replace` or `zip/edit`.

  See the [[render-card-as-hickory!]] function for an example usage of this function."
  [tree matcher edit-fn]
  (loop [loc (hiccup-zip tree)]
    (if (zip/end? loc)
      (zip/root loc)
      (if (matcher loc)
        (recur (zip/next (edit-fn loc)))
        (recur (zip/next loc))))))

(defn- img-node-with-svg?
  [loc]
  (let [[tag {:keys [src]}] (zip/node loc)]
    (and
     (= tag :img)
     (str/starts-with? src "<svg"))))

(def ^:private parse-svg #'js.svg/parse-svg-string)

(defn- img-node->svg-node
  "Modifies an intentionally malformed [:img {:src \"<svg>...</svg>\"}] node by parsing the svg string and replacing the
  entire :img node with the `svg-content` hiccup tree. The malformed node is a result of the
  [[render-card-as-hickory!]] function which redefines some functionality of the static-viz rendering pipeline. See
  [[render-card-as-hickory!]] in this namespace for details."
  [loc]
  (let [[_ attrs] (zip/node loc)
        svg-content (-> attrs :src parse-svg document-tag-hiccup)]
    (zip/replace loc svg-content)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;   verification-utils
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn nodes-with-text
  "Returns a list of nodes from the `tree` that includes text `text` as the last entry of the node.
  The tree is assumed to be a valid hiccup-style tree.

  `(nodes-with-text \"the text\" [:svg [:tspan [:text \"the text\"]]]) -> ([:text \"the text\"])`"
  [tree text]
  (->> tree
       (tree-seq #(and (seqable? %) (not (map? %))) (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(and (string? (last %)) (str/includes? (last %) text)))))

(defn nodes-with-tag
  "Returns a list of nodes from the `tree` that contain an exact match of `tag` as the first entry of the node. The tag
  can be any valid hiccup key, but will often be a keyword or a string. The tree is assumed to be a valid hiccup-style
  tree.

  `(nodes-with-tag :tspan [:svg [:tspan [:text \"the text\"]]]) -> ([:tspan [:text \"the text\"]])`"
  [tree tag]
  (->> tree
       (tree-seq #(and (seqable? %) (not (map? %))) (fn [s] (remove #(or (map? %) (string? %) (keyword? %)) s)))
       (filter #(#{tag} (first %)))))

(defn render-card-as-hickory!
  "Render the card with `card-id` using the static-viz rendering pipeline as a hickory data structure. Redefines some
  internal rendering functions to keep svg from being rendered into a png. Functions from `hickory.select` can be used
  on the output of this function and are particularly useful for writing test assertions."
  [card-id]
  (let [{:keys [visualization_settings] :as card} (t2/select-one :model/Card :id card-id)
        query                                     (qp.card/query-for-card card [] nil {:process-viz-settings? true} nil)
        results                                   (qp/process-query (assoc query :viz-settings visualization_settings))]
    (with-redefs [js.svg/svg-string->bytes       identity
                  image-bundle/make-image-bundle (fn [_ s]
                                                   {:image-src   s
                                                    :render-type :inline})]
      (let [content (-> (channel.render/render-pulse-card :inline "UTC" card nil results)
                        :content)]
        (-> content
            (edit-nodes img-node-with-svg? img-node->svg-node) ;; replace the :img tag with its parsed SVG.
            hiccup/html
            hik/parse
            hik/as-hickory)))))

(defn render-pivot-card-as-hickory!
  "Render the card with `card-id` using the pivot qp and the static-viz rendering pipeline as a hickory data structure.
  Redefines some internal rendering functions to keep svg from being rendered into a png. Functions from `hickory.select`
  can be used on the output of this function and are particularly useful for writing test assertions."
  [card-id]
  (let [{:keys [visualization_settings] :as card} (t2/select-one :model/Card :id card-id)
        query                                     (qp.card/query-for-card card [] nil {:process-viz-settings? true} nil)
        results                                   (qp.pivot/run-pivot-query (assoc query :viz-settings visualization_settings))]
    (with-redefs [js.svg/svg-string->bytes       identity
                  image-bundle/make-image-bundle (fn [_ s]
                                                   {:image-src   s
                                                    :render-type :inline})]
      (let [content (-> (channel.render/render-pulse-card :inline "UTC" card nil results)
                        :content)]
        (-> content
            (edit-nodes img-node-with-svg? img-node->svg-node) ;; replace the :img tag with its parsed SVG.
            hiccup/html
            hik/parse
            hik/as-hickory)))))

(defn render-dashcard-as-hickory!
  "Render the dashcard with `dashcard-id` using the static-viz rendering pipeline as a hickory data structure. Redefines
  some internal rendering functions to keep svg from being rendered into a png. Functions from `hickory.select` can be
  used on the output of this function and are particularly useful for writing test assertions."
  ([dashcard-id] (render-dashcard-as-hickory! dashcard-id []))
  ([dashcard-id parameters]
   (let [dashcard                  (t2/select-one :model/DashboardCard :id dashcard-id)
         card                      (t2/select-one :model/Card :id (:card_id dashcard))
         {:keys [result dashcard]} (notification.execute/execute-dashboard-subscription-card dashcard parameters)]
     (with-redefs [js.svg/svg-string->bytes       identity
                   image-bundle/make-image-bundle (fn [_ s]
                                                    {:image-src   s
                                                     :render-type :inline})]
       (let [content (-> (channel.render/render-pulse-card :inline "UTC" card dashcard result)
                         :content)]
         (-> content
             (edit-nodes img-node-with-svg? img-node->svg-node) ;; replace the :img tag with its parsed SVG.
             hiccup/html
             hik/parse
             hik/as-hickory))))))
