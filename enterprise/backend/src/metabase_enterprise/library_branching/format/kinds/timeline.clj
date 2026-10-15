(ns metabase-enterprise.library-branching.format.kinds.timeline
  "The codec of the kind :timeline. A stub: the tests of the kind come first."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def icons
  "The icons of a timeline and of an event."
  [])

(def default-icon
  "The icon of a timeline or an event that names none."
  nil)

(def event-defaults
  "The value of each key of an event that it may omit."
  {})

(defn event-order
  "The sort key of an event."
  [_event]
  nil)

(defn normal-event
  "Event `e` in its canonical form."
  [e]
  e)

(defn home
  "Where a root-level timeline is."
  [_item]
  {:dir ["library"]})

(defn refs
  "The references of a timeline."
  [_id _attrs]
  #{})

(def spec
  "The spec of the timeline codec."
  {:kind       :timeline
   :word       "timeline"
   :directory? false
   :home       #'home
   :id-schema  ::snapshot/entity-id
   :name-key   :name
   :place-key  :collection
   :attrs      {}
   :refs       #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :timeline."
  (common/codec spec ::item))
