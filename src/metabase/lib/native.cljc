(ns metabase.lib.native
  "Functions for working with native queries."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def tokens
  "The tokens used for template tags."
  ["{{" "}}" "[[" "]]"])

(defn- next-token [text start]
  (let [indexes (map #(or (str/index-of text % start) ##Inf) tokens)
        index   (apply min indexes)]
    (if (infinite? index)
      [nil nil]
      [index (subs text index (+ 2 index))])))

(mu/defn ^:private tokenize-query :- [:sequential :string]
  "Tokenize the query for easier parsing.
   This splits the string at the following tokens: {{ }} [[ ]],
   and keeps the tokens in the result."
  [query-text :- ::common/non-blank-string]
  (let [cnt (count query-text)]
    (loop [idx 0
          res []]
      (if (>= idx cnt)
        res
        (let [[jdx tok] (next-token query-text idx)]
          (if (nil? jdx)
            (recur cnt (conj res (subs query-text idx cnt)))
            (recur (+ 2 jdx) (conj res (subs query-text idx jdx) tok))))))))

(mr/def ::template-tag-with-context
   [:map
    [:name [:maybe :string]]
    [:optional :boolean]])

(mu/defn ^:private parse-template-tags :- [:sequential ::template-tag-with-context]
  "Parse the tokenized query into a sequence of tags, possibly with invalid content."
  [toks :- [:sequential :string]]
  (loop [tags []
         [token & tail] toks
         in-optional-block false
         in-template-tag false
         current-template-text ""]
    (if (nil? token)
      tags
      (case token
        "{{" (recur tags tail in-optional-block true "")
        "}}" (if in-template-tag
              ;; close the current template tag
              (recur (conj tags {:name current-template-text :optional in-optional-block}) tail in-optional-block false "")
              (recur tags tail in-optional-block in-template-tag current-template-text))
        "[[" (recur tags tail (not in-template-tag) in-template-tag current-template-text)
        "]]" (recur tags tail (if in-template-tag in-optional-block false) in-template-tag current-template-text)
        (if in-template-tag
          (recur tags tail in-optional-block in-template-tag (str current-template-text token))
          (recur tags tail in-optional-block in-template-tag current-template-text))))))

(def ^:private variable-tag-regex
  #"^([A-Za-z0-9_\.]+)$")

(def ^:private snippet-tag-regex
  #"^(snippet:\s*[^}]+)$")

(def ^:private card-tag-regex
  #"^#[0-9]+(-[a-z0-9-]*)?$")

(def ^:private tag-regexes
  [snippet-tag-regex card-tag-regex variable-tag-regex])

(mu/defn ^:private parse-template-tag :- [:maybe :string]
  "Parse and validate a template tag's content."
  [content :- :string]
  (first (first
    (mapcat #(re-seq % (str/trim content)) tag-regexes))))

(mu/defn ^:private format-template-tag :- ::template-tag-with-context
  "Format a template tags name."
  [tag :- ::template-tag-with-context]
  (update tag :name parse-template-tag))

(mu/defn ^:private format-template-tags :- [:sequential ::template-tag-with-context]
  "Format all template tags and filter out invalid ones."
  [tags :- [:sequential ::template-tag-with-context]]
  (filter :name (map format-template-tag tags)))

(mu/defn ^:private recognize-template-tags :- [:sequential ::template-tag-with-context]
  "Find all template tags and test if they are optional."
  [query-text :- ::common/non-blank-string]
  (let [toks          (tokenize-query query-text)
        tags          (parse-template-tags toks)
        template-tags (format-template-tags tags)]
    template-tags))

(defn- tag-name->card-id [tag-name]
  (when-let [[_ id-str] (re-matches #"^#(\d+)(-[a-z0-9-]*)?$" tag-name)]
    (parse-long id-str)))

(defn- tag-name->snippet-name [tag-name]
  (when (str/starts-with? tag-name "snippet:")
    (str/trim (subs tag-name (count "snippet:")))))

(defn- fresh-tag [tag]
  {:type :text
   :name (:name tag)
   :optional (:optional tag)
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
  [existing-tags old-tag new-tag]
  (let [new-name      (:name new-tag)
        old-name      (:name old-tag)
        display-name  (if (= (:display-name old-tag)
                             (u.humanization/name->human-readable-name :simple old-name))
                        ;; Replace the display name if it was the default; keep it if customized.
                        (u.humanization/name->human-readable-name :simple new-name)
                        (:display-name old-tag))
        new-tag       (-> old-tag
                          (dissoc :snippet-name :card-id :snippet-id)
                          (assoc :display-name display-name
                                 :name         new-name
                                 :optional     (:optional new-tag)))]
    (-> existing-tags
        (dissoc old-name)
        (assoc new-name new-tag))))

(defn- unify-template-tags
  [query-tags existing-tags]
  (let [tag-names (set (map :name query-tags))
        existing-tag-names (set (keys (or existing-tags {})))
        new-tag-names (set/difference tag-names existing-tag-names)
        old-tag-names (set/difference existing-tag-names tag-names)
        new-tags (filter #(contains? new-tag-names (:name %)) query-tags)
        old-tags (filter #(contains? old-tag-names (:name %)) (vals existing-tags))
        tags     (if (= 1 (count new-tag-names) (count old-tag-names))
                   ;; With exactly one change, we treat it as a rename.
                   (rename-template-tag existing-tags (first old-tags) (first new-tags))
                   ;; With more than one change, just drop the old ones and add the new.
                   (merge (m/remove-keys old-tag-names existing-tags)
                          (m/index-by :name (map fresh-tag new-tags))))]
    (update-vals tags finish-tag)))

(mu/defn extract-template-tags :- ::lib.schema.template-tag/template-tag-map
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
    existing-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]]
   (let [query-tags    (not-empty (recognize-template-tags query-text))
         existing-tag-names (not-empty (set (keys existing-tags)))]
     (if (or query-tags existing-tag-names)
       ;; If there's at least some tags, unify them.
       (unify-template-tags query-tags existing-tags)
       ;; Otherwise just an empty map, no tags.
       {}))))

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
                                      [{:lib/type           :mbql.stage/native
                                        :lib/stage-metadata results-metadata
                                        :template-tags      tags
                                        :native             inner-query}])
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
   tags :- ::lib.schema.template-tag/template-tag-map]
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

(mu/defn template-tags :- ::lib.schema.template-tag/template-tag-map
  "Returns the native query's template tags"
  [query :- ::lib.schema/query]
  (:template-tags (lib.util/query-stage query 0)))

(mu/defn has-write-permission :- :boolean
  "Returns whether the database has native write permissions.
   This is only filled in by [[metabase.api.database/add-native-perms-info]]
   and added to metadata when pulling a database from the list of dbs in js."
  [query :- ::lib.schema/query]
  (assert-native-query! (lib.util/query-stage query 0))
  (= :write (:native-permissions (lib.metadata/database query))))

(defmethod lib.query/can-run-method :mbql.stage/native
  [query]
  (and
    (set/subset? (required-native-extras query)
                 (set (keys (native-extras query))))
    (not (str/blank? (raw-native-query query)))))

(mu/defn engine :- :keyword
  "Returns the database engine.
   Must be a native query"
  [query :- ::lib.schema/query]
  (assert-native-query! (lib.util/query-stage query 0))
  (:engine (lib.metadata/database query)))
