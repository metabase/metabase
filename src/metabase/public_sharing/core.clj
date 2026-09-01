(ns metabase.public-sharing.core
  (:require
   [medley.core :as m]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [toucan2.core :as t2]))

(def public-uuid-prefix-length
  "How many leading characters of a `public_uuid` are copied into the plaintext `public_uuid_prefix` column.

  The full `public_uuid` is encrypted at rest with a non-deterministic cipher, so it can't be matched with a SQL `=`.
  `public_uuid_prefix` is an indexed, unencrypted narrowing key: a lookup filters to the few rows sharing these leading
  characters and then decrypts and compares the full uuid in memory. Eight hex characters keep that candidate set at
  ~1 row well past our shared-entity counts while leaving the remaining ~96 bits of the token secret.

  Changing this value requires a data migration to rewrite `public_uuid_prefix` for existing rows, or their public
  links will stop resolving."
  8)

(defn remove-public-uuid-if-public-sharing-is-disabled
  "If public sharing is *disabled* and `object` has a `:public_uuid`, remove it so people don't try to use it (since it
  won't work). Intended for use as part of a `post-select` implementation for Cards and Dashboards."
  [object]
  (if (and (:public_uuid object)
           (not (public-sharing.settings/enable-public-sharing)))
    (assoc object :public_uuid nil)
    object))

(defn public-uuid-prefix
  "The plaintext lookup prefix for `public-uuid` — its first [[public-uuid-prefix-length]] characters — or nil when
  there is no uuid."
  [public-uuid]
  (when public-uuid
    (subs public-uuid 0 (min public-uuid-prefix-length (count public-uuid)))))

(defn add-public-uuid-prefix
  "Set `:public_uuid_prefix` from `:public_uuid`. Intended for a before-INSERT hook: a freshly inserted row always gets
  a prefix matching its `:public_uuid` (nil when it has none). `:public_uuid` is still plaintext at this point — the
  encrypting transform runs on the way to the database, after this hook."
  [entity]
  (assoc entity :public_uuid_prefix (public-uuid-prefix (:public_uuid entity))))

(defn add-public-uuid-prefix-if-changed
  "Re-derive `:public_uuid_prefix` from `:public_uuid`, but only when the update actually changes `:public_uuid`.
  Intended for a before-UPDATE hook. Deriving it on every update is wrong: the instance's `:public_uuid` is nil'd out
  by the post-select hook when public sharing is disabled, so an unrelated update would blank the prefix while the real
  (encrypted) `public_uuid` column is left untouched, permanently breaking the public link. Whenever `:public_uuid` is
  genuinely in the changes we re-derive the prefix, nil or not."
  [entity]
  (if (contains? (t2/changes entity) :public_uuid)
    (assoc entity :public_uuid_prefix (public-uuid-prefix (:public_uuid entity)))
    entity))

(defn public-uuid->id
  "Resolve a shared entity's public `uuid` to the id of the matching `model` row, or nil.

  `public_uuid` is encrypted with a non-deterministic cipher, so it can't be matched with a SQL `=`. The lookup filters
  by the plaintext `public_uuid_prefix` (an indexed copy of the uuid's first [[public-uuid-prefix-length]] characters)
  to a small candidate set, then compares the model-decrypted `public_uuid` in memory. A value written outside the
  model — e.g. a plaintext uuid forged via raw SQL — fails the strict decrypting read and errors out rather than
  resolving."
  [model uuid]
  (when uuid
    (some (fn [{:keys [id public_uuid]}]
            (when (= uuid public_uuid)
              id))
          (t2/select [model 'id 'public_uuid]
                     'public_uuid_prefix (public-uuid-prefix uuid)
                     'archived false))))

(defn public-uuid->model
  "Resolve a shared entity's public `uuid` to the full matching `model` row, or nil. Like [[public-uuid->id]] but
  returns the whole instance so callers needn't re-select it by id.

  Selects full rows narrowed by the indexed `public_uuid_prefix` and compares the model-decrypted `public_uuid` in
  memory (see [[public-uuid->id]] for why the prefix + in-memory `=` is needed). A value written outside the model —
  e.g. a plaintext uuid forged via raw SQL — fails the strict decrypting read and errors out rather than resolving."
  [model uuid]
  (when uuid
    (m/find-first #(= uuid (:public_uuid %))
                  (t2/select model
                             'public_uuid_prefix (public-uuid-prefix uuid)
                             'archived false))))
