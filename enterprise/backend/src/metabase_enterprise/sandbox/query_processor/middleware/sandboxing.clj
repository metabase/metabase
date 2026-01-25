(ns metabase-enterprise.sandbox.query-processor.middleware.sandboxing
  "Apply segmented a.k.a. sandboxing anti-permissions to the query, i.e. replace sandboxed Tables with the
  appropriate [[metabase-enterprise.sandbox.models.sandbox]]s (Sandboxes). See dox
  for [[metabase.permissions.models.permissions]] for a high-level overview of the Metabase permissions system."
  (:require
   [better-cond.core :as b]
   [medley.core :as m]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase-enterprise.sandbox.models.sandbox :as sandbox]
   [metabase.api.common :as api :refer [*current-user* *current-user-id*]]
   ;; allowed (for now) since sandboxing needs to manipulate legacy metadata
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.util.persisted-cache :as qp.persisted]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; TODO (Cam 9/9/25) -- we should probably kebab-case these when they come in
;;; from [[metabase-enterprise.sandbox.api.util/enforced-sandboxes-for-tables]] for consistency with all of the rest
;;; of the QP code. Or maybe add this to the Metadata Provider (or a special "Enterprise" Metadata Provider)?
(mr/def ::sandbox
  [:map
   [:table_id             ::lib.schema.id/table]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:attribute_remappings {:optional true} [:maybe
                                            [:map-of
                                             #_attribute-name ::lib.schema.common/non-blank-string
                                             #_target         ::lib.schema.parameter/target]]]])

(mu/defn- query->all-table-ids :- [:maybe [:set ::lib.schema.id/table]]
  [query]
  (u/prog1 (lib/all-source-table-ids query)
    (when (seq <>)
      (lib.metadata/bulk-metadata-or-throw query :metadata/table <>))))

(mu/defn assert-one-sandbox-per-table
  "Make sure all referenced Tables have at most one Sandbox."
  [sandboxes :- [:sequential ::sandbox]]
  (doseq [[table-id sandboxes] (group-by :table_id sandboxes)
          :when                (> (count sandboxes) 1)]
    (throw (ex-info (tru "Found more than one group table access policy for user ''{0}''"
                         (:email @*current-user*))
                    {:type      qp.error-type/client
                     :table-id  table-id
                     :sandboxes sandboxes
                     :user      *current-user-id*
                     :group-ids (map :group_id sandboxes)}))))

(mu/defn- tables->sandboxes :- [:maybe [:sequential ::sandbox]]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table-ids             :- [:maybe [:set ::lib.schema.id/table]]]
  (when (seq table-ids)
    (let [thunk (fn []
                  (let [sandboxes (sandbox.api.util/enforced-sandboxes-for-tables table-ids)]
                    (when (seq sandboxes)
                      (assert-one-sandbox-per-table sandboxes)
                      sandboxes)))
          ks    [::tables->sandboxes *current-user-id* table-ids]]
      (lib.metadata/general-cached-value metadata-providerable ks thunk))))

(mu/defn- query->table-id->sandbox :- [:maybe [:map-of ::lib.schema.id/table ::sandbox]]
  [query :- ::lib.schema/query]
  {:pre [(some? *current-user-id*)]}
  (let [table-ids (query->all-table-ids query)
        sandboxes (some->> table-ids (tables->sandboxes query))]
    (when (seq sandboxes)
      (m/index-by :table_id sandboxes))))

(mu/defn- target-field->base-type :- [:maybe ::lib.schema.common/base-type]
  "If the `:target` of a parameter contains a `:field` clause, return the base type corresponding to the Field it
  references. Otherwise returns `nil`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   target-field-clause   :- ::lib.schema.parameter/target]
  ;; parameter targets still use legacy field refs for whatever wacko reason
  (when-let [field-id (lib.util.match/match-lite target-field-clause
                        [:field (field-id :guard pos-int?) _opts] field-id)]
    (:base-type (lib.metadata/field metadata-providerable field-id))))

(defn- attr-value->param-value
  "Take an `attr-value` with a desired `target-type` and coerce to that type if need be. If not type is given or it's
  already correct, return the original `attr-value`"
  [target-type attr-value]
  (let [attr-string? (string? attr-value)]
    (cond
      ;; If the attr-value is a string and the target type is integer, parse it as a long
      (and attr-string? (isa? target-type :type/Integer))
      (parse-long attr-value)
      ;; If the attr-value is a string and the target type is float, parse it as a double
      (and attr-string? (isa? target-type :type/Float))
      (parse-double attr-value)
      ;; No need to parse it if the type isn't numeric or if it's already a number
      :else
      attr-value)))

(defn- attr-remapping->parameter [metadata-providerable login-attributes [attr-name target]]
  (let [attr-value      (get login-attributes attr-name)
        field-base-type (target-field->base-type metadata-providerable target)]
    (when (not attr-value)
      (throw (ex-info (tru "Query requires user attribute `{0}`" (name attr-name))
                      {:type qp.error-type/missing-required-parameter})))
    {:type   :category
     :target target
     :value  (attr-value->param-value field-base-type attr-value)}))

(mu/defn- sandbox->parameters :- [:maybe [:sequential ::lib.schema.parameter/parameter]]
  [metadata-providerable                        :- ::lib.schema.metadata/metadata-providerable
   {attribute-remappings :attribute_remappings} :- ::sandbox]
  (mapv (partial attr-remapping->parameter metadata-providerable (api/current-user-attributes))
        attribute-remappings))

(mu/defn- preprocess-query :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (try
    (lib/without-cleaning
     (fn []
       (let [preprocess (requiring-resolve 'metabase.query-processor.preprocess/preprocess)]
         (request/as-admin
           ;; preprocessing normally loses metadata attached to the last stage, since legacy MBQL syntax does not
           ;; support it and preprocessing roundtrips to legacy and back a few times... to make sure it's preserved,
           ;; append an extra dummy stage before preprocessing and then toss it when we're done.
           (-> query
               lib/append-stage
               preprocess
               (update :stages pop))))))
    (catch Throwable e
      (throw (ex-info (tru "Error preprocessing query when applying Sandbox: {0}" (ex-message e))
                      {:query query}
                      e)))))

(mu/defn card-id->underlying-query :- ::lib.schema/query
  "Return the source query info for Card with `card-id`. Pass true as the optional second arg `log?` to enable
  logging. (The circularity check calls this and will print more than desired)"
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id               :- ::lib.schema.id/card]
  (let [;; todo: we need to cache this. We are running this in preprocess, compile, and then again
        card           (or (lib.metadata/card metadata-providerable card-id)
                           (throw (ex-info (tru "Card {0} does not exist." card-id)
                                           {:card-id card-id})))
        persisted-info (:lib/persisted-info card)
        persisted?     (qp.persisted/can-substitute? card persisted-info)
        query          (lib/card->underlying-query metadata-providerable card)]
    ;; log the query at this point, it's useful for some purposes
    (log/debugf "Fetched query from Card %s:\n%s" card-id (u/cprint-to-str (select-keys query [:stages :parameters])))
    (cond-> query
      ;; This will be applied, if still appropriate, by the persistence middleware
      persisted?
      (assoc :persisted-info/native
             (qp.persisted/persisted-info-native-query
              (u/the-id (lib.metadata/database metadata-providerable))
              persisted-info)))))

(mu/defn- card-sandbox->query :- ::lib.schema/query
  [metadata-providerable          :- ::lib.schema.metadata/metadata-providerable
   {card-id :card_id :as sandbox} :- ::sandbox]
  (update (card-id->underlying-query metadata-providerable card-id)
          :parameters
          concat
          (sandbox->parameters metadata-providerable sandbox)))

(mu/defn- table-sandbox->query :- ::lib.schema/query
  [metadata-providerable             :- ::lib.schema.metadata/metadata-providerable
   {table-id :table_id, :as sandbox} :- ::sandbox]
  (-> (lib/query metadata-providerable (lib.metadata/table metadata-providerable table-id))
      (assoc :parameters (sandbox->parameters metadata-providerable sandbox))))

(mu/defn- native-query-metadata :- [:maybe [:sequential {:min 1} ::mbql.s/legacy-column-metadata]]
  [query :- ::lib.schema/query]
  (let [result
        ;; Rebind *result* in case the outer query is being streamed back to the client. The streaming code binds this
        ;; to a custom handler, and we don't want to accidentally terminate the stream here!
        (binding [qp.pipeline/*result* qp.pipeline/default-result-handler]
          (request/as-admin
            ((requiring-resolve 'metabase.query-processor/process-query)
             query)))]
    (when-not (= (:status result) :completed)
      (throw (ex-info "Error running query to determine metadata"
                      {:query query, :result result})))
    (-> result :data :results_metadata :columns not-empty)))

(mu/defn- ensure-native-queries-have-metadata :- ::lib.schema/query
  "Add `:source-metadata` to a `source-query` if needed. If the source metadata had to be resolved (because Card with
  `card-id`) didn't already have it, save it so we don't have to resolve it again next time around."
  [query   :- ::lib.schema/query
   card-id :- [:maybe ::lib.schema.id/card]]
  (or (when (= (count (:stages query)) 1)
        (let [first-stage (lib.util/query-stage query 0)]
          (when (and (lib.util/native-stage? first-stage)
                     (not (:lib/stage-metadata first-stage)))
            (when-let [cols (not-empty (native-query-metadata query))]
              (when card-id
                (log/infof "Saving results metadata for Sandbox Card %d" card-id)
                ;; TODO (Cam 9/9/25) -- we should switch to saving Lib-style metadata in the app DB instead of legacy
                ;; style in the near future
                (t2/update! :model/Card card-id {:result_metadata cols}))
              (lib/update-query-stage query 0 assoc :lib/stage-metadata (lib/->normalized-stage-metadata cols))))))
      query))

(mu/defn- sandbox->query :- ::lib.schema/query
  "Get the query associated with a `sandbox`."
  [metadata-providerable           :- ::lib.schema.metadata/metadata-providerable
   {card-id :card_id, :as sandbox} :- ::sandbox]
  (-> ((if card-id
         card-sandbox->query
         table-sandbox->query) metadata-providerable sandbox)
      (ensure-native-queries-have-metadata card-id)
      (assoc-in [:middleware :disable-remaps?] true)
      preprocess-query))

(defn- project-only-columns-from-original-table
  "A sandbox query is only allowed to return columns returned by the original table. If the sandbox query returns
  anything else, log a warning telling people this is officially unsupported, then add a new stage to the query with
  `:fields` to only select the allowed columns.

  We probably should have had this error from day 1 but now there are sandboxes in the wild that do this so I guess we
  just have to work around them going forward."
  [metadata-providerable sandbox-query original-table-id]
  (let [sandbox-cols (lib/returned-columns sandbox-query)
        table-cols   (lib.metadata/fields metadata-providerable original-table-id)
        fixed-cols   (remove (fn [{:keys [table-id], :as sandbox-col}]
                               (b/cond
                                 (and table-id
                                      (not= table-id original-table-id))
                                 (do
                                   (log/errorf (str "Sandboxes can only include columns from the original Table (%d),"
                                                    " query included %s from Table %d. This is unsupported and may not"
                                                    " work in the future.")
                                               original-table-id
                                               (pr-str (:name sandbox-col))
                                               table-id)
                                   true)

                                 :let [matching-table-col (m/find-first #(= (:name %)
                                                                            (:name sandbox-col))
                                                                        table-cols)]
                                 (not matching-table-col)
                                 (do
                                   (log/errorf (str "Sandboxes can only include columns from the original Table,"
                                                    " but query included %s. This is unsupported and may not work in"
                                                    " the future.")
                                               (pr-str (:name sandbox-col)))
                                   true)

                                 :else
                                 (do
                                   ;; this will throw an exception if types don't match up
                                   (sandbox/check-column-types-match sandbox-col matching-table-col)
                                   false)))
                             sandbox-cols)]
    (if (= fixed-cols sandbox-cols)
      sandbox-query
      (do
        (log/warn "Adding additional stage to query to work around bad sandbox with extra columns")
        (-> sandbox-query
            lib/append-stage
            (lib/with-fields (map lib/update-keys-for-col-from-previous-stage fixed-cols)))))))

(defn- merge-original-table-metadata [native-cols original-table-cols]
  (into []
        (keep (fn [table-col]
                (when-let [native-col (m/find-first #(= (:name %) (:name table-col))
                                                    native-cols)]
                  (merge native-col table-col))))
        original-table-cols))

(mu/defn- apply-sandbox-to-stage :- [:and
                                     [:sequential {:min 1} ::lib.schema/stage]
                                     ::lib.schema.util/unique-uuids]
  "Apply a Sandbox to a `stage`, returning a vector of replacement stages."
  [query                            :- ::lib.schema/query
   path                             :- ::lib.walk/path
   {:keys [source-table] :as stage} :- ::lib.schema/stage
   sandbox                          :- ::sandbox]
  (let [sandbox-query      (sandbox->query query sandbox)
        sandbox-query      (project-only-columns-from-original-table query sandbox-query source-table)
        new-source-stages  (mapv (fn [stage]
                                   (-> stage
                                       (assoc :query-permissions/sandboxed-table source-table)
                                       lib/fresh-uuids))
                                 (:stages sandbox-query))
        ;; merge stage metadata in the last source stage if needed
        new-source-stages  (m/update-existing-in new-source-stages
                                                 [(dec (count new-source-stages)) :lib/stage-metadata :columns]
                                                 (fn [cols]
                                                   (merge-original-table-metadata
                                                    cols
                                                    (lib/returned-columns query (lib.metadata/table query source-table)))))
        is-stage-in-join?  (->> path          ; [:stages 0 :joins 0 :stages 0]
                                (drop-last 3) ; [:stages 0 :joins]
                                last
                                (= :joins))
        ;; don't add a new additional stage IF WE'RE RECURSING INTO A JOIN and it only contains `:fields` and the last
        ;; of the `new-source-stages` already contains `:fields` anyway... the `:fields` for the join will just
        ;; basically be `SELECT *`, so at best this is completely unnecessary and at worst it can cause query failures
        ;; because the stuff in `:fields` can be wrong if some of those fields have been filtered out by the
        ;; sandbox (see #66781)
        skip-final-stage?  (and is-stage-in-join?
                                (:fields (last new-source-stages))
                                (empty? (->> (keys stage)
                                             (remove #{:source-table :fields})
                                             (remove qualified-keyword?))))
        replacement-stages (cond-> new-source-stages
                             (not skip-final-stage?) (conj (dissoc stage :source-table)))]
    (log/tracef "Applied Sandbox: replaced stage\n\n%s\n\nwith stages\n\n%s"
                (u/cprint-to-str stage)
                (u/cprint-to-str replacement-stages))
    replacement-stages))

(mu/defn- apply-sandboxes :- ::lib.schema/query
  "Replace `:source-table` entries that refer to Tables for which we have applicable Sandboxes with `:source-query`
  entries from their Sandboxes."
  [query             :- ::lib.schema/query
   table-id->sandbox :- [:map-of ::lib.schema.id/table ::sandbox]]
  ;; replace stages that have `:source-table` key and a matching entry in `table-id->sandbox`, but do not have
  ;; `::sandbox?` key
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (when (and (= (:lib/type stage) :mbql.stage/mbql)
                (:source-table stage)
                (not (::sandbox? stage)))
       (when-let [sandbox (get table-id->sandbox (:source-table stage))]
         ;; add a `::sandbox?` key to each replacement stage that has `:source-table?` so when we do a second pass after
         ;; adding JOINs they don't get processed again
         (mapv (fn [stage]
                 (cond-> stage
                   (:source-table stage) (assoc ::sandbox? true)))
               (apply-sandbox-to-stage query path stage sandbox)))))))

(mu/defn- expected-cols :- [:sequential ::mbql.s/legacy-column-metadata]
  [query :- ::lib.schema/query]
  (mapv lib/lib-metadata-column->legacy-metadata-column
        (lib.metadata.result-metadata/returned-columns query)))

(defn- sandboxed-query
  "Apply Sandboxes to `query` and return the updated version of `query`."
  [original-query table-id->sandbox]
  (let [sandboxed-query (apply-sandboxes original-query table-id->sandbox)]
    (if (= sandboxed-query original-query)
      original-query
      (assoc sandboxed-query ::original-metadata (expected-cols original-query)))))

(mu/defn- apply-sandboxing* :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (or (when (not api/*is-superuser?*)
        (when-let [table-id->sandbox (when *current-user-id*
                                       (query->table-id->sandbox query))]
          (premium-features/assert-has-feature :sandboxes (tru "Sandboxing"))
          (sandboxed-query query table-id->sandbox)))
      query))

(defenterprise apply-sandboxing
  "Pre-processing middleware. Replaces source tables a User was querying against with source queries that (presumably)
  restrict the rows returned, based on presence of sandboxes."
  ;; run this even when the `:sandboxes` feature is not enabled, so that we can assert that it *is* enabled if
  ;; sandboxing is configured. (Throwing here is better than silently ignoring the configured sandbox.)
  :feature :none
  [query]
  (apply-sandboxing* query))

;;;; Post-processing

(mu/defn- merge-metadata :- [:map
                             [:cols [:sequential ::mbql.s/legacy-column-metadata]]]
  "Merge column metadata from the non-sandboxed version of the query into the sandboxed results `metadata`. This way the
  final results metadata coming back matches what we'd get if the query was not running in a sandbox."
  [original-metadata :- [:sequential ::mbql.s/legacy-column-metadata]
   metadata          :- [:map
                         [:cols [:sequential ::mbql.s/legacy-column-metadata]]]]
  (letfn [(merge-cols [cols]
            (let [col-name->expected-col (m/index-by :name original-metadata)]
              (for [col cols]
                (merge
                 col
                 (get col-name->expected-col (:name col))))))]
    (update metadata :cols merge-cols)))

(defenterprise merge-sandboxing-metadata
  "Post-processing middleware. Merges in column metadata from the original, unsandboxed version of the query."
  :feature :sandboxes
  [{::keys [original-metadata] :as query} rff]
  (fn merge-sandboxing-metadata-rff* [metadata]
    (let [metadata (assoc metadata :is_sandboxed (lib.util.match/match-lite query
                                                   {:query-permissions/sandboxed-table (_ :guard some?)} true))
          metadata (if original-metadata
                     (merge-metadata original-metadata metadata)
                     metadata)]
      (rff metadata))))
