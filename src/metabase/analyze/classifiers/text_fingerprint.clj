(ns metabase.analyze.classifiers.text-fingerprint
  "Logic for inferring the semantic types of *Text* fields based on their TextFingerprints.
   These tests only run against Fields that *don't* have existing semantic types."
  (:require
   [metabase.analyze.fingerprint.schema :as fingerprint.schema]
   [metabase.analyze.schema :as analyze.schema]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private ^:const ^Double percent-valid-threshold
  "Fields that have at least this percent of values that are satisfy some predicate (such as `u/email?`)
   should be given the corresponding semantic type (such as `:type/Email`)."
  0.95)

(def ^:private ^Double lower-percent-valid-threshold
  "Fields that have at least this lower percent of values that satisfy some predicate (such as `u/state?`) should be
  given the corresponding semantic type (such as `:type/State`)"
  0.7)

(mu/defn ^:private percent-key-above-threshold?
  "Is the value of `percent-key` inside `text-fingerprint` above the `percent-valid-threshold`?"
  [threshold        :- :double
   text-fingerprint :- fingerprint.schema/TextFingerprint
   percent-key      :- :keyword]
  (when-let [percent (get text-fingerprint percent-key)]
    (>= percent threshold)))

(def ^:private percent-key->semantic-type
  "Map of keys inside the `TextFingerprint` to the corresponding semantic types we should mark a Field as if the value of
  the key is over `percent-valid-thresold`."
  {:percent-json  [:type/SerializedJSON percent-valid-threshold]
   :percent-url   [:type/URL            percent-valid-threshold]
   :percent-email [:type/Email          percent-valid-threshold]
   :percent-state [:type/State          lower-percent-valid-threshold]})

(mu/defn ^:private infer-semantic-type-for-text-fingerprint :- [:maybe ms/FieldType]
  "Check various percentages inside the `text-fingerprint` and return the corresponding semantic type to mark the Field
  as if the percent passes the threshold."
  [text-fingerprint :- fingerprint.schema/TextFingerprint]
  (some (fn [[percent-key [semantic-type threshold]]]
          (when (percent-key-above-threshold? threshold text-fingerprint percent-key)
            semantic-type))
        percent-key->semantic-type))

(defn- can-edit-semantic-type?
  "We can edit the semantic type if its currently unset or if it was set during the current analysis phase. The original
  field might exist in the metadata at `:sync.classify/original`. This is an attempt at classifier refinement: we
  never want to overwrite a user selection of semantic type but we allow for fingerprint results to give a better
  semantic type than previous classifiers."
  [field]
  (or (nil? (:semantic_type field))
      (let [original (get (meta field) :sync.classify/original)]
        (and original
             (nil? (:semantic_type original))))))

(mu/defn infer-semantic-type :- [:maybe analyze.schema/Field]
  "Do classification for `:type/Text` Fields with a valid `TextFingerprint`.
   Currently this only checks the various recorded percentages, but this is subject to change in the future."
  [field       :- analyze.schema/Field
   fingerprint :- [:maybe fingerprint.schema/Fingerprint]]
  (when (and (isa? (:base_type field) :type/Text)
             (can-edit-semantic-type? field))
    (when-let [text-fingerprint (get-in fingerprint [:type :type/Text])]
      (when-let [inferred-semantic-type (infer-semantic-type-for-text-fingerprint text-fingerprint)]
        (log/debugf "Based on the fingerprint of %s, we're marking it as %s."
                    (sync-util/name-for-logging field) inferred-semantic-type)
        (assoc field
               :semantic_type inferred-semantic-type)))))
