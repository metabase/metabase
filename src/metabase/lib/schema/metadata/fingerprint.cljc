(ns metabase.lib.schema.metadata.fingerprint
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::percent
  "Schema for something represting a percentage. A floating-point value between (inclusive) 0 and 1."
  [:and
   number?
   [:fn
    {:error/message "Valid percentage between (inclusive) 0 and 1."}
    #(<= 0 % 1)]])

(mr/def ::fingerprint.global
  "Fingerprint values that Fields of all types should have."
  [:map
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:distinct-count {:optional true} :int]
   [:nil%           {:optional true} [:maybe [:ref ::percent]]]])

(mr/def ::fingerprint.number
  "Schema for fingerprint information for Fields deriving from `:type/Number`."
  [:map
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:min {:optional true} [:maybe number?]]
   [:max {:optional true} [:maybe number?]]
   [:avg {:optional true} [:maybe number?]]
   [:q1  {:optional true} [:maybe number?]]
   [:q3  {:optional true} [:maybe number?]]
   [:sd  {:optional true} [:maybe number?]]])

(mr/def ::fingerprint.text
  "Schema for fingerprint information for Fields deriving from `:type/Text`."
  [:map
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:percent-json   {:optional true} [:maybe [:ref ::percent]]]
   [:percent-url    {:optional true} [:maybe [:ref ::percent]]]
   [:percent-email  {:optional true} [:maybe [:ref ::percent]]]
   [:percent-state  {:optional true} [:maybe [:ref ::percent]]]
   [:average-length {:optional true} [:maybe number?]]])

(mr/def ::fingerprint.temporal
  "Schema for fingerprint information for Fields deriving from `:type/Temporal`."
  [:map
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:earliest {:optional true} [:maybe :string]]
   [:latest   {:optional true} [:maybe :string]]])

(mr/def ::fingerprint.type-specific
  "Schema for type-specific fingerprint information."
  [:and
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:map-of ::lib.schema.common/base-type :map]
   [:map
    [:type/Number   {:optional true} [:ref ::fingerprint.number]]
    [:type/Text     {:optional true} [:ref ::fingerprint.text]]
    ;; temporal fingerprints are keyed by `:type/DateTime` for historical reasons. `DateTime` used to be the parent of
    ;; all temporal MB types.
    [:type/DateTime {:optional true} [:ref ::fingerprint.temporal]]]
   [:fn
    {:error/message "Type-specific fingerprint with exactly one key"}
    (fn [m]
      (= 1 (count (keys m))))]])

(mr/def ::fingerprint
  "Schema for a Field 'fingerprint' generated as part of the analysis stage. Used to power the 'classification'
   sub-stage of analysis. Stored as the `fingerprint` column of Field."
  [:map
   {:decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:global       {:optional true} [:ref ::fingerprint.global]]
   [:type         {:optional true} [:ref ::fingerprint.type-specific]]
   [:experimental {:optional true} [:map-of :keyword :any]]])
