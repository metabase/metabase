(ns metabase-enterprise.public-sharing.api
  "`/api/ee/public/*` routes for Enterprise Edition entities (Documents, etc.).

  These routes handle public sharing of EE-only features. They require premium features but do not require
  authentication, allowing public access to shared documents."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.public-sharing-rest.api :as public-sharing.api]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Public Documents -------------------------------------------------

(defn- remove-document-non-public-columns
  "Remove sensitive fields from a document before exposing it publicly.

  We filter out collection_id, creator_id, public_uuid, and other sensitive fields to prevent unauthenticated users
  from discovering internal organizational structure, permissions boundaries, or who created the document. Only the
  document content itself, basic metadata, and embedded cards are safe to expose publicly."
  [document]
  (select-keys document [:id :name :document :created_at :updated_at :cards]))

(defn- public-document
  "Fetch a public document with all embedded cards hydrated upfront.

  We hydrate cards eagerly (rather than requiring separate requests per card) to avoid N+1 queries and provide a
  consistent experience with public dashboards. This also allows us to filter sensitive fields from all cards at
  once before exposing them to unauthenticated users. The document and all cards must not be archived to be
  accessible publicly."
  [& conditions]
  (let [document (-> (api/check-404 (apply t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                                           :archived false, conditions))
                     ;; Hydrate cards via Toucan batched hydration to avoid N+1 queries
                     (t2/hydrate :cards))]
    (-> document
        ;; Filter sensitive fields from all cards before exposing publicly
        (update :cards #(update-vals % public-sharing.api/remove-card-non-public-columns))
        (dissoc :content_type)
        remove-document-non-public-columns)))

(defn- validate-card-in-public-document
  "Ensure a card is actually embedded in the specified public document before running queries.

  We validate the document-card association to prevent users from querying arbitrary cards by guessing IDs. Only
  cards explicitly embedded in the public document (via document_id FK) are accessible through public document
  endpoints. This prevents bypassing collection permissions by accessing cards through public document routes."
  [uuid card-id]
  (let [document-id (api/check-404 (t2/select-one-pk :model/Document :public_uuid uuid :archived false))]
    (api/check-404 (t2/select-one-pk :model/Card :id card-id :document_id document-id :archived false))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
            :constraints (qp.constraints/default-query-constraints))
    (events/publish-event! :event/card-read {:object-id card-id :user-id api/*current-user-id* :context :question})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
