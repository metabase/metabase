(ns metabase.lib.native
  "Functions for working with native queries."
  (:refer-clojure :exclude [some select-keys mapv every? empty? not-empty])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.normalize :as lib.normalize]
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
   [metabase.util.match :as match]
   [metabase.util.performance :refer [empty? every? mapv not-empty select-keys some]]))

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

(defn recognize-template-tags-with-order
  "Finds and returns all template tags in `query-text`.

  Returns `{:tags <tag-map>, :order <tag-name-vector>}`, where `:tags` maps tag name to tag definition and
  `:order` lists the tag names in the order they first appear in `query-text`.

  Order is tracked explicitly rather than relying on map key order, because Clojure maps lose insertion
  order once they exceed the `PersistentArrayMap` threshold (16 entries on the JVM, 8 in ClojureScript).
  Relying on map key order is what caused SQL template-tag filter widgets to render in a random,
  un-editable order once a query grew past that threshold. See
  https://github.com/metabase/metabase/issues/5136"
  [query-text]
  (let [parsed (lib.parse/parse {} query-text)]
    (loop [{:keys [tags order]} {:tags {} :order []}
           [current & more]     parsed]
      (let [[result more] (match/match-one current
                            (_ :guard string?) [{:tags tags :order order} more]

                            {:type ::lib.parse/param, :name tag-name}
                            (let [normalized-name (lib.params.parse/match-and-normalize-tag-name tag-name)]
                              [(cond-> {:tags tags :order order}
                                 (and normalized-name (not (contains? tags normalized-name)))
                                 (-> (assoc-in [:tags normalized-name] (fresh-tag normalized-name))
                                     (update :order conj normalized-name)))
                               more])

                            {:type ::lib.parse/optional, :contents contents}
                            [{:tags tags :order order} (into more contents)]

                            _ [{:tags tags :order order} nil])]
        (if more
          (recur result more)
          result)))))

(defn recognize-template-tags
  "Finds and returns all template tags in `query-text`, as a map of tag name to tag definition.

  Kept for backwards compatibility. Prefer [[recognize-template-tags-with-order]] when tag ordering
  matters."
  [query-text]
  (:tags (recognize-template-tags-with-order query-text)))

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
  "Reconcile `query-pair` (tags parsed from the current query text) with `existing-pair` (the tags
  previously saved on the stage). Both arguments and the return value are `{:tags <map> :order <vec>}`
  pairs.

  - When exactly one tag was removed and exactly one was added, treat it as a rename, preserving the
    old tag's position (and thus its id-derived identity).
  - Otherwise, drop removed tags and append newly-added ones at the end, in query-text order.

  The returned `:order` is always a permutation of the keys of `:tags`."
  [query-pair existing-pair]
  (let [{query-tags :tags, query-order :order} query-pair
        {existing-tags :tags, existing-order :order} existing-pair
        query-names    (set (keys query-tags))
        existing-names (set (keys existing-tags))
        new-names      (set/difference query-names existing-names)
        old-names      (set/difference existing-names query-names)]
    (if (and (= (count new-names) 1) (= (count old-names) 1))
      ;; A single rename: keep the existing tag's position, just swap the name.
      (let [old-name (first old-names)
            new-name (first new-names)
            tags     (rename-template-tag existing-tags old-name new-name)
            order    (mapv #(if (= % old-name) new-name %)
                           (or existing-order (keys existing-tags)))]
        {:tags (update-vals tags finish-tag) :order order})
      ;; Add and/or drop. Existing tags keep their positions; new tags are appended in query order.
      (let [kept-order  (filterv (complement old-names) (or existing-order (keys existing-tags)))
            added-order (filterv new-names (or query-order (keys query-tags)))
            tags        (merge (m/remove-keys old-names existing-tags)
                               (m/filter-keys new-names query-tags))]
        {:tags (update-vals tags finish-tag) :order (into kept-order added-order)}))))

