(ns metabase.mcp.v2.resolve
  "Id resolution for v2 MCP tools: numeric-or-entity_id translation and the read-check pairing
   that collapses \"doesn't exist\" and \"exists but not readable\" into one not-found error."
  (:require
   [metabase.api.common :as api]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.v2.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private entity-id-re
  "NanoID shape used by `entity_id` columns."
  #"^[A-Za-z0-9_-]{21}$")

(defn entity-id?
  "Is `x` a 21-character entity_id string?"
  [x]
  (boolean (and (string? x) (re-matches entity-id-re x))))

(defn resolve-id-or-404
  "Resolve a numeric id or 21-char entity_id to the numeric id for `model`. Throws the
   collapsed not-found error when an entity_id doesn't resolve, and a teaching error for any
   other shape.

   This is translation only — it must always be followed by the object's read check. Prefer
   [[resolve-and-read]], which enforces that pairing."
  [model id-or-eid]
  (cond
    (int? id-or-eid)
    id-or-eid

    (entity-id? id-or-eid)
    (try
      (eid-translation/->id-or-404 model id-or-eid)
      (catch clojure.lang.ExceptionInfo e
        (if (= 404 (:status-code (ex-data e)))
          (common/throw-not-found model id-or-eid)
          (throw e))))

    :else
    (common/throw-teaching-error (format "Invalid id %s — pass a numeric id or a 21-character entity_id."
                                         (pr-str id-or-eid)))))

(defn resolve-and-read-with
  "Resolve `id-or-eid` for `model`, then return the object from `read-check-fn`, which must
   enforce at least what the corresponding REST endpoint enforces. \"Doesn't exist\" and
   \"exists but not readable\" collapse into the same not-found error, so the response never
   leaks existence across the permission boundary.

   Reach for [[resolve-and-read]] first; use this only when the read genuinely differs (a
   module fetch fn that runs its own checks, a write check, an extra existence predicate)."
  [model id-or-eid read-check-fn]
  (let [id (resolve-id-or-404 model id-or-eid)]
    (try
      (let [result (read-check-fn id)]
        (if (nil? result)
          (common/throw-not-found model id-or-eid)
          result))
      (catch clojure.lang.ExceptionInfo e
        (if (contains? #{403 404} (:status-code (ex-data e)))
          (common/throw-not-found model id-or-eid)
          (throw e))))))

(defn resolve-and-read
  "Resolve `id-or-eid` for `model` and return the row from behind its `api/read-check` — what
   nearly every read needs, with the same not-found collapse as [[resolve-and-read-with]]."
  [model id-or-eid]
  (resolve-and-read-with model id-or-eid
                         (fn [id] (api/read-check (mcp.db/select-one-by-id model id)))))
