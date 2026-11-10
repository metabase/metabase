(ns metabase.serialization.parameters
  "Export and import of the `:parameters` and `:parameter_mappings` of Cards, Dashboards and DashboardCards, in bulk."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.serialization.mbql :as mbql]
   [metabase.serialization.resolve :as resolve]))

(set! *warn-on-reflection* true)

(defn walk-export-parameter-mappings
  "The :parameter_mappings field of a `Card` or `DashboardCard`, as a vector of maps, with its ids replaced by what
  `visit` returns for their references, in their stored order; nil for none."
  [visit mappings]
  (some->> mappings (mapv #(mbql/walk-export visit %))))

(defn walk-import-parameter-mappings
  "The exported :parameter_mappings field with its references replaced by what `visit` returns for them, normalized
  like the stored column; nil for none."
  [visit mappings]
  (some->> mappings
           (mapv #(cond-> (-> (mbql/walk-import visit %)
                              (m/update-existing :card_id (fn [eid] (resolve/visit-some :model/Card eid visit))))
                    (not (resolve/collecting? visit)) (->> (lib/normalize ::parameters.schema/parameter-mapping))))))

(defn- walk-export-parameter
  "A single parameter with its ids replaced by what `visit` returns for their references. A values source pointing at
  a Card that no longer exists has no entity id, so the source is dropped and the parameter falls back to its
  connected fields — the same shape the app produces when the source Card is archived."
  [visit parameter]
  (if (get-in parameter [:values_source_config :card_id])
    (or (resolve/found-or-nil #(mbql/walk-export visit parameter))
        (mbql/walk-export visit (dissoc parameter :values_source_type :values_source_config)))
    (mbql/walk-export visit parameter)))

(defn walk-export-parameters
  "The :parameters field of a `Card` or `Dashboard` with its ids replaced by what `visit` returns for their
  references, in their stored order; nil for none."
  [visit parameters]
  (some->> parameters (mapv #(walk-export-parameter visit %))))

(defn walk-import-parameters
  "The exported :parameters field with its references replaced by what `visit` returns for them, normalized like the
  stored column, in the order of the `:position`s that older exports give every parameter, without them; nil for none."
  [visit parameters]
  (when parameters
    (let [params (mapv #(cond-> (-> (mbql/walk-import visit %)
                                    (m/update-existing-in [:values_source_config :card_id]
                                                          (fn [eid] (resolve/visit-some :model/Card eid visit))))
                          (not (resolve/collecting? visit)) (->> (lib/normalize ::parameters.schema/parameter)))
                       parameters)]
      (mapv #(dissoc % :position)
            (cond->> params
              (every? :position params) (sort-by :position))))))

(defn export-parameter-mappings
  "Each of the `:parameter_mappings` lists of `xs` exported by [[walk-export-parameter-mappings]], with the database
  ids of all of them resolved in `store` at once."
  [store xs]
  (resolve/export-in-bulk store xs walk-export-parameter-mappings))

(defn import-parameter-mappings
  "Each of the exported `:parameter_mappings` lists of `xs` imported by [[walk-import-parameter-mappings]], with the
  references of all of them resolved in `store` at once."
  [store xs opts]
  (resolve/import-in-bulk store xs opts walk-import-parameter-mappings))

(defn export-parameters
  "Each of the `:parameters` lists of `xs` exported by [[walk-export-parameters]], with the database ids of all of them
  resolved in `store` at once."
  [store xs]
  (resolve/export-in-bulk store xs walk-export-parameters))

(defn import-parameters
  "Each of the exported `:parameters` lists of `xs` imported by [[walk-import-parameters]], with the references of all
  of them resolved in `store` at once."
  [store xs opts]
  (resolve/import-in-bulk store xs opts walk-import-parameters))

(def parameter-mappings-transform
  "A spec transform of `:parameter_mappings` lists, by [[export-parameter-mappings]] and [[import-parameter-mappings]]."
  {:export (fn [store _ xs _] (export-parameter-mappings store xs))
   :import (fn [store _ xs opts] (import-parameter-mappings store xs opts))})

(def parameters-transform
  "A spec transform of `:parameters` lists, by [[export-parameters]] and [[import-parameters]]."
  {:export (fn [store _ xs _] (export-parameters store xs))
   :import (fn [store _ xs opts] (import-parameters store xs opts))})