(defn- extract-snippet-tags
  "Expand snippet references found in `direct` (a `{:tags :order}` pair). Returns a new pair with any
  template tags defined inside referenced snippets merged in.

  Preserves the precedence of the previous implementation: snippet-defined tags override direct tags with
  the same name (as `(merge direct snippet)` did), and nested snippets are expanded breadth-first. Tag-name
  order is preserved: direct tags keep their positions, and newly-discovered snippet tags are appended in
  discovery order."
  [metadata-providerable {:keys [tags] :as direct}]
  (let [direct-order (or (:order direct) (into [] (keys tags)))
        ;; initial snippet *names* to expand, in direct-tag order
        init-queue (into []
                         (keep #(when (= (:type (tags %)) :snippet)
                                  (:snippet-name (tags %))))
                         direct-order)]
    (loop [queue         init-queue  ; FIFO vector of snippet *names* still to expand
           seen-snippets #{}          ; snippet names already expanded
           out-tags      tags
           out-order     direct-order
           order-set     (set direct-order)]
      (if (empty? queue)
        {:tags out-tags :order out-order}
        (let [snippet-name (first queue)
              queue        (subvec queue 1)]
          (if (contains? seen-snippets snippet-name)
            (recur queue seen-snippets out-tags out-order order-set)
            (let [snippet-tags   (:template-tags
                                  (lib.metadata/native-query-snippet-by-name metadata-providerable snippet-name))
                  seen-snippets  (conj seen-snippets snippet-name)
                  {:keys [queue out-tags out-order order-set]
                   :as   _acc} (reduce
                                (fn [{:keys [queue out-tags out-order order-set]} [nm tag]]
                                  (let [queue'    (if (= (:type tag) :snippet)
                                                    (conj queue (:snippet-name tag))
                                                    queue)
                                        ;; snippet-defined tags override earlier definitions, matching prior
                                        ;; `(merge direct snippet)` precedence.
                                        out-tags' (assoc out-tags nm tag)
                                        new?      (not (contains? order-set nm))]
                                    {:queue     queue'
                                     :out-tags  out-tags'
                                     :out-order (if new? (conj out-order nm) out-order)
                                     :order-set (if new? (conj order-set nm) order-set)}))
                                {:queue queue :out-tags out-tags :out-order out-order :order-set order-set}
                                (seq snippet-tags))]
              (recur queue seen-snippets out-tags out-order order-set))))))))

(defn- add-snippet-ids [metadata-providerable template-tags]
  (update-vals template-tags
               (fn [{tag-type :type, :keys [snippet-name], :as tag}]
                 (cond-> tag
                   ;; A snippet can be referenced by a previous name. If it cannot be found, preserve the previous `snippet-id`.
                   (= tag-type :snippet) (m/assoc-some :snippet-id
                                                       (:id (lib.metadata/native-query-snippet-by-name metadata-providerable snippet-name)))))))

(mu/defn extract-template-tags-with-order
  "Like [[extract-template-tags]], but also returns the explicit display ordering of the tags.

  Returns `{:template-tags <map>, :template-tags-order <vector>}`, where `:template-tags-order` lists the
  tag names in the order they should be displayed, independent of Clojure map iteration order.

  If an `existing-order` is supplied (the stage's current `:template-tags-order`), it is preserved for
  tags that survive, so re-extracting tags from unchanged text -- or editing it -- does not reshuffle the
  widgets. See https://github.com/metabase/metabase/issues/5136"
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string]
   (extract-template-tags-with-order metadata-providerable query-text nil nil))
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string
    existing-tags         :- [:maybe ::lib.schema.template-tag/template-tag-map]]
   (extract-template-tags-with-order metadata-providerable query-text existing-tags nil))
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string
    existing-tags         :- [:maybe ::lib.schema.template-tag/template-tag-map]
    existing-order        :- [:maybe [:sequential ::lib.schema.template-tag/name]]]
   (let [direct-pair (recognize-template-tags-with-order query-text)
         query-pair  (extract-snippet-tags metadata-providerable direct-pair)]
     (if (or (seq (:tags query-pair)) (seq existing-tags))
       (let [{:keys [tags order]} (unify-template-tags query-pair {:tags existing-tags :order existing-order})]
         {:template-tags      (add-snippet-ids metadata-providerable tags)
          :template-tags-order order})
       {:template-tags {} :template-tags-order []}))))

