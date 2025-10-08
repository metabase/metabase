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
  (let [type-str (:type entity)]
    (cond
      (or (= type-str "collection") (= type-str "v0/collection")) :collection
      (or (= type-str "database") (= type-str "v0/database")) :database
      (or (= type-str "question") (= type-str "v0/question")) :card
      (or (= type-str "model") (= type-str "v0/model")) :card
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
      "entity.yml")))

(defn parse-entity-filename
  "Parse a filename to determine entity type. Returns {:type keyword :subtype string} or nil."
  [filename]
  (cond
    (= filename "collection.yml") {:type :collection}
    (str/ends-with? filename ".database.yml") {:type :database}
    (str/ends-with? filename ".question.yml") {:type :card :subtype "question"}
    (str/ends-with? filename ".model.yml") {:type :card :subtype "model"}
    :else nil))

(set! *warn-on-reflection* true)
