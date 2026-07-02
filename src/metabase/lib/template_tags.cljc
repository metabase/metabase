(ns metabase.lib.template-tags
  "Helpers for working with the canonical template-tags form: an ordered sequence of tag
  maps, each carrying its own `:name` (see
  [[metabase.lib.schema.template-tag/template-tags]]).

  These are the public accessors for that form -- callers should reach template tags through
  these rather than digging into the sequence by hand. Order is significant (it drives the
  render order of template-tag filter widgets, https://github.com/metabase/metabase/issues/5136),
  so the accessors preserve it: [[assoc-template-tag]] keeps an existing tag in place and
  appends a brand-new one at the end, and [[template-tag-vals]] / [[template-tag-names]]
  return tags/names in display order."
  (:refer-clojure :exclude [not-empty some])
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv not-empty some]]))

(mu/defn template-tag :- [:maybe ::lib.schema.template-tag/template-tag]
  "Look up the template tag named `tag-name` (by `:name`) in `template-tags`, or `nil`.

  Linear scan: queries almost always have fewer than 8 tags, and the rare larger case
  tolerates O(n) access. See https://github.com/metabase/metabase/issues/5136."
  [template-tags :- :any
   tag-name      :- [:maybe :some]]
  (some (fn [tag]
          (when (= (:name tag) tag-name)
            tag))
        template-tags))

(mu/defn has-template-tag? :- :boolean
  "True if `template-tags` contains a tag named `tag-name`."
  [template-tags :- :any
   tag-name      :- [:maybe :some]]
  (boolean (some? (template-tag template-tags tag-name))))

(mu/defn template-tag-names :- [:sequential ::lib.schema.template-tag/name]
  "Return the template tag names (each tag's `:name`) in display order."
  [template-tags :- :any]
  (mapv :name template-tags))

(mu/defn template-tag-vals :- [:sequential ::lib.schema.template-tag/template-tag]
  "Return the template tags themselves in display order.

  Accepts either the canonical sequence form or the legacy associative-map form (e.g. a
  Native Query Snippet's stored `:template-tags`); both yield the tag definitions."
  [template-tags :- :any]
  (cond
    (map? template-tags)        (mapv val template-tags)
    (sequential? template-tags) (vec template-tags)
    :else                       []))

(defn template-tags->map
  "Return an unordered map view `{tag-name tag}` of `template-tags` (keyed by each tag's
  `:name`).

  Use this only for consumers that genuinely do not care about order; the map loses display
  order, so order-sensitive callers must iterate the sequence directly."
  [template-tags]
  (when (seq template-tags)
    (into {} (map (juxt :name identity)) template-tags)))

(mu/defn assoc-template-tag :- ::lib.schema.template-tag/template-tags
  "Return `template-tags` with the tag named `tag-name` replaced by `tag`.

  If a tag with that `:name` already exists it is updated in place (preserving display
  order); otherwise `tag` is appended at the end. The tag's `:name` is set to `tag-name`."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   tag-name      :- ::lib.schema.template-tag/name
   tag           :- ::lib.schema.template-tag/template-tag]
  (let [tag      (assoc tag :name tag-name)
        found?   (volatile! false)
        ;; replace in place if present...
        updated  (into []
                       (map (fn [existing-tag]
                              (if (= (:name existing-tag) tag-name)
                                (do (vreset! found? true) tag)
                                existing-tag)))
                       template-tags)]
    (cond-> updated (not @found?) (conj tag))))

(mu/defn dissoc-template-tag :- [:maybe ::lib.schema.template-tag/template-tags]
  "Return `template-tags` without the tag named `tag-name`."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   tag-name      :- [:maybe :some]]
  (not-empty
   (into [] (remove (fn [tag] (= (:name tag) tag-name))) template-tags)))

(mu/defn update-template-tag :- ::lib.schema.template-tag/template-tags
  "Return `template-tags` with the tag named `tag-name` replaced by `(f tag)`.

  If `tag-name` is absent, `template-tags` is returned unchanged. The tag's `:name` is
  preserved."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   tag-name      :- [:maybe :some]
   f             :- [:=> [:cat ::lib.schema.template-tag/template-tag] ::lib.schema.template-tag/template-tag]]
  (into []
        (map (fn [tag]
               (if (= (:name tag) tag-name)
                 (assoc (f tag) :name tag-name)
                 tag)))
        template-tags))

(mu/defn template-tags->card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Returns the card IDs from `template-tags`. Accepts the sequence form or the legacy
  associative-map form (e.g. a snippet's stored template-tags)."
  [template-tags :- :any]
  (->> (template-tag-vals template-tags)
       (into #{} (keep :card-id))
       not-empty))

(mu/defn template-tags->snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/native-query-snippet]]
  "Returns the snippet IDs from `template-tags`. Accepts the sequence form or the legacy
  associative-map form (e.g. a snippet's stored template-tags)."
  [template-tags :- :any]
  (->> (template-tag-vals template-tags)
       (into #{} (keep :snippet-id))
       not-empty))
