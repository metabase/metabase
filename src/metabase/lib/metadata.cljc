(ns metabase.lib.metadata
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;;; Column vs Field?
;;;
;;; Lately I've been using `Field` to only mean a something that lives in the application database, i.e. something
;;; that is associated with row in the `Field` table and has an `:id`. I'm using `Column` as a more generic term that
;;; includes not only `Field`s but also the columns returned by a stage of a query, e.g. `SELECT count(*) AS count`
;;; returns a `Column` called `count`, but it's not a `Field` because it's not associated with an actual Field in the
;;; application database.
;;;
;;; Column = any column returned by a query or stage of a query
;;; Field  = a Column that is associated with a capital-F Field in the application database, i.e. has an `:id`
;;;
;;; All Fields are Columns, but not all Columns are Fields.
;;;
;;; Also worth a mention: we also have `Dimension`s, associated with the `dimension` table in the application
;;; database, which can act like psuedo-Fields or affect how we treat normal Fields. For example, Dimensions are used
;;; to implement column remapping, e.g. the GUI might display values of `categories.name` when it presents filter
;;; options for `venues.category_id` -- you can remap a meaningless integer FK column to something more helpful.
;;; 'Human readable values' like these can also be entered manually from the GUI, for example for enum columns. How
;;; will this affect what MLv2 needs to know or does? Not clear at this point, but we'll probably want to abstract
;;; away dealing with Dimensions in the future so the FE QB GUI doesn't need to special case them.

(def ColumnMetadata
  "Malli schema for a valid map of column metadata, which can mean one of two things:

  1. Metadata about a particular Field in the application database. This will always have an `:id`

  2. Results metadata from a column in `data.cols` and/or `data.results_metadata.columns` in a Query Processor
     response, or saved in something like `Card.result_metadata`. These *may* have an `:id`, or may not -- columns
     coming back from native queries or things like `SELECT count(*)` aren't associated with any particular `Field`
     and thus will not have an `:id`.

  Now maybe these should be two different schemas, but `:id` being there or not is the only real difference; besides
  that they are largely compatible. So they're the same for now. We can revisit this in the future if we actually want
  to differentiate between the two versions."
  [:map
   [:lib/type [:= :metadata/field]]
   [:id {:optional true} ::lib.schema.id/field]
   [:name ::lib.schema.common/non-blank-string]])

(def ^:private TableMetadata
  [:map
   [:lib/type [:= :metadata/table]]
   [:id ::lib.schema.id/table]
   [:name ::lib.schema.common/non-blank-string]
   [:schema {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; This is now optional! If the [[DatabaseMetadataProvider]] provides it, great, but if not we can always make the
   ;; subsequent request to fetch fields separately.
   [:fields {:optional true} [:sequential ColumnMetadata]]])

(def DatabaseMetadata
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; Like `:fields` for [[TableMetadata]], this is now optional -- we can fetch the Tables separately if needed.
   [:tables {:optional true} [:sequential TableMetadata]]])

(def DatabaseMetadataProvider
  "Schema for something that satisfies the [[lib.metadata.protocols/DatabaseMetadataProvider]] protocol."
  [:fn lib.metadata.protocols/database-metadata-provider?])

(defmulti ^:private ->database-metadata-provider*
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->database-metadata-provider* :default
  [x]
  x)

(defmethod ->database-metadata-provider* :mbql/query
  [query]
  (->database-metadata-provider* (:lib/metadata query)))

(mu/defn ^:private ->database-metadata-provider :- DatabaseMetadataProvider
  [x :- some?]
  (if (lib.metadata.protocols/database-metadata-provider? x)
    x
    (->database-metadata-provider* x)))

(mu/defn database :- DatabaseMetadata
  "Get metadata about the Database we're querying."
  [metadata-provider]
  (lib.metadata.protocols/database (->database-metadata-provider metadata-provider)))

(mu/defn tables :- [:sequential TableMetadata]
  "Get metadata about all Tables for the Database we're querying."
  [metadata-provider]
  (lib.metadata.protocols/tables (->database-metadata-provider metadata-provider)))

(mu/defn table :- TableMetadata
  "Find metadata for a specific Table, either by string `table-name`, and optionally `schema`, or by ID."
  ([metadata-provider
    table-id          :- ::lib.schema.id/table]
   (some (fn [table-metadata]
           (when (= (:id table-metadata) table-id)
             table-metadata))
         (tables metadata-provider)))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string]
   (some (fn [table-metadata]
           (when (and (or (nil? table-schema)
                          (= (:schema table-metadata) table-schema))
                      (= (:name table-metadata) table-name))
             table-metadata))
         (tables metadata-provider))))

