(ns metabase.documents.api.document
  "`/api/document/` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.documents.db :as documents.db]
   [metabase.documents.models.document :as m.document]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.documents.schema :as documents.schema]
   [metabase.documents.write :as write]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- cards-to-create-schema
  "Request schema for the `cards` map: placeholder id -> new card.

  Plain `:map-of` can't be the request schema directly — request decoding silently strips entries that don't match,
  so an unusable card would vanish and the document would save without it. Decoding each key and value explicitly
  turns a bad card into a 400 instead."
  [key-schema]
  [:schema
   {:decode/normalize (fn [cards]
                        (cond-> cards
                          (map? cards)
                          (-> (update-keys #(api.macros/decode-and-validate-params
                                             :body key-schema (cond-> % (keyword? %) u/qualified-name)))
                              (update-vals #(api.macros/decode-and-validate-params
                                             :body write/CardCreateSchema %)))))}
   [:map-of key-schema write/CardCreateSchema]])

(def ^:private DocumentCreateOptions
  [:map {:closed true}
   [:name documents.schema/DocumentName]
   [:document ::prose-mirror/ast]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:cards {:optional true} [:maybe (cards-to-create-schema [:int {:max -1}])]]])

(def ^:private DocumentUpdateOptions
  [:map {:closed true}
   [:name {:optional true} documents.schema/DocumentName]
   [:document {:optional true} [:maybe ::prose-mirror/ast]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:cards {:optional true} [:maybe (cards-to-create-schema :int)]]
   [:archived {:optional true} [:maybe :boolean]]])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Gets existing `Documents`."
  [_route-params
   _query-params]
  ;; Documents attached to an exploration are internal to that exploration — every other listing surface (search,
  ;; recents, collection items) excludes them too.
  {:items (as-> (documents.db/visible-unarchived-documents) docs
            (mi/readable docs)
            (t2/hydrate docs :creator :can_write :is_remote_synced))})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `Document`."
  [_route-params
   _query-params
   {:keys [collection_id] :as body} :- DocumentCreateOptions]
  (api/create-check :model/Document {:collection_id collection_id})
  (write/create-document! body))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:document-id"
  "Returns an existing Document by ID."
  [{:keys [document-id]} :- [:map {:closed true} [:document-id ms/PositiveInt]]]
  ;; `m.document/get-document` already does the 404 and read check internally.
  (m.document/get-document document-id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:document-id"
  "Updates an existing `Document`."
  [{:keys [document-id]} :- [:map {:closed true}
                             [:document-id ms/PositiveInt]]
   _query-params
   body :- DocumentUpdateOptions]
  ;; Use a lightweight fetch for the guard: we only need the raw row for the archived, permission, and collection-move
  ;; checks below. Calling `m.document/get-document` here would hydrate unused display fields and record a view.
  (let [existing-document (api/check-404 (documents.db/document document-id))]
    (when-not (contains? body :archived)
      (api/check-not-archived existing-document))
    (api/update-check existing-document (select-keys body [:collection_id :archived]))
    (write/update-document! existing-document body)))

(api.macros/defendpoint :delete "/:document-id" :- ::api/generic-204-no-content
  "Permanently deletes an archived Document."
  [{:keys [document-id]} :- [:map {:closed true} [:document-id ms/PositiveInt]]]
  (let [document (api/check-404 (documents.db/document document-id))]
    (api/write-check document)
    (write/delete-document! document)
    api/generic-204-no-content))

