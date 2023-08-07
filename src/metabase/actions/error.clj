(ns metabase.actions.error)

(def violate-unique-constraint
  "Error type for SQL unique constraint violation."
  ::violate-unique-constraint)

(def violate-not-null-constraint
  "Error type for SQL kviolate not null constraint."
  ::violate-not-null-constraint)

(def violate-foreign-key-constraint
  "Error type for SQL foreign key constraint violation."
  ::violate-unique-constraint)

(def incorrect-value-type
  "Error type for SQL incorrect type."
  ::incorrect-value-type)

(def incorrect-affected-rows
  "Error type for when the affcected rows is not what we expect."
  ::incorrect-affected-rows)

(def all-errors
  "All error types."
  [violate-unique-constraint
   violate-not-null-constraint
   violate-foreign-key-constraint
   incorrect-value-type])
