(ns metabase-enterprise.library-branching.format.kinds.visualization
  "Visualization settings in their portable document form (the serdes export of master, with keyword keys): the
  references that they hold. A kind whose content holds visualization settings (a metric, a question, a dashboard
  card) takes the references of its settings from [[refs]]."
  (:require
   [metabase-enterprise.library-branching.format.json :as json]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]))

(set! *warn-on-reflection* true)

(def ^:private item-roles
  "Values of a click behavior's `linkType` and of a link card's `model` whose target is an item, with the role of the
  reference."
  {"card"       :card
   "dataset"    :card
   "question"   :card
   "dashboard"  :dashboard
   "collection" :collection})

(def ^:private link-card-roles
  "Values of a link card's `model` whose target is an item, with the role of the reference: [[item-roles]] and a
  metric. A click behavior cannot link to a metric."
  (assoc item-roles "metric" :card))

(defn- text
  "The text of the map key `k`: a keyword's name with its namespace, or a string."
  [k]
  (cond
    (keyword? k) (subs (str k) 1)
    (string? k)  k))

(defn- json-refs
  "[[portable/refs]] of the value of the JSON text `s`; none when `s` is not JSON text."
  [s]
  (if-let [t (text s)]
    (try
      (portable/refs (json/parse t))
      (catch clojure.lang.ExceptionInfo _
        #{}))
    #{}))

(defn- parameter-mapping-refs
  "The references of the click-behavior parameter mappings `mappings`: a mapping to a dimension holds it as JSON text
  in its key, its `:id` and the `:id` of its target."
  [mappings]
  (into #{}
        (comp (filter (fn [[_ m]] (and (map? m) (= "dimension" (get-in m [:target :type])))))
              (mapcat (fn [[k m]] [k (:id m) (get-in m [:target :id])]))
              (mapcat json-refs))
        (when (map? mappings) mappings)))

(defn- click-behavior-refs
  "The references of the click behavior `cb`: the target of a link to an item, and its parameter mappings."
  [cb]
  (if (map? cb)
    (let [{:keys [type linkType targetId parameterMapping]} cb
          role (get item-roles linkType)]
      (cond-> (parameter-mapping-refs parameterMapping)
        (and (= "link" type) role (some? targetId)) (conj [role targetId])))
    #{}))

(defn- link-card-refs
  "The reference of a link card to the entity `entity`: an item, or a table or database of the environment."
  [entity]
  (when (map? entity)
    (let [{:keys [model id]} entity]
      (when (some? id)
        (cond
          (contains? link-card-roles model) [[(get link-card-roles model) id]]
          (= "table" model)            [[:table [:env id]]]
          (= "database" model)         [[:database [:env [id]]]])))))

(defn- timeline-refs
  "The references to the timelines that the settings show or whose events they hide: a hidden event is `[timeline
  event]`."
  [settings]
  (let [ids (fn [k] (let [v (get settings k)] (when (sequential? v) v)))]
    (into #{}
          (comp (map (fn [x] (if (vector? x) (first x) x)))
                (remove nil?)
                (map (fn [x] [:timeline x])))
          (concat (ids :timeline.selected_timeline_ids)
                  (ids :timeline.excluded_timeline_event_ids)))))

(defn- column-settings-refs
  "The references of the column settings `column-settings`: each key is the JSON text of a column reference, and each
  value can hold a click behavior."
  [column-settings]
  (into #{}
        (mapcat (fn [[k v]] (into (json-refs k) (when (map? v) (click-behavior-refs (:click_behavior v))))))
        (when (map? column-settings) column-settings)))

(defn refs
  "The set of references `[role target]` in the visualization settings `settings`: [[portable/refs]] of the settings,
  and the references at the positions that hold an identity or JSON text: the keys of the column settings, the
  click behaviors (a link to a question, a dashboard or a collection, and the dimensions of their parameter mappings),
  a link card's entity, and the shown timelines and the timelines of the hidden events. A reference position holds
  its value as the target whatever its shape, so an item schema refuses a target that is not an identity."
  [settings]
  (if (map? settings)
    (-> (portable/refs settings)
        (into (column-settings-refs (:column_settings settings)))
        (into (click-behavior-refs (:click_behavior settings)))
        (into (link-card-refs (get-in settings [:link :entity])))
        (into (timeline-refs settings)))
    #{}))
