(ns metabase.lib.schema.custom-column-window
  (:require
   [metabase.lib.expression :as expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.mbql-clause :as mbql-clause]))

(lib.hierarchy/derive :cc-window ::expression/expression)

(def cc-windows-definitions
  [{:tag :window-min
    :args-schema :any}
   {:tag :window-max
    :args-schema :any}
   {:tag :window-sum
    :args-schema :any}])

(doseq [{:keys [tag]} cc-windows-definitions]
  (lib.hierarchy/derive tag :cc-window))

(doseq [{:keys [tag]} cc-windows-definitions]
  (lib.hierarchy/derive tag :lib.type-of/type-is-type-of-arithmetic-args))

#_(doseq [{:keys [tag args-schema]} cc-windows-definitions]
  (mbql-clause/define-mbql-clause tag
    [:and
     {:error/message (format "valid %s clause" tag)}
     [:cat
      [:= {:decode/normalize common/normalize-keyword} tag]
      [:schema [:ref ::common/options]]
      args-schema]]))

(mbql-clause/define-mbql-clause :window-min
  [:and
   {:error/message (str "valid" :window-min "clause")}
   [:cat
    [:= {:decode/normalize common/normalize-keyword} :window-min]
    [:schema [:ref ::common/options]]
    :any]])