(ns metabase-enterprise.library-branching.format.old.table-item
  "The old format of the kinds that live on a published table: a file of the serdes model Segment or Measure. The file
  has no table: Metabase derives it from the definition, so the place is the source table of the definition."
  (:require
   [metabase-enterprise.library-branching.format.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(defn- decode-as
  "`{:doc d}` of document `doc` as an item of `kind` with the attributes `attribute-keys`, or `{:skip :archived :id
  id}` for an item in the trash."
  [kind attribute-keys doc]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc kind id (merge (select-keys doc attribute-keys)
                                            {:name  (:name doc)
                                             :table (table-item/source-table (:definition doc))}))})))

(defn decode-segment
  "`{:doc d}` of segment document `doc`, or `{:skip :archived :id id}` for a segment in the trash."
  [doc _opts]
  (decode-as :segment [:description :points_of_interest :caveats :show_in_getting_started :definition] doc))

(defn decode-measure
  "`{:doc d}` of measure document `doc`, or `{:skip :archived :id id}` for a measure in the trash."
  [doc _opts]
  (decode-as :measure [:description :definition] doc))
