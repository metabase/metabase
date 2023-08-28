(ns metabase.lib.native
  "Functions for working with native queries."
  (:require
   #?@(:cljs ([metabase.domain-entities.converters :as converters]))
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private TemplateTag
  [:map
   [:type [:enum :text :snippet :card]]
   [:id :string]
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

(mu/defn ^:private recognize-template-tags :- [:set ::common/non-blank-string]
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
   :id   (str (random-uuid))})

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

(mu/defn extract-template-tags :- TemplateTags
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  Given the text of a native query, extract a possibly-empty set of template tag strings from it.

  These looks like mustache templates. For variables, we only allow alphanumeric characters, eg. `{{foo}}`.
  For snippets they start with `snippet:`, eg. `{{ snippet: arbitrary text here }}`.
  And for card references either `{{ #123 }}` or with the optional human label `{{ #123-card-title-slug }}`.

  Invalid patterns are simply ignored, so something like `{{&foo!}}` is just disregarded."
  ([query-text :- ::common/non-blank-string]
   (extract-template-tags query-text nil))
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

(defn- assert-native-query! [stage]
  (assert (= (:lib/type stage) :mbql.stage/native) (i18n/tru "Must be a native query")))

(def ^:private all-native-extra-keys
  #{:collection})

(mr/def ::native-extras
  [:map
   [:collection {:optional true} ::common/non-blank-string]])

(mu/defn required-native-extras :- set?
  "Returns the extra keys that are required for this database's native queries, for example `:collection` name is
  needed for MongoDB queries."
  [metadata-provider :- lib.metadata/MetadataProviderable]
  (let [db (lib.metadata/database metadata-provider)]
   (cond-> #{}
    (get-in db [:features :native-requires-specified-collection])
    (conj :collection))))

(mu/defn with-native-extras :- ::lib.schema/query
  "Updates the extras required for the db to run this query.
   The first stage must be a native type. Will ignore extras not in `required-native-extras`"
  [query :- ::lib.schema/query
   native-extras :- [:maybe ::native-extras]]
  (let [required-extras (required-native-extras query)]
    (lib.util/update-query-stage
      query 0
      (fn [stage]
        (let [extras-to-remove (set/difference all-native-extra-keys required-extras)
              stage-without-old-extras (apply dissoc stage extras-to-remove)
              result (merge stage-without-old-extras (select-keys native-extras required-extras))
              missing-keys (set/difference required-extras (set (keys native-extras)))]
          (assert-native-query! (lib.util/query-stage query 0))
          (assert (empty? missing-keys)
                  (i18n/tru "Missing extra, required keys for native query: {0}"
                            (pr-str missing-keys)))
          result)))))

(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL query with a first stage that is a native query."
  ([metadata-providerable :- lib.metadata/MetadataProviderable
    inner-query :- ::common/non-blank-string]
   (native-query metadata-providerable inner-query nil nil))

  ([metadata-providerable :- lib.metadata/MetadataProviderable
    inner-query :- ::common/non-blank-string
    results-metadata :- [:maybe lib.metadata/StageMetadata]
    native-extras :- [:maybe ::native-extras]]
   (let [tags (extract-template-tags inner-query)]
     (-> (lib.query/query-with-stages metadata-providerable
                                      [(-> {:lib/type           :mbql.stage/native
                                            :lib/stage-metadata results-metadata
                                            :template-tags      tags
                                            :native             inner-query}
                                           lib.options/ensure-uuid)])
         (with-native-extras native-extras)))))

(mu/defn with-different-database :- ::lib.schema/query
  "Changes the database for this query. The first stage must be a native type.
   Native extras must be provided if the new database requires it."
  ([query :- ::lib.schema/query
    metadata-provider :- lib.metadata/MetadataProviderable]
   (with-different-database query metadata-provider nil))
  ([query :- ::lib.schema/query
    metadata-provider :- lib.metadata/MetadataProviderable
    native-extras :- [:maybe ::native-extras]]
   (assert-native-query! (lib.util/query-stage query 0))
   ;; Changing the database should also clean up template tags, see #31926
   (-> (lib.query/query-with-stages metadata-provider (:stages query))
       (with-native-extras native-extras))))

(mu/defn native-extras :- [:maybe ::native-extras]
  "Returns the extra keys for native queries associated with this query."
  [query :- ::lib.schema/query]
  (not-empty (select-keys (lib.util/query-stage query 0) (required-native-extras query))))

(mu/defn with-native-query :- ::lib.schema/query
  "Update the raw native query, the first stage must already be a native type.
   Replaces templates tags"
  [query :- ::lib.schema/query
   inner-query :- ::common/non-blank-string]
  (lib.util/update-query-stage
    query 0
    (fn [{existing-tags :template-tags :as stage}]
      (assert-native-query! stage)
      (assoc stage
        :native inner-query
        :template-tags (extract-template-tags inner-query existing-tags)))))

(mu/defn with-template-tags :- ::lib.schema/query
  "Updates the native query's template tags."
  [query :- ::lib.schema/query
   tags :- TemplateTags]
  (lib.util/update-query-stage
    query 0
    (fn [{existing-tags :template-tags :as stage}]
      (assert-native-query! stage)
      (let [valid-tags (keys existing-tags)]
        (assoc stage :template-tags
               (m/deep-merge existing-tags (select-keys tags valid-tags)))))))

(mu/defn raw-native-query :- ::common/non-blank-string
  "Returns the native query string"
  [query :- ::lib.schema/query]
  (:native (lib.util/query-stage query 0)))

(mu/defn template-tags :- TemplateTags
  "Returns the native query's template tags"
  [query :- ::lib.schema/query]
  (:template-tags (lib.util/query-stage query 0)))
