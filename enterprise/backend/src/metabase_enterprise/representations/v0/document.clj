(ns metabase-enterprise.representations.v0.document
  (:require
   [clojure.java.shell :as sh]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.pm :as v0-pm]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'document' for this schema"}
   :document])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this document schema"}
   :v0])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the document, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the document"}
   ::lib.schema.common/non-blank-string])

(mr/def ::content-type
  [:enum {:decode/json keyword
          :description "Format of the document content"}
   "application/json+vnd.prose-mirror"
   "text/markdown+vnd.prose-mirror"])

(mr/def ::content
  [:and
   {:description "The document content with optional embedded cards and links
                  Markdown format supports:
                  - {{card:card-ref}} for embedding cards
                  - [link text](card:card-ref) for linking to cards"}
   :any])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the document"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::document
  [:map
   {:description "v0 schema for human-writable document representation"}
   [:type ::type]
   [:version ::version]
   [:ref ::ref]
   [:name ::name]
   [:content_type ::content-type]
   [:content ::content]
   [:collection {:optional true} ::collection]])

(defmethod import/type->schema [:v0 :document] [_]
  ::document)

;;; ------------------------------------ Ingestion ------------------------------------

(defn- markdown->yaml [md]
  ;; bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/document-example.md
  (let [result (sh/sh "node" "hackathon/markdown-parser/parse-markdown.mjs" :in md)]
    (:out result)))

(comment
  (markdown->yaml "# hello"))

(defmethod import/yaml->toucan [:v0 :document]
  [{document-name :name
    :keys [_type _ref entity-id content content_type collection] :as representation}
   ref-index]
  (let [yaml-content (if (= "text/markdown+vnd.prose-mirror" content_type)
                       (yaml/parse-string (markdown->yaml content))
                       content_type)
        yaml-content (v0-pm/replace-refs yaml-content ref-index)]
    {:entity_id (or entity-id
                    (v0-common/generate-entity-id representation))
     :creator_id (or api/*current-user-id*
                     config/internal-mb-user-id)
     :name document-name
     :document yaml-content
     :content_type "application/json+vnd.prose-mirror"
     :collection_id (v0-common/find-collection-id collection)}))

(defmethod import/persist! [:v0 :document]
  [representation ref-index]
  (let [document-data (import/yaml->toucan representation ref-index)
        entity-id (:entity_id document-data)
        existing (when entity-id
                   (t2/select-one :model/Document :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing document" (:name document-data) "with ref" (:ref representation))
        (t2/update! :model/Document (:id existing) (dissoc document-data :entity_id))
        (t2/select-one :model/Document :id (:id existing)))
      (do
        (log/info "Creating new document" (:name document-data))
        (first (t2/insert-returning-instances! :model/Document document-data))))))

;;; ------------------------------------ Export ------------------------------------

(defmethod export/export-entity :model/Document [document]
  (let [document-ref (v0-common/unref (v0-common/->ref (:id document) :document))]
    (cond-> {:name (:name document)
             :type :document
             :version :v0
             :ref document-ref
             :entity-id (:entity_id document)
             :content (:document document)
             :content_type (:content_type document)}
      :always
      u/remove-nils)))

(comment
  (def d (t2/select-one :model/Document 1))

  (def dd (export/export-entity d))

  (import/normalize-representation dd))
