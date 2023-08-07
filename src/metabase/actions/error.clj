(ns metabase.actions.error)

(def violate-unique-constraint
  "Error type for unique constraint violation."
  ::violate-unique-constraint)

(def violate-not-null-constraint
  "Error type for violate not null constraint."
  ::violate-not-null-constraint)

(def violate-foreign-key-constraint
  "Error type for foreign key constraint violation."
  ::violate-unique-constraint)

(def incorrect-type
  "Error type for incorrect type."
  ::violate-unique-constraint)

(def all-errors
  "All error types."
  [violate-unique-constraint
   violate-not-null-constraint
   violate-foreign-key-constraint
   incorrect-type])
