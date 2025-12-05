(ns metabase-enterprise.representations.v0.document
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [metabase.util.json :as json]))

;;; ------------------------------------ Main Schema ------------------------------------

(def toucan-model
  "The toucan model keyword associated with document representations"
  :model/Document)

(defmethod v0-common/representation-type :model/Document [_entity]
  :document)

(defn yaml->toucan
  "Convert a v0 document representation to Toucan-compatible data."
  [{document-name :display_name
    :keys [name content _content_type]}
   ref-index]
  (let [yaml-content content
        yaml-content (v0-common/replace-refs-everywhere yaml-content ref-index)]
    {:name (or document-name name)
     :document (json/encode yaml-content)
     :content_type "application/json+vnd.prose-mirror"}))

(defn- patch-refs-for-export
  [yaml]
  (walk/postwalk
   (fn [node]
     (cond-> node
       (and (map? node)
            (= "cardEmbed" (:type node)))
       (update-in [:attrs :id] v0-common/id-model->ref :model/Card)))
   yaml))

(defn export-document
  "Export a Document Toucan entity to a v0 document representation."
  [document]
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
             :content_type :prosemirror}
      :always
      u/remove-nils)))
