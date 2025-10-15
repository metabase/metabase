(ns representation.entity
  (:require [clojure.string :as str]))

(defn sanitize-filename
  "Sanitize a name for use as a filename."
  [name]
  (-> name
      str/lower-case
      (str/replace #"[^a-z0-9-]" "-")
      (str/replace #"-+" "-")
      (str/replace #"^-|-$" "")))

(defn determine-entity-type
  "Determine the entity type from a representation."
  [entity]
  (let [type-val (:type entity)]
    (cond
      (or (= type-val "collection") (= type-val "v0/collection") (= type-val :collection)) :collection
      (or (= type-val "database") (= type-val "v0/database") (= type-val :database)) :database
      (or (= type-val "question") (= type-val "v0/question") (= type-val :question)) :card
      (or (= type-val "model") (= type-val "v0/model") (= type-val :model)) :card
      (or (= type-val "document") (= type-val "v0/document") (= type-val :document)) :document
      :else :unknown)))

(defn entity-filename
  "Generate filename for an entity."
  [entity]
  (let [type (determine-entity-type entity)
        base-name (or (:ref entity) (:name entity) "unnamed")
        type-str (last (str/split (:type entity) #"/"))]
    (case type
      :collection "collection.yml"
      :database (str (sanitize-filename base-name) ".database.yml")
      :card (str (sanitize-filename base-name) "." type-str ".yml")
      :document (str (sanitize-filename base-name) ".document.md")
      "entity.yml")))

(defn parse-entity-filename
  "Parse a filename to determine entity type. Returns {:type keyword :subtype string} or nil."
  [filename]
  (cond
    (= filename "collection.yml") {:type :collection}
    (str/ends-with? filename ".database.yml") {:type :database}
    (str/ends-with? filename ".question.yml") {:type :card :subtype "question"}
    (str/ends-with? filename ".document.yml") {:type :card :subtype "document"}
    (str/ends-with? filename ".document.md") {:type :card :subtype "document"}
    (str/ends-with? filename ".model.yml") {:type :card :subtype "model"}
    :else nil))

(set! *warn-on-reflection* true)
