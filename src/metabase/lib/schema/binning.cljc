(ns metabase.lib.schema.binning
  "Malli schema for binning of a column's values.

  There are two approaches to binning, selected by `:strategy`:
  - `{:strategy :bin-width :bin-width 10}` makes 1 or more bins that are 10 wide;
  - `{:strategy :num-bins  :num-bins  12}` splits the column into 12 bins."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::strategy
  [:enum :bin-width :default :num-bins])

(mr/def ::num-bins
  ::lib.schema.common/positive-int)

(mr/def ::bin-width
  ::lib.schema.common/positive-number)

(mr/def ::binning
  [:merge
   [:map
    [:strategy [:ref ::strategy]]]
   [:multi {:dispatch :strategy
            :error/fn (fn [{:keys [value]} _]
                        (str "Invalid binning strategy" (pr-str value)))}
    [:default   :map]
    [:bin-width [:map
                 [:bin-width [:ref ::bin-width]]]]
    [:num-bins  [:map
                 [:num-bins [:ref ::num-bins]]]]]])

(mr/def ::binning-option
  [:map
   [:lib/type [:= :option/binning]]
   [:display-name :string]
   [:mbql [:maybe ::binning]]
   [:default {:optional true} :boolean]])
