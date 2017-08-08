(ns metabase.sync.analyze.classifiers.no-preview-display
  "Classifier that decides whether a Field should be marked `:no_preview_display.`"
  (:require [metabase.sync.interface :as i]
            [schema.core :as s]))

(def ^:private ^:const ^Integer average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(s/defn ^:always-validate infer-no-preview-display :- (s/maybe i/FieldInstance)
  "Classifier that determines whether FIELD should be marked `:no_preview_display`.
   If FIELD is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (when (isa? (:base_type field) :type/Text)
    (when-let [average-length (get-in fingerprint [:type :type/Text :average-length])]
      (when (> average-length average-length-no-preview-threshold)
        (assoc field
          :no_preview_display true)))))
