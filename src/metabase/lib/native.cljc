(ns metabase.lib.native
  "Functions for working with native queries."
  (:refer-clojure :exclude [some select-keys mapv every? empty? not-empty])
  (:require
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.parameters.parse :as lib.params.parse]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.lib.parse :as lib.parse]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.template-tags :as lib.template-tags]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? mapv select-keys some empty? not-empty]]))

(defn- finish-tag [{tag-name :name :as tag}]
  (merge tag
         (when-let [card-id (lib.params.parse/tag-name->card-id tag-name)]
           {:type    :card
            :card-id card-id})
         (when-let [snippet-name (lib.params.parse/tag-name->snippet-name tag-name)]
           {:type         :snippet
            :snippet-name snippet-name})
         (when-not (:display-name tag)
           {:display-name (u.humanization/name->human-readable-name :simple tag-name)})))

(defn- fresh-tag [tag-name]
  (finish-tag
   {:type :text
    :name tag-name
    :id   (str (random-uuid))}))

(defn recognize-template-tags
  "Finds and returns all template tags in query-text."
  [query-text]
  (let [parsed (lib.parse/parse {} query-text)]
    (loop [found            {}
           [current & more] parsed]
      (match [current]
        [nil]              found
        [_ :guard string?] (recur found more)

        [{:type ::lib.parse/param, :name tag-name}]
        (let [normalized-name (lib.params.parse/match-and-normalize-tag-name tag-name)]
          (recur (cond-> found
                   (and normalized-name (not (found normalized-name)))
                   (assoc normalized-name (fresh-tag normalized-name)))
                 more))

        [{:type     ::lib.parse/optional
          :contents contents}]
        (recur found (into more contents))))))

(defn- rename-template-tag
  [existing-tags old-name new-name]
  (let [old-tag       (get existing-tags old-name)
        display-name  (if (= (:display-name old-tag)
                             (u.humanization/name->human-readable-name :simple old-name))
                        ;; Replace the display name if it was the default; keep it if customized.
                        (u.humanization/name->human-readable-name :simple new-name)
                        (:display-name old-tag))
        new-tag       (-> old-tag
                          (dissoc :snippet-name :card-id :snippet-id)
                          (assoc :display-name display-name
                                 :name         new-name))]
    (-> existing-tags
        (dissoc old-name)
        (assoc new-name new-tag))))

(defn- unify-template-tags
  [query-tags query-tag-names existing-tags existing-tag-names]
  (let [new-tags (set/difference query-tag-names existing-tag-names)
        old-tags (set/difference existing-tag-names query-tag-names)
        tags     (if (= 1 (count new-tags) (count old-tags))
                   ;; With exactly one change, we treat it as a rename.
                   (rename-template-tag existing-tags (first old-tags) (first new-tags))
                   ;; With more than one change, just drop the old ones and add the new.
                   (merge (m/remove-keys old-tags existing-tags)
                          (m/filter-keys new-tags query-tags)))]
    (update-vals tags finish-tag)))

(defn- snippet-names [template-tags]
  (keep #(when (= (:type %) :snippet)
           (:snippet-name %))
        (vals template-tags)))

(defn- extract-snippet-tags [metadata-providerable template-tags]
  (loop [[snippet-name & more-snippet-names] (snippet-names template-tags)
         seen #{}
         tags {}]
    (cond
      (nil? snippet-name) tags
      (seen snippet-name) (recur more-snippet-names seen tags)
      :else (let [snippet-tags (->> (lib.metadata/native-query-snippet-by-name metadata-providerable snippet-name)
                                    :template-tags)]
              (recur (into more-snippet-names (snippet-names snippet-tags))
                     (conj seen snippet-name)
                     (merge tags snippet-tags))))))

(defn- add-snippet-ids [metadata-providerable template-tags]
  (update-vals template-tags
               (fn [{tag-type :type, :keys [snippet-name], :as tag}]
                 (cond-> tag
                   ;; A snippet can be referenced by a previous name. If it cannot be found, preserve the previous `snippet-id`.
                   (= tag-type :snippet) (m/assoc-some :snippet-id
                                                       (:id (lib.metadata/native-query-snippet-by-name metadata-providerable snippet-name)))))))

