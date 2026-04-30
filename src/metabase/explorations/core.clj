(ns metabase.explorations.core)

(def min-interestingness
  "Minimum `dimension_interestingness` score required for a dimension to be surfaced
   in the Explorations UI. Dimensions scoring below this are dropped; dimensions with
   a nil score (didn't score) are kept."
  0.1)
