(ns metabase.search.appdb.document
  "Pure transformation of an ingested entity into a row ready to be upserted into a search index table.

  Nothing here touches the database or the active/pending state machine — it is just data shaping, which
  makes it cheap to test in isolation. The one external call is [[specialization/extra-entry-fields]],
  which adds driver-specific generated columns (e.g. the Postgres tsvector)."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.spec :as search.spec]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- strip-junk-chars
  "Replace control characters (\\p{Cc}: C0 controls including \\t \\n \\r, DEL, C1 controls) and surrogate
   code points (\\p{Cs}) with a single space so they act as token boundaries for full-text indexing instead
   of accidentally fusing adjacent words. Postgres also outright rejects literal NUL (0x00) in text columns,
   so this is required to keep reindex batches from aborting. Non-string values pass through unchanged."
  [v]
  (cond-> v (string? v) (str/replace #"(?U)[\p{Cc}\p{Cs}]" " ")))

(defn document->entry
  "Shape an ingested `entity` map into a row for the index table: rename id/timestamp columns, JSON-encode
   the display/legacy payloads, strip junk characters from text, and add driver-specific generated fields."
  [entity]
  (let [entity (update-vals entity strip-junk-chars)]
    (-> entity
        (select-keys (conj search.spec/attr-columns :model :display_data :legacy_input))
        (set/rename-keys {:id :model_id
                          :created_at :model_created_at
                          :updated_at :model_updated_at})
        (assoc :updated_at :%now)
        (update :display_data json/encode)
        ;; legacy_input is already JSON-encoded in ->document; encode only if it's still a map (e.g., in tests)
        (update :legacy_input #(if (string? %) % (json/encode %)))
        (dissoc :native_query)
        (merge (specialization/extra-entry-fields entity)))))