(mu/defn extract-template-tags :- ::lib.schema.template-tag/template-tag-map
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  Given the text of a native query, extract a possibly-empty set of template tag strings from it.

  These looks like mustache templates. For variables, we only allow alphanumeric characters, eg. `{{foo}}`.
  For snippets they start with `snippet:`, eg. `{{ snippet: arbitrary text here }}`.
  And for card references either `{{ #123 }}` or with the optional human label `{{ #123-card-title-slug }}`.

  Invalid patterns are simply ignored, so something like `{{&foo!}}` is just disregarded.

  This finds in tags from snippets and assigns snippet-ids."
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string]
   (extract-template-tags metadata-providerable query-text nil))
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string
    existing-tags         :- [:maybe ::lib.schema.template-tag/template-tag-map]]
   (let [direct-tags        (recognize-template-tags query-text)
         query-tags         (merge direct-tags (extract-snippet-tags metadata-providerable direct-tags))
         query-tag-names    (not-empty (set (keys query-tags)))
         existing-tag-names (not-empty (set (keys existing-tags)))]
     (if (or query-tag-names existing-tag-names)
       ;; If there's at least some tags, unify them.
       (->> (unify-template-tags query-tags query-tag-names existing-tags existing-tag-names)
            (add-snippet-ids metadata-providerable))
       ;; Otherwise just an empty map, no tags.
       {}))))

(defn- assert-native-query [stage]
  (assert (= (:lib/type stage) :mbql.stage/native) (i18n/tru "Must be a native query")))

(def ^:private all-native-extra-keys
  #{:collection})

(mr/def ::native-extras
  [:map
   [:collection {:optional true} ::common/non-blank-string]])

(mu/defn required-native-extras :- set?
  "Returns the extra keys that are required for this database's native queries, for example `:collection` name is
  needed for MongoDB queries."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable]
  (cond-> #{}
    (lib.metadata/database-supports? metadata-providerable :native-requires-specified-collection)
    (conj :collection)))

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
         (assert-native-query (lib.util/query-stage query 0))
         (assert (empty? missing-keys)
                 (i18n/tru "Missing extra, required keys for native query: {0}"
                           (pr-str missing-keys)))
         result)))))

(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL query with a first stage that is a native query."
  ([metadata-providerable     :- ::lib.schema.metadata/metadata-providerable
    sql-or-other-native-query :- ::common/non-blank-string]
   (native-query metadata-providerable sql-or-other-native-query nil nil))

  ([metadata-providerable     :- ::lib.schema.metadata/metadata-providerable
    sql-or-other-native-query :- ::common/non-blank-string
    results-metadata          :- [:maybe ::lib.schema.metadata/stage]
    native-extras             :- [:maybe ::native-extras]]
   (let [tags (extract-template-tags metadata-providerable sql-or-other-native-query)]
     (cond-> (lib.query/query-with-stages metadata-providerable
                                          [{:lib/type           :mbql.stage/native
                                            :lib/stage-metadata results-metadata
                                            :template-tags      tags
                                            :native             sql-or-other-native-query}])
       native-extras (with-native-extras native-extras)))))

(mu/defn with-different-database :- ::lib.schema/query
  "Changes the database for this query. The first stage must be a native type.
   Native extras must be provided if the new database requires it."
  [query :- ::lib.schema/query
   metadata-provider :- ::lib.schema.metadata/metadata-providerable]
  (assert-native-query (lib.util/query-stage query 0))
  (let [stages-without-fields (->> (:stages query)
                                   (mapv (fn [stage]
                                           (update stage :template-tags update-vals #(dissoc % :dimension)))))]
    (lib.query/query-with-stages metadata-provider stages-without-fields)))

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
     (assert-native-query stage)
     (assoc stage
            :native inner-query
            :template-tags (extract-template-tags query inner-query existing-tags)))))

;;; TODO (Cam 7/16/25) -- this really doesn't seem to do what I'd expect, maybe we should rename it something like
;;; `with-replaced-template-tags`. It only replaces tags you specify rather then completely setting a new list
(mu/defn with-template-tags :- ::lib.schema/query
  "Updates the native query's template tags."
  [query        :- ::lib.schema/query
   updated-tags :- ::lib.schema.template-tag/template-tag-map]
  (letfn [(update-template-tags [existing-tags]
            ;; the way we do this is really weird, but it's important that we use the order of the keys in
            ;; `updated-tags` See
            ;; https://metaboat.slack.com/archives/C0645JP1W81/p1759975007383889?thread_ts=1759289751.539169&cid=C0645JP1W81
            ;;
            ;; first, filter out the tags in `updated-tags` not in existing tags, preserving the original order.
            (let [tags (reduce-kv
                        (fn [m k v]
                          (cond-> m
                            (contains? existing-tags k) (assoc k v)))
                        {}
                        updated-tags)]
              ;; merge in old values that weren't in the `updated-tags` map
              (reduce-kv
               (fn [m k v]
                 (cond-> m
                   (not (contains? m k)) (assoc k v)))
               tags
               existing-tags)))
          (update-stage [stage]
            (assert-native-query stage)
            (update stage :template-tags update-template-tags))]
    (lib.util/update-query-stage query 0 update-stage)))

(mu/defn raw-native-query :- some?
  "Returns the native query. This is a SQL string for SQL-based drivers; for other drivers like MongoDB it might be a
  Clojure map."
  [query :- ::lib.schema/query]
  (:native (lib.util/query-stage query 0)))

(mu/defn template-tags :- [:maybe ::lib.schema.template-tag/template-tag-map]
  "Returns the native query's template tags"
  [query :- ::lib.schema/query]
  (:template-tags (lib.util/query-stage query 0)))

(mu/defn native-query-card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Returns the card IDs from the template tags of the native query of `query`."
  [query :- ::lib.schema/query]
  (lib.template-tags/template-tags->card-ids (template-tags query)))

(mu/defn template-tags-referenced-cards :- [:maybe [:sequential ::lib.schema.metadata/card]]
  "Returns Card instances referenced by the given native `query`."
  [query :- ::lib.schema/query]
  (mapv
   (fn [card-id]
     (lib.metadata/card query card-id))
   (native-query-card-ids query)))

(mu/defn native-query-snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/native-query-snippet]]
  "Returns the card IDs from the template tags of the native query of `query`."
  [query :- ::lib.schema/query]
  (lib.template-tags/template-tags->snippet-ids (template-tags query)))

