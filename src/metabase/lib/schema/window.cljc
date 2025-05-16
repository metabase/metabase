(ns metabase.lib.schema.window
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mbql-clause/define-mbql-clause :window-min
  [:tuple
   [:= :window-min]
   :any
   :any])

(mbql-clause/define-mbql-clause :window-max
  [:tuple
   [:= :window-max]
   :any
   :any])

(doseq [tag [:window-min
             :window-max]]
  (lib.hierarchy/derive tag ::window-clause-tag))

(defn window-clause?
  [clause]
  (and (vector? clause)
       (lib.hierarchy/isa? (first clause) ::window-clause-tag)))

(mr/def ::window
  [:and
   [:ref :metabase.lib.schema.mbql-clause/clause]
   [:fn
    {:error/message "Valid aggregation clause"}
    window-clause?]])

(mr/def ::windows
  [:sequential {:min 1} [:ref ::window]])