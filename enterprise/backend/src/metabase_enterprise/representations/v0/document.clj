(ns metabase-enterprise.representations.v0.document
  (:require
   [cheshire.core :as cheshire]
   [clojure.java.shell :as sh]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.json :as json]
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
   :markdown :html :text])

(mr/def ::content
  [:and
   {:description "The document content with optional embedded cards and links
                  Markdown format supports:
                  - {{card:card-ref}} for embedding cards
                  - [link text](card:card-ref) for linking to cards"}
   :string])

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

(defn- markdown->yaml [md]
  ;; bb hackathon/markdown-parser/cli-test.clj hackathon/markdown-parser/test-files/document-example.md
  (let [result (sh/sh "node" "hackathon/markdown-parser/parse-markdown.mjs" :in md)]
    (:out result)))

(defmethod import/yaml->toucan [:v0 :document]
  [{document-name :name
    :keys [content content_type]}
   ref-index]
  (let [yaml-content (if (= "text/markdown+vnd.prose-mirror" content_type)
                       (yaml/parse-string (markdown->yaml content))
                       content)
        yaml-content (v0-common/replace-refs-everywhere yaml-content ref-index)]
    {:name document-name
     :document (json/encode yaml-content)
     :content_type "application/json+vnd.prose-mirror"}))

(defmethod import/persist! [:v0 :document]
  [representation ref-index]
  (let [document-data (->> (import/yaml->toucan representation ref-index)
                           (rep-t2/with-toucan-defaults :model/Document))
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

(defn- patch-refs-for-export
  [yaml]
  (walk/postwalk
   (fn [node]
     (if-not (and (map? node)
                  (= "cardEmbed" (:type node)))
       node
       (update-in node [:attrs :id] v0-mbql/id->card-ref)))
   yaml))

(defn- edn->markdown
  [edn]
  (let [result (->> (patch-refs-for-export edn)
                    (cheshire/generate-string)
                    (sh/sh "node" "hackathon/markdown-parser/serialize-prosemirror.mjs" :in))]
    (:out result)))

(defmethod export/export-entity :model/Document [document]
  (let [document-ref (v0-common/unref (v0-common/->ref (:id document) :document))]
    (cond-> {:name (:name document)
             :type :document
             :version :v0
             :ref document-ref
             :entity-id (:entity_id document)
             :content (edn->markdown (:document document))
             :content_type "text/markdown+vnd.prose-mirror" #_(:content_type document)}
      :always
      u/remove-nils)))