(mu/defn extract-template-tags :- ::lib.schema.template-tag/template-tag-map
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  Given the text of a native query, extract a possibly-empty set of template tag strings from it.

  These looks like mustache templates. For variables, we only allow alphanumeric characters, eg. `{{foo}}`.
  For snippets they start with `snippet:`, eg. `{{ snippet: arbitrary text here }}`.
  And for card references either `{{ #123 }}` or with the optional human label `{{ #123-card-title-slug }}`.

  Invalid patterns are simply ignored, so something like `{{&foo!}}` is just disregarded.

  This finds in tags from snippets and assigns snippet-ids.

  Returns the tags as a map. When you also need the display ordering (you usually do, for rendering), use
  [[extract-template-tags-with-order]]."
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string]
   (extract-template-tags metadata-providerable query-text nil))
  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    query-text            :- ::common/non-blank-string
    existing-tags         :- [:maybe ::lib.schema.template-tag/template-tag-map]]
   (:template-tags (extract-template-tags-with-order metadata-providerable query-text existing-tags nil))))

(defn- assert-native-stage [stage]
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
         (assert-native-stage (lib.util/query-stage query 0))
         (assert (empty? missing-keys)
                 (i18n/tru "Missing extra, required keys for native query: {0}"
                           (pr-str missing-keys)))
         result)))))

(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a MBQL 5 query with a first stage that is a native query."
  ([metadata-providerable     :- ::lib.schema.metadata/metadata-providerable
    sql-or-other-native-query :- ::common/non-blank-string]
   (native-query metadata-providerable sql-or-other-native-query nil nil))

  ([metadata-providerable     :- ::lib.schema.metadata/metadata-providerable
    sql-or-other-native-query :- ::common/non-blank-string
    results-metadata          :- [:maybe ::lib.schema.metadata/stage]
    native-extras             :- [:maybe ::native-extras]]
   (let [{:keys [template-tags template-tags-order]}
         (extract-template-tags-with-order metadata-providerable sql-or-other-native-query)]
     (cond-> (lib.query/query-with-stages metadata-providerable
                                          [{:lib/type            :mbql.stage/native
                                            :lib/stage-metadata  results-metadata
                                            :template-tags       template-tags
                                            :template-tags-order template-tags-order
                                            :native              sql-or-other-native-query}])
       native-extras (with-native-extras native-extras)))))

(mu/defn with-different-database :- ::lib.schema/query
  "Changes the database for this query. The first stage must be a native type.
   Native extras must be provided if the new database requires it."
  [query :- ::lib.schema/query
   metadata-provider :- ::lib.schema.metadata/metadata-providerable]
  (assert-native-stage (lib.util/query-stage query 0))
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
   (fn [{existing-tags :template-tags existing-order :template-tags-order :as stage}]
     (assert-native-stage stage)
     (let [{:keys [template-tags template-tags-order]}
           (extract-template-tags-with-order query inner-query existing-tags existing-order)]
       (assoc stage
              :native              inner-query
              :template-tags       template-tags
              :template-tags-order template-tags-order)))))

