(ns metabase-enterprise.library-branching.format.kinds.dashboard
  "The codec of the kind :dashboard. Not implemented yet."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def dashcard-defaults
  "The default of each optional entry of a dashboard card. Not implemented yet."
  {})

(defn normal-dashcard
  "Dashboard card `dashcard` in its one form. Not implemented yet."
  [dashcard]
  dashcard)

(defn dashcard-order
  "`dashcards` in the order of the file. Not implemented yet."
  [_tabs dashcards]
  dashcards)

(defn refs
  "The references of a dashboard. Not implemented yet."
  [_id _attrs]
  #{})

(defn home
  "A root-level dashboard is in `library/`."
  [_item]
  {:dir ["library"]})

(def spec
  "The spec of the dashboard codec. Not implemented yet."
  {:kind       :dashboard
   :word       "dashboard"
   :directory? false
   :home       #'home
   :id-schema  ::snapshot/entity-id
   :name-key   :name
   :place-key  :collection
   :attrs      {}
   :refs       #'refs})

(registry/def ::item (common/item-schema spec))

(def codec
  "The codec of the kind :dashboard."
  (common/codec spec ::item))