(mu/defn has-template-tag-variables? :- :boolean
  "Tests whether `query` has any template-tag variables.

  That is, any `:template-tags` values with `:type` other than `:snippet` or `:card`."
  [query :- ::lib.schema/query]
  (letfn [(variable-tag? [{tag-type :type}]
            (not (#{:snippet :card} tag-type)))]
    (boolean (some variable-tag? (vals (template-tags query))))))

(mu/defn has-write-permission :- :boolean
  "Returns whether the database has native write permissions.
   This is only filled in by [[metabase.warehouses-rest.api/add-native-perms-info]]
   and added to metadata when pulling a database from the list of dbs in js."
  [query :- ::lib.schema/query]
  (assert-native-query (lib.util/query-stage query 0))
  (= :write (:native-permissions (lib.metadata/database query))))

(mu/defn- validate-template-tag :- [:sequential [:map [:error/message :string] [:tag-name :string]]]
  "Validate a single template tag, returning a list of errors."
  [_query {tag-type :type tag-name :name, :keys [display-name dimension]}]
  (cond-> []
    (empty? display-name)
    (conj {:error/message (i18n/tru "Missing widget label: {0}" tag-name)
           :tag-name tag-name})

    (and (#{:dimension :temporal-unit} tag-type) (nil? dimension))
    (conj {:error/message (i18n/tru "The variable \"{0}\" needs to be mapped to a field." tag-name)
           :tag-name tag-name})))

(mu/defn validate-template-tags :- [:sequential [:map [:error/message :string] [:tag-name :string]]]
  "Given a query, returns a list of errors for each template tag in the query that is not valid."
  [query]
  (mapcat #(validate-template-tag query %)
          (lib.walk.util/all-template-tags query)))

(defmethod lib.query/can-run-method :mbql.stage/native
  [query _card-type]
  (and
   (set/subset? (required-native-extras query)
                (set (keys (native-extras query))))
   (not (str/blank? (raw-native-query query)))
   (empty? (validate-template-tags query))))

(mu/defn engine :- [:maybe :keyword]
  "Returns the database engine.
   Must be a native query"
  [query :- ::lib.schema/query]
  (assert-native-query (lib.util/query-stage query 0))
  (:engine (lib.metadata/database query)))

(defn- get-parameter-value
  [query tag-name {:keys [id dimension], param-type :type}]
  ;; note that the actual values chosen are completely arbitrary.  We just need to provide some
  ;; value so that the query will compile.
  (case param-type
    :text          {:id     id,
                    :type   :string/=,
                    :value  ["foo"],
                    :target ["variable" ["template-tag" tag-name]]}
    :number        {:id     id,
                    :type   :number/=,
                    :value  ["0"],
                    :target ["variable" ["template-tag" tag-name]]}
    :date          {:id     id,
                    :type   :date/single,
                    :value  "1970-01-01",
                    :target ["variable" ["template-tag" tag-name]]}
    :boolean       {:id     id,
                    :type   :boolean/=,
                    :value  [false],
                    :target ["variable" ["template-tag" tag-name]]}
    :dimension     (let [effective-type (->> dimension
                                             lib.ref/field-ref-id
                                             (lib.metadata/field query)
                                             :effective-type)]
                     (merge {:id     id,
                             :type   :string/=,
                             :value  ["foo"],
                             :target ["dimension" ["template-tag" tag-name]]}
                            (when (isa? effective-type :type/Number)
                              {:type   :number/=,
                               :value  ["0"]})
                            (when (isa? effective-type :type/HasDate)
                              {:type  :date/single
                               :value "2025-01-01"})))
    :temporal-unit {:id     id,
                    :type   :temporal-unit,
                    :value  "week",
                    :target ["dimension" ["template-tag" tag-name]]}
    nil))

(defn add-parameters-for-template-tags
  "Adds dummy values for parameters that don't have one.
  This is so that the resulting native query can be parsed. It's not expected to be executable."
  [query]
  (let [ttags (-> (lib.util/query-stage query 0)
                  :template-tags)
        parameters (:parameters query)
        params-by-id (m/index-by :id parameters)
        new-parameters (into []
                             (keep (fn [[tag-name {:keys [id] :as tag}]]
                                     (or (params-by-id id)
                                         (get-parameter-value query tag-name tag))))

                             ttags)]
    (cond-> query
      (seq new-parameters) (assoc :parameters new-parameters))))

(mu/defn- fully-parameterized-text?
  "Decide if `text`, usually (a part of) a query, is fully parameterized given the parameter types
  described by `template-tags` (usually the template tags of a native query).

  The rules to consider a piece of text fully parameterized is as follows:

  1. All parameters not in an optional block are field-filters or snippets or have a default value.
  2. All required parameters have a default value.

  The first rule is absolutely necessary, as queries violating it cannot be executed without
  externally supplied parameter values. The second rule is more controversial, as field-filters
  outside of optional blocks ([[ ... ]]) don't prevent the query from being executed without
  external parameter values (neither do parameters in optional blocks). The rule has been added
  nonetheless, because marking a parameter as required is something the user does intentionally
  and queries that are technically executable without parameters can be unacceptably slow
  without the necessary constraints. (Marking parameters in optional blocks as required doesn't
  seem to be useful any way, but if the user said it is required, we honor this flag.)"
  [text              :- :string
   template-tags-map :- ::lib.schema.template-tag/template-tag-map]
  (try
    (let [obligatory-params (into #{}
                                  (comp (filter lib.params.parse.types/param?)
                                        (map :k))
                                  (lib.params.parse/parse text))]
      (and (every? #(or (#{:dimension :snippet :card} (:type %))
                        (:default %))
                   (map template-tags-map obligatory-params))
           (every? #(or (not (:required %))
                        (:default %))
                   (vals template-tags-map))))
    (catch #?(:clj clojure.lang.ExceptionInfo :cljs :default) _
      ;; An exception might be thrown during parameter parsing if the syntax is invalid. In this case we return
      ;; true so that we still can try to generate a preview for the query and display an error.
      false)))

;;; TODO (Cam 10/3/25) -- this needs a much better docstring
(mu/defn fully-parameterized-query? :- boolean?
  "Given a query, returns `true` if its query is fully parameterized."
  [query :- ::lib.schema/query]
  (let [raw-native-query-string (when (lib.schema/native-only-query? query)
                                  (let [query (raw-native-query query)]
                                    (when (string? query)
                                      query)))
        template-tags-map       (when raw-native-query-string
                                  (not-empty (lib.walk.util/all-template-tags-map query)))]
    (if (and template-tags-map raw-native-query-string)
      (boolean (fully-parameterized-text? raw-native-query-string template-tags-map))
      true)))

(defn- find-table-or-transform-for-tag
  "Given a table template tag, find a matching table or transform."
  [tables transforms {:keys [table-id table-name table-schema] :as tag}]
  (let [matches? (fn [name schema]
                   (and (= name table-name)
                        (or (not table-schema)
                            (= schema table-schema))))]
    (cond
      table-id {:table table-id}
      table-name (or (some (fn [{:keys [name schema id]}]
                             (when (matches? name schema)
                               {:table id}))
                           tables)
                     (some (fn [{:keys [id] {:keys [name schema]} :target}]
                             (when (matches? name schema)
                               {:transform id}))
                           transforms))
      :else (throw (ex-info "Table tag missing both table-id and table-name"
                            {:tag tag})))))

(mu/defn native-query-table-references :- [:set [:or
                                                 [:map [:table ::lib.schema.id/table]]
                                                 [:map [:transform ::lib.schema.id/transform]]]]
  "Given a native query, find any tables or transforms referenced by `:table` template tags"
  [query]
  (let [tags (->> (lib.walk.util/all-template-tags query)
                  (filter #(= (:type %) :table)))
        tables (lib.metadata/tables query)
        transforms (lib.metadata/transforms query)]
    (into #{}
          (keep #(find-table-or-transform-for-tag tables transforms %))
          tags)))