(api.macros/defendpoint :post "/:from-document-id/copy" :- [:map [:id ::documents.schema/document.id]]
  "Copy a Document."
  [{:keys [from-document-id]} :- [:map {:closed true}
                                  [:from-document-id ms/PositiveInt]]
   _query-params
   {:keys [name collection_id collection_position]} :- [:map {:closed true}
                                                        [:name                {:optional true} [:maybe documents.schema/DocumentName]]
                                                        [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                                        [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  (write/copy-document! from-document-id {:name                name
                                          :collection_id       collection_id
                                          :collection_position collection_position}))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api.macros/defendpoint :post "/:document-id/public-link" :- [:map [:uuid ms/UUIDString]]
  "Generate a publicly-accessible UUID for a Document.

  Creates a public link that allows viewing the Document without authentication. If the Document already has
  a public UUID, returns the existing one rather than generating a new one. This enables sharing the Document
  via `GET /api/ee/public/document/:uuid`.

  Returns a map containing `:uuid` (the public UUID string).

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting."
  [{:keys [document-id]} :- [:map {:closed true}
                             [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Document :id document-id, :archived false)
  {:uuid (write/create-public-link! document-id api/*current-user-id*)})

(api.macros/defendpoint :delete "/:document-id/public-link" :- ::api/generic-204-no-content
  "Remove the public link for a Document.

  Deletes the public UUID from the Document, making it no longer accessible via the public sharing endpoint.
  This revokes public access to the Document - the existing public link will no longer work.

  Returns a 204 No Content response on success.

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting.
  Throws a 404 if the Document doesn't exist, is archived, or doesn't have a public link."
  [{:keys [document-id]} :- [:map {:closed true}
                             [:document-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Document :id document-id, :public_uuid [:not= nil], :archived false)
  (write/delete-public-link! document-id)
  api/generic-204-no-content)

(api.macros/defendpoint :get "/public" :- [:sequential [:map
                                                        [:name :string]
                                                        [:id ms/PositiveInt]
                                                        [:public_uuid ms/UUIDString]]]
  "List all Documents that have public links.

  Returns a sequence of Documents that have been publicly shared. Each Document includes its `:id`, `:name`,
  and `:public_uuid`. Documents are only actually accessible via the public endpoint if public sharing is
  currently enabled. Archived Documents are excluded from the results.

  This endpoint is used to populate the public links listing in the Admin settings UI.

  Requires superuser permissions. Public sharing must be enabled via the `enable-public-sharing` setting."
  []
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (documents.db/public-documents))

;;; ------------------------------------------------ Card Downloads --------------------------------------------------

(defn- validate-card-in-document
  "Validates that the document and card exist, are not archived, and that the card belongs to the document.
   Also checks that the current user has read access to the document.

   Throws a 404 exception via `api/check-404` if any validation fails. Returns card-id on success."
  [document-id card-id]
  (let [document (api/check-404 (documents.db/unarchived-document document-id))]
    (api/read-check document)
    (api/check-404 (and (contains? (set (prose-mirror/card-ids document)) card-id)
                        (documents.db/unarchived-card-in-document-exists? card-id document-id)))))

(api.macros/defendpoint :post "/:document-id/card/:card-id/query/:export-format"
  :- ::qp.streaming/export-response
  "Download query results for a Card embedded in a Document.

  Returns query results in the requested format. The user must have read access to the document
  to download results. If the card's query fails, standard query error responses are returned.

  Route parameters:
  - document-id: ID of the document containing the card
  - card-id: ID of the card to download results from
  - export-format: Output format (csv, xlsx, json)

  Body parameters (snake_case):
  - parameters: Optional query parameters (array of maps or JSON string)
  - format_rows: Whether to apply formatting to results (boolean, default false)
  - pivot_results: Whether to pivot results (boolean, default false)"
  [{:keys [document-id card-id export-format]} :- [:map {:closed true}
                                                   [:document-id   ms/PositiveInt]
                                                   [:card-id       ms/PositiveInt]
                                                   [:export-format :keyword]]
   _query-params
   {:keys          [parameters]
    pivot-results? :pivot_results
    format-rows?   :format_rows
    :as            _body}
   :- [:map {:closed true}
       [:parameters    {:optional true} [:maybe ::parameters.schema/api.parameter-values]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]]]
  (validate-card-in-document document-id card-id)
  (qp.card/process-query-for-card
   (api/check-404 (documents.db/card card-id)) export-format
   :parameters  parameters
   :constraints nil
   :context     (api.dataset/export-format->context export-format)
   :middleware  {:process-viz-settings?  true
                 :skip-results-metadata? true
                 :ignore-cached-results? true
                 :format-rows?           format-rows?
                 :pivot?                 pivot-results?
                 :js-int-to-string?      false}))

(defn- +content-gate-cache
  [handler]
  (fn [request respond raise]
    (m.document/with-content-gate-cache
      (handler request respond raise))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (api.macros/ns-handler *ns* +auth +content-gate-cache))
