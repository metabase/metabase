(ns metabase.actions.error)

(def violate-unique-constraint
  "Error type for SQL unique constraint violation."
  ::violate-unique-constraint)

(def violate-not-null-constraint
  "Error type for SQL not null constraint violation."
  ::violate-not-null-constraint)

(def violate-foreign-key-constraint
  "Error type for SQL foreign key constraint violation."
  ::violate-foreign-key-constraint)

(def incorrect-value-type
  "Error type for SQL incorrect value type."
  ::incorrect-value-type)