(mu/defn fields :- [:sequential ColumnMetadata]
  "Get metadata about all the Fields belonging to a specific Table."
  ([metadata-provider
    table-id          :- ::lib.schema.id/table]
   (lib.metadata.protocols/fields (->database-metadata-provider metadata-provider) table-id))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string]
   (fields metadata-provider
           (:id (table metadata-provider table-schema table-name)))))

(mu/defn field :- ColumnMetadata
  "Get metadata about a specific Field in the Database we're querying."
  ([metadata-provider
    field-id          :- ::lib.schema.id/field]
   (some (fn [table-metadata]
           (some (fn [field-metadata]
                   (when (= (:id field-metadata) field-id)
                     field-metadata))
                 (fields metadata-provider (:id table-metadata))))
         (tables metadata-provider)))

  ;; TODO -- we need to figure out how to deal with nested fields... should field-name be a varargs thing?
  ([metadata-provider
    table-id          :- ::lib.schema.id/table
    field-name        :- ::lib.schema.common/non-blank-string]
   (some (fn [field-metadata]
           (when (= (:name field-metadata) field-name)
             field-metadata))
         (fields metadata-provider table-id)))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string
    field-name        :- ::lib.schema.common/non-blank-string]
   (let [table-metadata (table metadata-provider table-schema table-name)]
     (field metadata-provider (:id table-metadata) field-name))))

;;;; Stage metadata

(def StageMetadata
  "Metadata about the columns returned by a particular stage of a pMBQL query. For example a single-stage native query
  like

    {:database 1
     :type     :pipeline
     :stages   [{:lib/type :mbql.stage/mbql
                 :native   \"SELECT id, name FROM VENUES;\"}]}

  might have stage metadata like

    {:columns [{:name \"id\", :base-type :type/Integer}
               {:name \"name\", :base-type :type/Text}]}

  associated with the query's lone stage.

  At some point in the near future we will hopefully attach this metadata directly to each stage in a query, so a
  multi-stage query will have `:lib/stage-metadata` for each stage. The main goal is to facilitate things like
  returning lists of visible or filterable columns for a given stage of a query. This is TBD, see #28717 for a WIP
  implementation of this idea.

  This is the same format as the results metadata returned with QP results in `data.results_metadata`. The `:columns`
  portion of this (`data.results_metadata.columns`) is also saved as `Card.result_metadata` for Saved Questions.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential ColumnMetadata]]])

(mu/defn stage :- [:maybe StageMetadata]
  "Get metadata associated with a particular `stage-number` of the query, if any. `stage-number` can be a negative
  index.

  Currently, only returns metadata if it is explicitly attached to a stage; in the future we will probably dynamically
  calculate this stuff if possible based on DatabaseMetadata and previous stages. Stay tuned!"
  [query        :- :map
   stage-number :- :int]
  (:lib/stage-metadata (lib.util/query-stage query stage-number)))

(mu/defn stage-column :- [:maybe ColumnMetadata]
  "Metadata about a specific column returned by a specific stage of the query, e.g. perhaps the first stage of the
  query has an expression `num_cans`, then

    (lib.metadata/stage-column-metadata query stage \"num_cans\")

  should return something like

    {:name \"num_cans\", :base-type :type/Integer, ...}

  This is currently a best-effort thing and will only return information about columns if stage metadata is attached
  to a particular stage. In the near term future this should be better about calculating that metadata dynamically and
  returning correct info here."
  ([query       :- :map
    column-name :- ::lib.schema.common/non-blank-string]
   (stage-column query -1 column-name))

  ([query        :- :map
    stage-number :- :int
    column-name  :- ::lib.schema.common/non-blank-string]
   (some (fn [column]
           (when (= (:name column) column-name)
             column))
         (:columns (stage query stage-number)))))
