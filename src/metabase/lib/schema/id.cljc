(ns metabase.lib.schema.id
  (:require
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
  "Valid Database ID"
  pos-int?)

(def saved-questions-virtual-database-id
  "The ID used to signify that a database is 'virtual' rather than physical.

   A fake integer ID is used so as to minimize the number of changes that need to be made on the frontend -- by using
   something that would otherwise be a legal ID, *nothing* need change there, and the frontend can query against this
   'database' none the wiser. (This integer ID is negative which means it will never conflict with a *real* database
   ID.)

   This ID acts as a sort of flag. The relevant places in the middleware can check whether the DB we're querying is
   this 'virtual' database and take the appropriate actions."
  -1337)

;;; not sure under what circumstances we actually want to allow this, this is an icky hack. How are we supposed to
;;; resolve stuff with a fake Database ID? I guess as far as the schema is concerned we can allow this tho.
;;;
;;; EDIT: Sometimes the FE uses this when starting a query based on a Card if it doesn't know the database associated
;;; with that Card. The QP will resolve this to the correct Database later.
(mr/def ::saved-questions-virtual-database
  [:=
   {:description (:doc (meta #'saved-questions-virtual-database-id))}
   saved-questions-virtual-database-id])

(mr/def ::table
  "Valid Table ID"
  pos-int?)

(mr/def ::field
  "Valid Field ID"
  [:schema
   {:decode/api (fn [id]
                  (cond-> id (string? id) parse-long))}
   pos-int?])

(mr/def ::card
  "Valid Card ID"
  pos-int?)

(mr/def ::segment
  "Valid legacy Segment ID"
  pos-int?)

(mr/def ::measure
  "Valid Measure ID"
  pos-int?)

(mr/def ::metric
  "Valid Metric ID (metrics are Cards with type :metric)"
  pos-int?)

(mr/def ::snippet
  "Valid Snippet ID"
  pos-int?)

(mr/def ::dimension
  "Valid Dimension ID"
  pos-int?)

(mr/def ::action
  "Valid Action ID"
  pos-int?)

(mr/def ::dashboard
  "Valid Dashboard ID"
  pos-int?)

(mr/def ::dashcard
  "Valid DashboardCard ID"
  pos-int?)

(mr/def ::user
  "Valid User ID"
  pos-int?)

(mr/def ::pulse
  "Valid Pulse ID"
  pos-int?)

(mr/def ::native-query-snippet
  "Valid Native Query Snippet ID"
  pos-int?)

(mr/def ::transform
  "Valid Transform ID"
  pos-int?)

(mr/def ::collection
  "Valid Collection ID"
  pos-int?)

(mr/def ::document
  "Valid Document ID"
  pos-int?)

(mr/def ::dashboard-tab
  "Valid DashboardTab ID"
  pos-int?)

(mr/def ::transform-tag
  "Valid TransformTag ID"
  pos-int?)

(mr/def ::sandbox
  "Valid Sandbox ID"
  pos-int?)

(mr/def ::external-database
  "A Database as serialization references it, by name."
  :string)

(mr/def ::external-table
  "A Table as serialization references it, as `[db-name schema table-name]` with a nil schema for a schemaless Table."
  [:cat ::external-database [:maybe :string] :string])

(mr/def ::external-field
  "A Field as serialization references it, as `[db-name schema table-name & field-names]`, one name per nesting
  level."
  [:cat ::external-database [:maybe :string] :string [:+ :string]])

(mr/def ::external-card
  "A Card as serialization references it, by entity id."
  :string)

(mr/def ::external-segment
  "A Segment as serialization references it, by entity id."
  :string)

(mr/def ::external-measure
  "A Measure as serialization references it, by entity id."
  :string)

(mr/def ::external-metric
  "A Metric as serialization references it, by the entity id of its Card."
  :string)

(mr/def ::external-snippet
  "A Snippet as serialization references it, by entity id."
  :string)

(mr/def ::external-dimension
  "A Dimension as serialization references it, by entity id."
  :string)

(mr/def ::external-action
  "An Action as serialization references it, by entity id."
  :string)

(mr/def ::external-dashboard
  "A Dashboard as serialization references it, by entity id."
  :string)

(mr/def ::external-dashcard
  "A DashboardCard as serialization references it, as `[dashboard-entity-id dashcard-entity-id]`."
  [:tuple ::external-dashboard :string])

(mr/def ::external-user
  "A User as serialization references it, by email."
  :string)

(mr/def ::external-pulse
  "A Pulse as serialization references it, by entity id."
  :string)

(mr/def ::external-native-query-snippet
  "A Native Query Snippet as serialization references it, by entity id."
  :string)

(mr/def ::external-transform
  "A Transform as serialization references it, by entity id."
  :string)

(mr/def ::external-collection
  "A Collection as serialization references it, by entity id."
  :string)

(mr/def ::external-document
  "A Document as serialization references it, by entity id."
  :string)

(mr/def ::external-dashboard-tab
  "A DashboardTab as serialization references it, as `[dashboard-entity-id tab-entity-id]`."
  [:tuple ::external-dashboard :string])

(mr/def ::external-transform-tag
  "A TransformTag as serialization references it, by entity id."
  :string)

(mr/def ::external-sandbox
  "A Sandbox as serialization references it, by entity id."
  :string)

(def external-registry
  "A local registry that swaps every id schema for its external one, so `[:schema {:registry external-registry} s]`
  describes `s` as serialization writes it."
  {::database             ::external-database
   ::table                ::external-table
   ::field                ::external-field
   ::card                 ::external-card
   ::segment              ::external-segment
   ::measure              ::external-measure
   ::metric               ::external-metric
   ::snippet              ::external-snippet
   ::dimension            ::external-dimension
   ::action               ::external-action
   ::dashboard            ::external-dashboard
   ::dashcard             ::external-dashcard
   ::user                 ::external-user
   ::pulse                ::external-pulse
   ::native-query-snippet ::external-native-query-snippet
   ::transform            ::external-transform
   ::collection           ::external-collection
   ::document             ::external-document
   ::dashboard-tab        ::external-dashboard-tab
   ::transform-tag        ::external-transform-tag
   ::sandbox              ::external-sandbox})
