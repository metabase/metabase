(ns metabase-enterprise.content-diagnostics.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def entity-types
  "Every entity type a finding can be about."
  #{:card :collection :dashboard :document :transform})

(def non-collection-entity-types
  "Every entity type but `:collection`: what the stale checker scans, and the `/stale` and `/slow`
  filter vocabulary."
  (disj entity-types :collection))

(def ^:private imbalanced-details
  "What `sparse` and `crowded` freeze: the limit that was crossed and the unit it counts in. `empty`
  builds on this."
  [:map {:closed true}
   [:threshold :int]
   [:unit      :string]])

(def ^:private finding-details
  "The scan-time evidence blob each finding type freezes into `content_diagnostics_finding.details`.
  Closed per type, so a checker can neither persist a key the serve layer never reads nor borrow one
  belonging to a different finding type."
  {:stale          [:map {:closed true} [:threshold_days :int]]
   ;; a leaf (card, transform) freezes the threshold it crossed; a container roll-up (dashboard,
   ;; document) names its slow culprit cards instead - never both
   :slow           [:or
                    [:map {:closed true} [:threshold_ms :int]]
                    [:map {:closed true} [:slow_entity_ids [:sequential ::lib.schema.id/card]]]]
   :duplicate_name [:map {:closed true}
                    [:normalized_name      :string]
                    [:duplicate_entity_ids [:sequential ms/PositiveInt]]]
   ;; `as_of` is the empty card's last clean run - a temporal here, a string in the response, because it
   ;; round-trips through the JSON blob
   :empty          (conj imbalanced-details [:as_of {:optional true} ms/TemporalInstant])
   :sparse         imbalanced-details
   :crowded        imbalanced-details})

(def ^:private finding-row-columns
  "The columns every finding writes, whatever its type. `detected_at` and `invalidated_at` are absent by
  design: the first takes the column default, the second is stamped later by invalidation."
  [[:scan_id                :string]
   [:entity_type            (into [:enum] entity-types)]
   [:entity_id              ms/PositiveInt]
   [:scope_collection_id    [:maybe ::lib.schema.id/collection]]
   [:last_active_at         [:maybe ms/TemporalInstant]]
   [:duration_ms            [:maybe :int]]
   [:content_count          [:maybe :int]]
   [:duplicate_count        [:maybe :int]]
   [:entity_name            [:maybe :string]]
   [:entity_created_at      [:maybe ms/TemporalInstant]]
   [:entity_creator_id      [:maybe ::lib.schema.id/user]]
   [:entity_creator_name    [:maybe :string]]
   [:card_type              [:maybe :keyword]]
   [:entity_collection_name [:maybe :string]]
   [:entity_kind            [:maybe :keyword]]])

(mr/def ::finding.create
  "One `content_diagnostics_finding` row as a scan writes it, dispatched on `finding_type` so every row
  is checked against its own type's `details`. A finding type with no arm fails here rather than
  persisting a blob nothing can read."
  (into [:multi {:dispatch :finding_type}]
        (map (fn [[finding-type details]]
               [finding-type (into [:map {:closed true}
                                    [:finding_type [:= finding-type]]
                                    [:details      details]]
                                   finding-row-columns)]))
        finding-details))
