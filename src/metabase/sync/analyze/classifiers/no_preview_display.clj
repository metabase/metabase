(ns metabase.sync.analyze.classifiers.no-preview-display
  "Classifier that decides whether a Field should be marked 'No Preview Display'.
   (This means Fields are generally not shown in Table results and the like, but
   still shown in a single-row object detail page.)"
  (:require
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]))

(def ^:private ^:const ^Long average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(defn- long-plain-text-field?
  [{base-type :base_type, semantic-type :semantic_type} fingerprint]
  (and (isa? base-type :type/Text)
       (contains? #{nil :type/SerializedJSON} semantic-type)
       (some-> fingerprint
               (get-in [:type :type/Text :average-length])
               (> average-length-no-preview-threshold))))

(mu/defn infer-no-preview-display :- [:maybe i/FieldInstance]
  "Classifier that determines whether `field` should be marked 'No Preview Display'. If `field` is textual and its
  average length is too great, mark it so it isn't displayed in the UI."
  [field       :- i/FieldInstance
   fingerprint :- [:maybe i/Fingerprint]]
  (when (long-plain-text-field? field fingerprint)
    (assoc field :preview_display false)))
