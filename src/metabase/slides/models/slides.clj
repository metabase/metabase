(ns metabase.slides.models.slides
  "Slides — Gamma-style decks of interactive Metabase content. Each row is a deck;
   the `slides` column is a JSON array of slide objects, each carrying its own
   TipTap document."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Slides [_model] :slides)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :slides]
  [_original-model _k]
  :model/Slides)

(t2/deftransforms :model/Slides
  {:slides mi/transform-json})

(doto :model/Slides
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def SlidesName
  "Validation for the name of a deck."
  (mu/with-api-error-message
   [:and
    {:error/message "invalid deck name"
     :json-schema   {:type "string" :minLength 1 :maxLength 254}}
    [:string {:min 1 :max 254}]
    [:fn (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string between 1 and 254 characters.")))

(def Slide
  "A single slide: a stable client-generated id, a TipTap doc, and an optional layout hint."
  [:map
   [:id :string]
   [:doc map?]
   [:layout {:optional true} [:enum "default" "cover" "closing"]]])

(def SlidesArray
  "A non-empty array of slides."
  [:vector {:min 1} Slide])

(defn validate-collection-move-permissions
  "Validates write access for both source and destination collection during a deck move."
  [old-collection-id new-collection-id]
  (when old-collection-id
    (api/write-check :model/Collection old-collection-id))
  (when new-collection-id
    (api/check-400 (t2/exists? :model/Collection :id new-collection-id :archived false))
    (api/write-check :model/Collection new-collection-id)))

(methodical/defmethod t2/batched-hydrate [:model/Slides :creator]
  [_model k decks]
  (mi/instances-with-hydrated-data
   decks k
   #(-> (t2/select [:model/User :id :email :first_name :last_name]
                   :id (keep :creator_id decks))
        (->> (map (juxt :id identity))
             (into {})))
   :creator_id {:default {}}))
