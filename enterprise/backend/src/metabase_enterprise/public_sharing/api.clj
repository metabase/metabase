(ns metabase-enterprise.public-sharing.api
  "`/api/ee/public/*` routes for Enterprise Edition entities (Documents, etc.).

  These routes handle public sharing of EE-only features. They require premium features but do not require
  authentication, allowing public access to shared documents."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.public-sharing.api :as public-sharing.api]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Public Documents -------------------------------------------------

;; Import qp.constraints dynamically to avoid module dependency issues
(def ^:private default-query-constraints
  (delay @(requiring-resolve 'metabase.query-processor.middleware.constraints/default-query-constraints)))

(defn- remove-card-non-public-columns
  "Remove everything from public `card` that shouldn't be visible to the general public.
  Delegates to the OSS implementation."
  [card]
  (#'public-sharing.api/remove-card-non-public-columns card))

(defn- remove-document-non-public-columns
  "Strip out internal fields that shouldn't be exposed publicly.

  Removes sensitive fields like collection_id, creator_id, permissions info, public_uuid, and made_public_by_id.
  Only keeps fields safe for public consumption: id, name, document content, timestamps, and hydrated cards."
  [document]
  (select-keys document [:id :name :document :created_at :updated_at :cards]))

(defn- public-document
  "Fetch a public Document and strip out sensitive fields. We also hydrate the Cards embedded in the document so the
  frontend doesn't need to make separate requests for each card — just like public Dashboards do."
  [& conditions]
  (let [document (api/check-404 (apply t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                                       :archived false, conditions))
        ;; Hydrate the cards associated with this document via the document_id FK
        ;; so the frontend has all the metadata it needs upfront
        hydrated-cards (let [cards (t2/select :model/Card :document_id (:id document) :archived false)]
                         (zipmap (map :id cards)
                                 (map remove-card-non-public-columns cards)))]
    (-> document
        (assoc :cards hydrated-cards)
        (dissoc :content_type)
        remove-document-non-public-columns)))

(defn- validate-card-in-public-document
  "Validates that a card exists and is embedded in the public document.
  Throws a 404 if the card doesn't exist, is archived, or isn't in the document."
  [uuid card-id]
  (let [document-id (api/check-404 (t2/select-one-pk :model/Document :public_uuid uuid :archived false))]
    (api/check-404 (t2/select-one-pk :model/Card :id card-id :document_id document-id :archived false))))

(api.macros/defendpoint :get "/document/:uuid"
  "Fetch a publicly-accessible Document. Does not require auth credentials. Public sharing must be enabled.

  Returns a Document with sensitive fields removed (excludes collection_id, permissions, creator details, etc.).
  Includes all embedded Cards with their metadata hydrated so the frontend doesn't need to make separate
  requests for each card — just like public Dashboards do."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (premium-features/assert-has-feature :documents (tru "Documents"))
  (public-sharing.validation/check-public-sharing-enabled)
  (let [document (public-document :public_uuid uuid)]
    (events/publish-event! :event/document-read {:object-id (:id document), :user-id api/*current-user-id*})
    document))

(api.macros/defendpoint :get "/document/:uuid/card/:card-id"
  "Run a query for a Card that's embedded in a public Document. Doesn't require auth credentials. Public sharing must
  be enabled."
  [{:keys [uuid card-id]} :- [:map
                              [:uuid    ms/UUIDString]
                              [:card-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (premium-features/assert-has-feature :documents (tru "Documents"))
  (public-sharing.validation/check-public-sharing-enabled)
  (validate-card-in-public-document uuid card-id)
  ;; Run the query as admin since public documents are available to everyone anyway
  (u/prog1 (public-sharing.api/process-query-for-card-with-id
            card-id
            :api
            (json/decode+kw parameters)
            :constraints (@default-query-constraints))
    (events/publish-event! :event/card-read {:object-id card-id :user-id api/*current-user-id* :context :question})))

(api.macros/defendpoint :post "/document/:uuid/card/:card-id/:export-format"
  "Fetch a Card embedded in a public Document and return query results in the specified format.
  Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid card-id export-format]} :- [:map
                                            [:uuid          ms/UUIDString]
                                            [:card-id       ms/PositiveInt]
                                            [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys [parameters format_rows pivot_results]} :- [:map
                                                      [:parameters    {:optional true} [:maybe [:or
                                                                                                [:sequential ms/Map]
                                                                                                ms/JSONString]]]
                                                      [:format_rows   {:default false} ms/BooleanValue]
                                                      [:pivot_results {:default false} ms/BooleanValue]]]
  (premium-features/assert-has-feature :documents (tru "Documents"))
  (public-sharing.validation/check-public-sharing-enabled)
  (validate-card-in-public-document uuid card-id)
  (public-sharing.api/process-query-for-card-with-id
   card-id
   export-format
   (cond-> parameters
     (string? parameters) json/decode+kw)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          format_rows
                :pivot?                pivot_results}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/public/*` routes for Enterprise Edition entities."
  (api.macros/ns-handler *ns*))
