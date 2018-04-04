(ns metabase.sync.analyze.classifiers.text-fingerprint
  "Logic for inferring the special types of *Text* fields based on their TextFingerprints.
   These tests only run against Fields that *don't* have existing special types."
  (:require [clojure.tools.logging :as log]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def ^:private ^:const ^Float percent-valid-threshold
  "Fields that have at least this percent of values that are satisfy some predicate (such as `u/email?`)
   should be given the corresponding special type (such as `:type/Email`)."
  0.95)

(s/defn ^:private percent-key-below-threshold? :- s/Bool
  "Is the value of PERCENT-KEY inside TEXT-FINGERPRINT above the `percent-valid-threshold`?"
  [text-fingerprint :- i/TextFingerprint, percent-key :- s/Keyword]
  (boolean
   (when-let [percent (get text-fingerprint percent-key)]
     (>= percent percent-valid-threshold))))


(def ^:private percent-key->special-type
  "Map of keys inside the `TextFingerprint` to the corresponding special types we should mark a Field as if the value of
  the key is over `percent-valid-thresold`."
  {:percent-json  :type/SerializedJSON
   :percent-url   :type/URL
   :percent-email :type/Email})

(s/defn ^:private infer-special-type-for-text-fingerprint :- (s/maybe su/FieldType)
  "Check various percentages inside the TEXT-FINGERPRINT and return the corresponding special type to mark the Field
  as if the percent passes the threshold."
  [text-fingerprint :- i/TextFingerprint]
  (some (fn [[percent-key special-type]]
          (when (percent-key-below-threshold? text-fingerprint percent-key)
            special-type))
        (seq percent-key->special-type)))


(s/defn infer-special-type :- (s/maybe i/FieldInstance)
  "Do classification for `:type/Text` Fields with a valid `TextFingerprint`.
   Currently this only checks the various recorded percentages, but this is subject to change in the future."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (when (isa? (:base_type field) :type/Text)
    (when-not (:special_type field)
      (when-let [text-fingerprint (get-in fingerprint [:type :type/Text])]
        (when-let [inferred-special-type (infer-special-type-for-text-fingerprint text-fingerprint)]
          (log/debug (format "Based on the fingerprint of %s, we're marking it as %s."
                             (sync-util/name-for-logging field) inferred-special-type))
          (assoc field
            :special_type inferred-special-type))))))