(mu/defn with-template-tags :- ::lib.schema/query
  "Updates the native query's template tags.

  This only updates existing tags (tags in `updated-tags` that aren't already on the query are ignored),
  and preserves their display positions; initializing a query with [[native-query]] populates tags
  automatically via [[extract-template-tags]]. To reorder tags, use [[with-template-tags-order]]."
  [query        :- ::lib.schema/query
   updated-tags :- ::lib.schema.template-tag/template-tag-map]
  (letfn [(update-stage [stage]
            (assert-native-stage stage)
            (let [existing-tags   (:template-tags stage)
                  ;; keep only updates that target existing tags
                  updates         (reduce-kv
                                   (fn [m k v]
                                     (let [k (lib.params.parse/match-and-normalize-tag-name k)]
                                       (cond-> m
                                         (contains? existing-tags k) (assoc k v))))
                                   {}
                                   updated-tags)
                  ;; merge in the existing tags that weren't updated
                  final-tags      (reduce-kv
                                   (fn [m k v]
                                     (cond-> m (not (contains? m k)) (assoc k v)))
                                   updates
                                   existing-tags)
                  ;; preserve existing order; append any genuinely-new tag names at the end
                  existing-order  (or (:template-tags-order stage) (keys existing-tags))
                  order-set       (set existing-order)
                  final-order     (reduce
                                   (fn [o k]
                                     (cond-> o (not (contains? order-set k)) (conj k)))
                                   (vec existing-order)
                                   (keys final-tags))]
              (-> stage
                  (assoc :template-tags final-tags :template-tags-order final-order)
                  (->> (lib.normalize/normalize ::lib.schema/stage.native)))))]
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

(mu/defn template-tags-order :- [:maybe [:sequential ::lib.schema.template-tag/name]]
  "Returns the explicit display order of the native query's template tags as a vector of tag names, or
  `nil` if none has been recorded. Prefer [[template-tags-in-order]] for rendering, which falls back to
  map iteration order when this is absent."
  [query :- ::lib.schema/query]
  (:template-tags-order (lib.util/query-stage query 0)))

(mu/defn template-tags-in-order :- [:sequential ::lib.schema.template-tag/template-tag]
  "Returns the native query's template tags as a vector, in display order.

  Uses the stage's `:template-tags-order` when present so filter widgets render in a stable,
  user-controllable order regardless of how many tags the query has. When no explicit order is recorded
  (e.g. for older queries that predate this), falls back to template-tag map iteration order, which is at
  least stable for a given set of tags. See https://github.com/metabase/metabase/issues/5136."
  [query :- ::lib.schema/query]
  (let [stage (lib.util/query-stage query 0)
        tags  (:template-tags stage)
        order (:template-tags-order stage)]
    (if (and (seq tags) (seq order))
      ;; `order` is expected to be a permutation of (keys tags); `keep` tolerates any drift.
      (into [] (keep tags) order)
      (into [] (vals tags)))))

(mu/defn with-template-tags-order :- ::lib.schema/query
  "Sets the explicit display order of the native query's template tags.

  `order` must contain every current template tag name exactly once (a permutation). This is what makes
  reordering SQL template-tag filter widgets possible -- previously order was derived from Clojure map
  iteration order, which scrambled past 8 tags and ignored reordering entirely.
  See https://github.com/metabase/metabase/issues/5136."
  [query :- ::lib.schema/query
   order :- [:sequential ::lib.schema.template-tag/name]]
  (lib.util/update-query-stage
   query 0
   (fn [stage]
     (assert-native-stage stage)
     (let [tag-names (set (keys (:template-tags stage)))
           order     (mapv #(lib.params.parse/match-and-normalize-tag-name %) order)]
       (assert (= (set order) tag-names)
               (i18n/tru "template-tags-order must be a permutation of the template tag names; got {0}, expected {1}"
                         (pr-str order) (pr-str (sort tag-names))))
       (assoc stage :template-tags-order order)))))

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
  (assert-native-stage (lib.util/query-stage query 0))
  (= :write (:native-permissions (lib.metadata/database query))))

(mu/defn- validate-template-tag :- [:sequential [:map [:error/message :string] [:tag-name :string]]]
  "Validate a single template tag, returning a list of errors."
  [_query {tag-type :type tag-name :name, :keys [display-name dimension table-id]}]
  (cond-> []
    (empty? display-name)
    (conj {:error/message (i18n/tru "Missing widget label: {0}" tag-name)
           :tag-name tag-name})

    (and (#{:dimension :temporal-unit} tag-type) (nil? dimension))
    (conj {:error/message (i18n/tru "The variable \"{0}\" needs to be mapped to a field." tag-name)
           :tag-name tag-name})

    (and (#{:table} tag-type) (nil? table-id))
    (conj {:error/message (i18n/tru "The variable \"{0}\" needs to be mapped to a table." tag-name)
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
  (assert-native-stage (lib.util/query-stage query 0))
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

(mu/defn native-query-table-references :- [:set [:map [:table ::lib.schema.id/table]]]
  "Given a native query, find any table tags and convert them to {:table id} objects"
  [query]
  (let [tags (->> (lib.walk.util/all-template-tags query)
                  (filter #(= (:type %) :table)))]
    (into #{}
          (map (fn [{:keys [table-id]}]
                 {:table table-id}))
          tags)))
