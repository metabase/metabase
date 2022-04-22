(ns metabase.models.persisted-info
  (:require [clojure.string :as str]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(defn- field-metadata->field-defintion
  "Map containing the type and name of fields for dll. The type is :base-type and uses the effective_type else base_type
  of a field."
  [{field-name :name :keys [base_type effective_type]}]
  {:field-name field-name
     :base-type (or effective_type base_type)})

(def ^:private Metadata
  "Spec for metadata. Just asserting we have base types and names, not the full metadata of the qp."
  [(su/open-schema
    {:name s/Str, (s/optional-key :effective_type) s/Keyword, :base_type s/Keyword})])

(def Definition
  "Definition spec for a cached table."
  {:table-name su/NonBlankString
   :field-definitions [{:field-name su/NonBlankString
                        ;; TODO check (isa? :type/Integer :type/*)
                        :base-type  s/Keyword}]})

(s/defn metadata->definition :- Definition
  "Returns a ddl definition datastructure. A :table-name and :field-deifinitions vector of field-name and base-type."
  [metadata :- Metadata table-name]
  {:table-name        table-name
   :field-definitions (mapv field-metadata->field-defintion metadata)})

(def ^:dynamic *allow-persisted-substitution*
  "Allow persisted substitution. When refreshing, set this to nil to ensure that all undelrying queries are used to
  rebuild the persisted table."
  true)

(defn- slug-name
  "A slug from a card suitable for a table name."
  [nom]
  (->> (str/replace (str/lower-case nom) #"\s+" "_")
       (take 10)
       (apply str)))

(models/add-type! ::definition
                  :in i/json-in
                  :out (fn [definition]
                         (when-let [definition (not-empty (i/json-out-with-keywordization definition))]
                           (update definition :field-definitions (fn [field-definitions]
                                                                   (mapv #(update % :base-type keyword)
                                                                         field-definitions))))))

(models/defmodel PersistedInfo :persisted_info)

(u/strict-extend (class PersistedInfo)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:definition ::definition})}))

(defn persisted?
  "Hydrate a card :is_persisted for the frontend."
  {:hydrate :persisted}
  [card]
  (db/exists? PersistedInfo :card_id (:id card) :state [:not= "deletable"]))

(defn mark-for-deletion [conditions-map]
  (db/update-where! PersistedInfo conditions-map :active false, :state "deletable", :state_change_at :%now))

(defn make-ready [user-id card]
  (let [slug (-> card :name slug-name)
        {:keys [database_id]} card
        card-id (u/the-id card)
        existing-persisted-info (db/select-one PersistedInfo :card_id card-id)
        persisted-info (cond
                         (not existing-persisted-info)
                         (db/insert! PersistedInfo {:card_id         card-id
                                                    :database_id     database_id
                                                    :question_slug   slug
                                                    :table_name      (format "model_%s_%s" card-id slug)
                                                    :active          false
                                                    :refresh_begin   :%now
                                                    :refresh_end     nil
                                                    :state           "creating"
                                                    :state_change_at :%now
                                                    :creator_id      user-id})

                         (= "deletable" (:state existing-persisted-info))
                         (do
                           (db/update! PersistedInfo (u/the-id existing-persisted-info)
                                       :active false, :state "creating", :state_change_at :%now)
                           (db/select-one PersistedInfo :card_id card-id)))]
    persisted-info))
