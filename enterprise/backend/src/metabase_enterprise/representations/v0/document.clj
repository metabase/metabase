(ns metabase-enterprise.representations.v0.document
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;; ------------------------------------ Main Schema ------------------------------------

(defmethod v0-common/type->model :document
  [_]
  :model/Document)

(defmethod v0-common/representation-type :model/Document [_entity]
  :document)

(defn- markdown->yaml [md]
  (let [script (str (io/file (io/resource "representations/markdown-to-prosemirror.mjs")))
        result (->> md (sh/sh "node" script :in))]
    ;; Always log errors if present
    (when (seq (:err result))
      (log/warn "Error from prosemirror-to-markdown:" (:err result)))
    ;; Throw if we got an error and no output
    (when (not (zero? (:exit result)))
      (throw (ex-info (str "Error converting markdown to prosemirror: " (:err result))
                      {:md md
                       :error (:err result)
                       :exit-code (:exit result)})))
    ;; Throw if we got no output at all (even without explicit error)
    (when-not (seq (:out result))
      (throw (ex-info "Markdown to prosemirror conversion produced no output"
                      {:md md
                       :stderr (:err result)
                       :exit-code (:exit result)})))
    (str/trim (:out result))))

(defmethod import/yaml->toucan [:v0 :document]
  [{document-name :display_name
    :keys [content content_type]}
   ref-index]
  (let [yaml-content content
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
        (log/info "Updating existing document" (:name document-data) "with name" (:name representation))
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
  (let [script (str (io/file (io/resource "representations/prosemirror-to-markdown.mjs")))
        result (->> edn
                    (json/encode)
                    (sh/sh "node" script :in))]
    ;; Always log errors if present
    (when (seq (:err result))
      (log/warn "Error from prosemirror-to-markdown:" (:err result)))
    ;; Throw if we got an error and no output
    (when (not (zero? (:exit result)))
      (throw (ex-info (str "Error converting prosemirror to markdown: " (:err result))
                      {:edn edn
                       :error (:err result)
                       :exit-code (:exit result)})))
    ;; Throw if we got no output at all (even without explicit error)
    (when-not (seq (:out result))
      (throw (ex-info "Prosemirror to markdown conversion produced no output"
                      {:edn edn
                       :stderr (:err result)
                       :exit-code (:exit result)})))
    (str/trim (:out result))))

(defmethod export/export-entity :document [document]
  (let [document-ref (v0-common/unref (v0-common/->ref (:id document) :document))
        document (patch-refs-for-export document)
        doc-content (let [doc (:document document)]
                      (cond
                        (nil? doc)
                        (throw (ex-info "Document content is nil - document field not loaded correctly"
                                        {:document-id (:id document)
                                         :document-keys (keys document)}))

                        (string? doc)
                        (json/decode doc keyword)

                        :else
                        doc))]
    (cond-> {:display_name (:name document)
             :type :document
             :version :v0
             :name document-ref
             :content doc-content
             ;; TODO: we need to iterate on the schema and code here:
             :content_type :prosemirror}
      :always
      u/remove-nils)))
