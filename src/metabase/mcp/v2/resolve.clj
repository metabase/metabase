(ns metabase.mcp.v2.resolve
  "Id resolution for v2 MCP tools: numeric-or-entity_id translation and the read-check pairing
   that collapses \"doesn't exist\" and \"exists but not readable\" into one not-found error."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
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

(defn resolve-collection-id
  "Resolve a `collection_id`/`parent_id` argument. `nil` and `\"root\"` mean the root
   collection and resolve to nil without a DB translation; `\"trash\"` resolves to
   `:trash-collection-id` when the caller allows it (the tool passes the id from the
   collections module) and is a teaching error otherwise.

   Anything else must name a collection the caller can read: \"doesn't exist\" and \"exists but not
   readable\" collapse into the same not-found error, so the argument never reports the existence of
   a collection the caller cannot see. That read also keeps an id for no collection at all from
   travelling into the write, where it fails a `mu/defn` schema or a permission check and reaches
   the caller as the sanitized \"Internal error\". Write permission stays the caller's job."
  ([id-or-sentinel] (resolve-collection-id id-or-sentinel nil))
  ([id-or-sentinel {:keys [trash-collection-id]}]
   (cond
     (or (nil? id-or-sentinel) (= "root" id-or-sentinel))
     nil

     (= "trash" id-or-sentinel)
     (or trash-collection-id
         (common/throw-teaching-error "\"trash\" is not a valid collection here — pass a collection id, entity_id, or \"root\"."))

     :else
     (:id (resolve-and-read :model/Collection id-or-sentinel)))))

(defn resolve-collection-id-or-personal
  "Like [[resolve-collection-id]], but an absent argument means the caller's personal collection
   instead of the root collection. Explicit `\"root\"` still resolves to the root collection, so
   callers keep a way to ask for it. Arguments arrive with top-level nils stripped at the
   registry boundary, so a nil here is always an omitted argument rather than an explicit null.

   For create paths only. On update an absent collection argument must leave content where it is,
   so update paths guard [[resolve-collection-id]] with `contains?` instead.

   API-key users have no personal collection; that nil is a teaching error here rather than a
   silent write into the root collection."
  [id-or-sentinel]
  (if (some? id-or-sentinel)
    (resolve-collection-id id-or-sentinel)
    (or (:id (collection/user->personal-collection api/*current-user-id*))
        (common/throw-teaching-error
         (str "The current user has no personal collection. Pass an explicit collection_id "
              "(or \"root\" for the root collection) instead.")))))
