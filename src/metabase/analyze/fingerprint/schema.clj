(ns metabase.analyze.fingerprint.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::Percent
  [:and
   number?
   [:fn
    {:error/message "Valid percentage between (inclusive) 0 and 1."}
    #(<= 0 % 1)]])

(def Percent
  "Schema for something represting a percentage. A floating-point value between (inclusive) 0 and 1."
  [:ref ::Percent])

(mr/def ::GlobalFingerprint
  [:map
   [:distinct-count {:optional true} :int]
   [:nil%           {:optional true} [:maybe Percent]]])

(def GlobalFingerprint
  "Fingerprint values that Fields of all types should have."
  [:ref ::GlobalFingerprint])

(mr/def ::NumberFingerprint
  [:map
   [:min {:optional true} [:maybe number?]]
   [:max {:optional true} [:maybe number?]]
   [:avg {:optional true} [:maybe number?]]
   [:q1  {:optional true} [:maybe number?]]
   [:q3  {:optional true} [:maybe number?]]
   [:sd  {:optional true} [:maybe number?]]])

(def NumberFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/Number`."
  [:ref ::NumberFingerprint])

(mr/def ::TextFingerprint
  [:map
   [:percent-json   {:optional true} [:maybe Percent]]
   [:percent-url    {:optional true} [:maybe Percent]]
   [:percent-email  {:optional true} [:maybe Percent]]
   [:percent-state  {:optional true} [:maybe Percent]]
   [:average-length {:optional true} [:maybe number?]]])

(def TextFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/Text`."
  [:ref ::TextFingerprint])

(mr/def ::TemporalFingerprint
  [:map
   [:earliest {:optional true} [:maybe :string]]
   [:latest   {:optional true} [:maybe :string]]])

(def TemporalFingerprint
  "Schema for fingerprint information for Fields deriving from `:type/Temporal`."
  [:ref ::TemporalFingerprint])

(mr/def ::TypeSpecificFingerprint
  [:and
   [:map
    [:type/Number   {:optional true} NumberFingerprint]
    [:type/Text     {:optional true} TextFingerprint]
    ;; temporal fingerprints are keyed by `:type/DateTime` for historical reasons. `DateTime` used to be the parent of
    ;; all temporal MB types.
    [:type/DateTime {:optional true} TemporalFingerprint]]
   [:fn
    {:error/message "Type-specific fingerprint with exactly one key"}
    (fn [m]
      (= 1 (count (keys m))))]])

(def TypeSpecificFingerprint
  "Schema for type-specific fingerprint information."
  [:ref ::TypeSpecificFingerprint])

(mr/def ::Fingerprint
  [:map
   [:global       {:optional true} GlobalFingerprint]
   [:type         {:optional true} TypeSpecificFingerprint]
   [:experimental {:optional true} :map]])

(def Fingerprint
  "Schema for a Field 'fingerprint' generated as part of the analysis stage. Used to power the 'classification'
   sub-stage of analysis. Stored as the `fingerprint` column of Field."
  [:ref ::Fingerprint])
