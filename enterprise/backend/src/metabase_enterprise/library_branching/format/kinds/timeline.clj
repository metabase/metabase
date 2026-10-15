(ns metabase-enterprise.library-branching.format.kinds.timeline
  "The codec of the kind :timeline: a timeline with its events, as the file `<name>.timeline.yaml`. The place is the
  collection, under `collection`. The events are nested content, not items: the attribute `:events` holds each event
  that is not in the trash, with its entity id under `id`, in the order of [[event-order]]."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot])
  (:import
   (java.time Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

(def icons
  "The icons of a timeline and of an event. Metabase reads the removed icon \"balloons\" as \"star\", the default."
  ["star" "cake" "mail" "mail_at" "warning" "bell" "cloud" "info" "note" "event"])

(def default-icon
  "The icon of a timeline or an event that names none."
  "star")

(defn- instant
  "The instant of the ISO-8601 text `s`, with an offset or as an instant; nil when `s` is not such a text."
  ^Instant [s]
  (when (string? s)
    (try
      (Instant/parse s)
      (catch Exception _
        (try
          (.toInstant (OffsetDateTime/parse s))
          (catch Exception _ nil))))))

(defn canonical-time?
  "True iff `s` is the canonical text of an instant: the text that `Instant/toString` gives, in UTC."
  [s]
  (boolean (some-> (instant s) str (= s))))

(defn event-order
  "The sort key of an event: its time, then its identity."
  [{:keys [timestamp id]}]
  [(instant timestamp) id])

(defn- in-order?
  [events]
  (or (empty? events)
      (and (every? #(some? (instant (:timestamp %))) events)
           (apply distinct? (map :id events))
           (every? (fn [[a b]] (neg? (compare (event-order a) (event-order b)))) (partition 2 1 events)))))

(def event-defaults
  "The value of each key of an event that it may omit."
  {:time_matters false
   :icon         default-icon})

(registry/def ::event
  [:map {:closed true}
   [:id ::snapshot/entity-id]
   [:name [:string {:min 1 :max 255}]]
   [:description {:optional true} [:string {:max 255}]]
   [:timestamp [:and :string [:fn {:error/message "the canonical text of an instant, in UTC"} #'canonical-time?]]]
   [:timezone [:string {:max 255}]]
   [:time_matters {:optional true} [:= true]]
   [:icon {:optional true} (into [:enum] (remove #{default-icon}) icons)]])

(registry/def ::events
  [:and
   [:vector ::event]
   [:fn {:error/message "the events have one identity each, in the order of their time and identity"} #'in-order?]])

(defn normal-event
  "Event `e` with no key at its default or nil, and its time as the canonical text of its instant. A value that is not a
  map stays as it is."
  [e]
  (if (map? e)
    (let [t (instant (:timestamp e))]
      (cond-> (into {} (remove (fn [[k v]] (or (nil? v) (= v (get event-defaults k ::none))))) e)
        t (assoc :timestamp (str t))))
    e))

(defn normal-events
  "The events `events` in their canonical form: each with no key at its default and its time as the canonical text of
  its instant, in the order of [[event-order]]. A value that is not a vector of events with times stays as it is."
  [events]
  (if (and (vector? events) (every? map? events))
    (let [es (mapv normal-event events)]
      (if (every? #(some? (instant (:timestamp %))) es)
        (vec (sort-by event-order es))
        es))
    events))

(defn decode-attrs
  "The attributes as an item holds them: the events in their canonical form ([[normal-events]])."
  [attrs]
  (cond-> attrs
    (contains? attrs :events) (update :events normal-events)))

(defn home
  "A root-level timeline, which a well-formed snapshot never has, is in `library/`."
  [_item]
  {:dir ["library"]})

(defn refs
  "A timeline has no references: its place is its container, and an event refers to nothing."
  [_id _attrs]
  #{})

(def spec
  "The spec of the timeline codec. The archive column is not an attribute (scope), nor are the creator and the
  bookkeeping columns of the timeline and of its events."
  {:kind         :timeline
   :word         "timeline"
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :name-schema  [:string {:min 1 :max 255}]
   :place-key    :collection
   :attrs        {:description {:schema [:string {:max 255}]}
                  :icon        {:schema (into [:enum] icons) :default default-icon}
                  :default     {:schema :boolean :default false}
                  :events      {:schema ::events :default []}}
   :decode-attrs #'decode-attrs
   :refs         #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :timeline."
  (common/codec spec ::item))
