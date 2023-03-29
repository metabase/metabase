(ns metabase.lib.native
  "Functions for working with native queries."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.schema.common :as common]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.domain-entities.converters :as converters]))))

(def ^:private TemplateTag
  [:map
   [:type [:enum :text :snippet :card]]
   [:id :uuid]
   [:name ::common/non-blank-string]
   [:display-name {:js/prop "display-name" :optional true} ::common/non-blank-string]
   [:snippet-name {:js/prop "snippet-name" :optional true} ::common/non-blank-string]
   [:card-id {:js/prop "card-id" :optional true} :int]
   [:dimension {:optional true} :any]
   [:widget-type {:js/prop "widget-type" :optional true} :string]])

(def ^:private TemplateTags
  [:map-of :string TemplateTag])

(def ^:private variable-tag-regex
  #"\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}")

(def ^:private snippet-tag-regex
  #"\{\{\s*(snippet:\s*[^}]+)\s*\}\}")

(def ^:private card-tag-regex
  #"\{\{\s*(#([0-9]*)(-[a-z0-9-]*)?)\s*\}\}")

(def ^:private tag-regexes
  [variable-tag-regex snippet-tag-regex card-tag-regex])

(mu/defn recognize-template-tags :- [:set ::common/non-blank-string]
  "Given the text of a native query, extract a possibly-empty set of template tag strings from it."
  [query-text :- ::common/non-blank-string]
  (into #{}
        (comp (mapcat #(re-seq % query-text))
              (map second))
        tag-regexes))

(defn- tag-name->card-id [tag-name]
  (when-let [[_ id-str] (re-matches #"^#(\d+)(-[a-z0-9-]*)?$" tag-name)]
    (parse-long id-str)))

(defn- tag-name->snippet-name [tag-name]
  (when (str/starts-with? tag-name "snippet:")
    (str/trim (subs tag-name (count "snippet:")))))

(defn- fresh-tag [tag-name]
  {:type :text
   :name tag-name
   :id   (m/random-uuid)})

(defn- finish-tag [{tag-name :name :as tag}]
  (merge tag
         (when-let [card-id (tag-name->card-id tag-name)]
           {:type    :card
            :card-id card-id})
         (when-let [snippet-name (tag-name->snippet-name tag-name)]
           {:type         :snippet
            :snippet-name snippet-name})
         (when-not (:display-name tag)
           {:display-name (u.humanization/name->human-readable-name :simple tag-name)})))

(defn- rename-template-tag
  [existing-tags old-name new-name]
  (let [old-tag       (get existing-tags old-name)
        display-name  (if (= (:display-name old-tag)
                             (u.humanization/name->human-readable-name :simple old-name))
                        ;; Replace the display name if it was the default; keep it if customized.
                        (u.humanization/name->human-readable-name :simple new-name)
                        (:display-name old-tag))
        new-tag       (-> old-tag
                          (dissoc :snippet-name :card-id)
                          (assoc :display-name display-name
                                 :name         new-name))]
    (-> existing-tags
        (dissoc old-name)
        (assoc new-name new-tag))))

(defn- unify-template-tags
  [query-tag-names existing-tags existing-tag-names]
  (let [new-tags (set/difference query-tag-names existing-tag-names)
        old-tags (set/difference existing-tag-names query-tag-names)
        tags     (if (= 1 (count new-tags) (count old-tags))
                   ;; With exactly one change, we treat it as a rename.
                   (rename-template-tag existing-tags (first old-tags) (first new-tags))
                   ;; With more than one change, just drop the old ones and add the new.
                   (merge (m/remove-keys old-tags existing-tags)
                          (m/index-by :name (map fresh-tag new-tags))))]
    (update-vals tags finish-tag)))

(mu/defn ^:export template-tags :- TemplateTags
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  See [[recognize-template-tags]] for how the tags are parsed."
  ([query-text :- ::common/non-blank-string]
   (template-tags query-text nil))
  ([query-text    :- ::common/non-blank-string
    existing-tags :- [:maybe TemplateTags]]
   (let [query-tag-names    (not-empty (recognize-template-tags query-text))
         existing-tag-names (not-empty (set (keys existing-tags)))]
     (if (or query-tag-names existing-tag-names)
       ;; If there's at least some tags, unify them.
       (unify-template-tags query-tag-names existing-tags existing-tag-names)
       ;; Otherwise just an empty map, no tags.
       {}))))

#?(:cljs
   (do
     (def ->TemplateTags
       "Converter to a map of `TemplateTag`s keyed by their string names."
       (converters/incoming TemplateTags))

     (def TemplateTags->
       "Converter from a map of `TemplateTag`s keyed by their string names to vanilla JS."
       (converters/outgoing TemplateTags))))
