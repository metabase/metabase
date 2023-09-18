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

(mr/def ::binning
  [:and
   [:map
    [:strategy  [:ref ::strategy]]
    [:bin-width {:optional true} pos?]
    [:num-bins  {:optional true} ::lib.schema.common/positive-int]]
   [:fn {:error/message "if :strategy is not :default, the matching key :bin-width or :num-bins must also be set"}
    #(when-let [strat (:strategy %)]
       (or (= strat :default)
           (contains? % strat)))]])

(mr/def ::binning-option
  [:map
   [:lib/type [:= :option/binning]]
   [:display-name :string]
   [:mbql [:maybe ::binning]]
   [:default {:optional true} :boolean]])
