(ns metabase.lib.card.util)

(def regular-card-propagated-keys
  "Keys from Card `:result-metadata` that should get merged into the calculated result metadata for a Card query if the
  Card in question is a regular Saved Question."
  (sorted-set
   :lib/card-id
   :display-name
   :fingerprint
   :semantic-type))

(def model-propagated-keys
  "Keys from Card `:result-metadata` that should get merged into the calculated result metadata for a Card query if the
  Card in question is Model (`:type = :model`)."
  (conj
   regular-card-propagated-keys
   :lib/model-display-name
   :lib/original-display-name
   :lib/original-expression-name
   :lib/original-fk-field-id
   :lib/original-fk-field-name
   :lib/original-fk-join-alias
   :lib/original-join-alias
   :base-type
   :converted-timezone
   :description
   :fk-target-field-id
   :id
   :lib/original-name
   :lib/type
   :settings
   :table-id
   :visibility-type))
