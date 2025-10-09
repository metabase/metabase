(ns metabase-enterprise.representations.v0.snippet
  (:require
   [metabase-enterprise.representations.core :as core]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.native :as lib.native]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod import/type->schema [:v0 :snippet] [_] ::snippet)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'snippet' for this schema"}
   :snippet])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this snippet schema"}
   :v0])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the snippet, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Globally unique name for the snippet, used in {{snippet:name}} references"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the snippet does"}
   ::lib.schema.common/non-blank-string])

(mr/def ::sql
  [:and
   {:description "SQL code that can include {{param}} template tags for parameters"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the snippet"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::snippet
  [:map
   {:description "v0 schema for human-writable SQL snippet representation"}
   [:type ::type]
   [:version ::version]
   [:ref ::ref]
   [:name ::name]
   [:description [:maybe ::description]]
   [:sql ::sql]
   [:collection {:optional true} ::collection]
   [:template_tags :any]])

;;; ------------------------------------ Ingestion ------------------------------------

(defmethod import/yaml->toucan [:v0 :snippet]
  [{:keys [_ref name description sql collection entity-id] :as representation}
   _ref-index]
  {:name name
   :description description
   :content sql
   :creator_id (or api/*current-user-id* config/internal-mb-user-id)
   :collection_id (v0-common/find-collection-id collection)
   :entity_id (or entity-id (v0-common/generate-entity-id representation))
   :template_tags (lib.native/recognize-template-tags sql)})

(defmethod import/persist! [:v0 :snippet]
  [representation ref-index]
  (let [snippet-data (import/yaml->toucan representation ref-index)
        entity-id (:entity_id snippet-data)
        existing (when entity-id (t2/select-one :model/NativeQuerySnippet :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing snippet" (:name snippet-data) "with ref" (:ref representation))
        (t2/update! :model/NativeQuerySnippet (:id existing) (dissoc snippet-data :entity_id))
        (t2/select-one :model/NativeQuerySnippet :id (:id existing)))
      (do
        (log/info "Creating new snippet" (:name snippet-data))
        (first (t2/insert-returning-instances! :model/NativeQuerySnippet snippet-data))))))

(defn- template-tag-ref
  "Given a template tag map, return its ref string."
  [template-tag]
  (let [type (:type template-tag)]
    (cond (= type :snippet) (v0-common/->ref (:snippet-id template-tag) :snippet)
          (= type :card) (v0-common/->ref (:card-id template-tag) :card)
          :else (throw (ex-info "Unknown template tag type" {:template-tag template-tag})))))

(defmethod export/export-entity :model/NativeQuerySnippet [snippet]
  (let [snippet-ref (v0-common/unref (v0-common/->ref (:id snippet) :snippet))
        template-tags (into {}
                            (comp
                             (filter (fn [[_ v]] (not= (:type v) :text)))
                             (map (fn [[k v]] [k (template-tag-ref v)])))
                            (:template_tags snippet))]
    {:ref snippet-ref
     :type :snippet
     :version :v0
     :name (:name snippet)
     :description (:description snippet)
     :sql (:content snippet) ;; todo: change this :sql
     :template_tags template-tags}))

(comment

  (let [snippet (t2/select-one :model/NativeQuerySnippet 7)
        snippet-repr (core/export snippet)
        snippet-yaml (rep-yaml/generate-string snippet-repr)]
    (spit "/tmp/snippet.yml" snippet-yaml))

  (let [snippet (t2/select-one :model/NativeQuerySnippet 9)
        snippet-repr (core/export snippet)
        snippet-yaml (rep-yaml/generate-string snippet-repr)]
    (spit "/tmp/snippet.yml" snippet-yaml))

  (try (let [snippet-repr (rep-yaml/from-file "/tmp/snippet.yml")
             normalized-repr (core/normalize-representation snippet-repr)]
         (core/yaml->toucan normalized-repr))
       (catch Exception e
         (tap> e)
         (throw e)))

  (let [snippet (t2/select-one :model/Card 1455)
        snippet-repr (core/export snippet)
        snippet-yaml (rep-yaml/generate-string snippet-repr)]
    (spit "/tmp/card.yml" snippet-yaml))

  (try (let [snippet-repr (rep-yaml/from-file "/tmp/card.yml")]
         (core/normalize-representation snippet-repr))
       (catch Exception e
         (tap> e)
         (throw e)))

  (tap> 1))
