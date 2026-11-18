(ns metabase.revisions.models.revision
  (:require
   [clojure.data :as data]
   [malli.core :as mc]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.explorations.schema]
   [metabase.measures.schema]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision.diff :as revision.diff :refer [diff-strings*]]
   [metabase.segments.schema]
   [metabase.transforms.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defn toucan-model?
  "Check if `model` is a toucan model."
  [model]
  (isa? model :metabase/model))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions
  will be deleted."
  15)

(defmulti serialize-instance
  "Prepare an instance for serialization in a Revision."
  {:arglists '([model id instance])}
  mi/dispatch-on-model)

;;; no default implementation for [[serialize-instance]]; models need to implement this themselves.

(defmulti revert-to-revision!
  "Return an object to the state recorded by `serialized-instance`."
  {:arglists '([model id user-id serialized-instance])}
  mi/dispatch-on-model)

(defmethod revert-to-revision! :default
  [model id _user-id serialized-instance]
  (let [valid-columns   (keys (revisions.db/raw-row model id))
        ;; Only include fields that we know are on the model in the current version of Metabase! Otherwise we'll get
        ;; an error if a field in an earlier version has since been dropped, but is still present in the revision.
        ;; This is best effort — other kinds of schema changes could still break the ability to revert successfully.
        revert-instance (select-keys serialized-instance valid-columns)]
    (revisions.db/update-entity! id {:model model :row revert-instance})))

(defmulti diff-map
  "Return a map describing the difference between `object-1` and `object-2`."
  {:arglists '([model object-1 object-2])}
  mi/dispatch-on-model)

(defmethod diff-map :default
  [_model o1 o2]
  (when o1
    (let [[before after] (data/diff o1 o2)]
      {:before before
       :after  after})))

(defmulti diff-strings
  "Return a seq of string describing the difference between `object-1` and `object-2`, naming the Collections and
  Dashboards they moved between from `names` (see [[readable-names]]).

  Each string in the seq should be i18n-ed."
  {:arglists '([model object-1 object-2 names])}
  mi/dispatch-on-model)

(defmethod diff-strings :default
  [model o1 o2 names]
  (diff-strings* (name model) o1 o2 names))

(mr/def ::names
  "The names of the Collections, Dashboards and data-test subjects the current user can read, by id, for revision
  descriptions. `:subject-names` is keyed by model, then id."
  [:map {:closed true}
   [:collection-names [:map-of pos-int? :string]]
   [:dashboard-names  [:map-of pos-int? :string]]
   [:subject-names    [:map-of :keyword [:map-of pos-int? :string]]]])

(mu/defn readable-names :- ::names
  "The names of the Collections, Dashboards and data-test subjects that the revision `objects` reference and the
  current user can read, loaded and checked together."
  [objects :- [:sequential [:fn {:error/message "a revision object"} map?]]]
  (let [ids   (fn [k] (into [] (comp (keep k) (filter pos-int?) (distinct)) objects))
        names (fn [rows]
                (into {} (map (juxt :id :name)) (mi/readable rows)))]
    {:collection-names (names (revisions.db/collections-by-ids (ids :collection_id)))
     :dashboard-names  (names (revisions.db/dashboards-by-ids (ids :dashboard_id)))
     :subject-names    (into {}
                             (keep (fn [[k model]]
                                     (when-let [subject-ids (not-empty (ids k))]
                                       [model (names (revisions.db/entities-by-ids model subject-ids))])))
                             revision.diff/data-test-subject-models)}))

(defmulti revision-readable?
  "Whether the current user may see the revision whose serialized snapshot is `object`. Defaults to true: a caller
  who can read an object's current row can read its whole revision history. Models whose snapshots carry
  data-permission-sensitive definitions override this to authorize each snapshot on its own terms."
  {:arglists '([model object])}
  mi/dispatch-on-model)

(defmethod revision-readable? :default
  [_model _object]
  true)

(defmulti revisions-readable?
  "Whether the current user may see each of the revisions whose serialized snapshots are `objects`, as a vector of
  booleans in the order of `objects`. Defaults to [[revision-readable?]] of each; models whose check reads the app DB
  override this to answer the whole list at once."
  {:arglists '([model objects])}
  mi/dispatch-on-model)

(defmethod revisions-readable? :default
  [model objects]
  (mapv #(boolean (revision-readable? model %)) objects))

(defmulti check-revert-available
  "Throw a 402 unless the token has the premium feature that a revert of `model` to a revision needs. The default
  throws nothing."
  {:arglists '([model])}
  mi/dispatch-on-model)

(defmethod check-revert-available :default
  [_model]
  nil)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Revision [_model] :revision)

(doto :model/Revision
  (derive :metabase/model)
  (derive :search/indexed))

(t2/deftransforms :model/Revision
  {:object mi/transform-json})

(mu/defn settle-revisions!
  "Clear `most_recent` on the superseded Revisions of `entities`, `[model-name model-id]` pairs, and delete their
  Revisions beyond [[max-revisions]]."
  [entities :- [:sequential [:tuple :string pos-int?]]]
  (when (seq entities)
    (revisions.db/unmark-superseded-revisions! entities)
    (revisions.db/delete-revisions-beyond! entities max-revisions)))

(defn- settle-revisions!*
  "Settle the Revisions of the rows of `items`, `{:model :model_id}` maps, once per row."
  [items]
  (let [entities (into [] (comp (map (juxt :model :model_id)) (distinct)) items)]
    (try
      (settle-revisions! entities)
      (catch Exception e
        (log/errorf "Failed to settle the revisions of %d rows: %s" (count entities) (ex-message e))))))

(defonce ^:private settle-queue
  (delay (grouper/start! #'settle-revisions!*
                         :capacity 500
                         :interval 5000)))

(defn flush-settling!
  "Block until the bookkeeping of every Revision inserted before this call has run."
  []
  (grouper/flush! @settle-queue))

(t2/define-before-insert :model/Revision
  [{:keys [model model_id] :as revision}]
  (mdb/do-after-commit #(grouper/submit! @settle-queue {:model model :model_id model_id}))
  (assoc revision
         :timestamp (or (:timestamp revision) :%now)
         :metabase_version config/mb-version-string
         :most_recent true))

(t2/define-before-update :model/Revision
  [revision]
  (when (seq (dissoc (t2/changes revision) :most_recent))
    (throw (ex-info (tru "You cannot update a Revision!") {:status-code 400})))
  revision)

(t2/define-after-select :model/Revision
  ;; Call the appropriate `post-select` methods (including the type functions) on the `:object` this Revision recorded.
  ;; This is important for things like Card revisions, where the `:dataset_query` property needs to be normalized when
  ;; coming out of the DB.
  [{:keys [model] :as revision}]
  ;; in some cases (such as tests) we have 'fake' models that cannot be resolved normally; don't fail entirely in
  ;; those cases
  (let [model (u/ignore-exceptions (t2.model/resolve-model (symbol model)))]
    (cond-> revision
      ;; For Card revisions, ensure :card_schema is present before calling after-select.
      ;; Old revisions from before v0.55 won't have this field!
      ;; We add the legacy default value to handle these cases.
      (and (= model :model/Card) (map? (:object revision)) (not (:card_schema (:object revision))))
      (update :object assoc :card_schema queries/starting-card-schema-version)

      model (update :object (partial mi/do-after-select model)))))

;;; # Functions

(defn- revision-changes
  [model prev-revision revision names]
  (cond
    (:is_creation revision)  [(deferred-tru "created this")]
    (:is_reversion revision) [(deferred-tru "reverted to an earlier version")]
    ;; We only keep [[revision/max-revisions]] number of revision per entity.
    ;; prev-revision can be nil when we generate description for oldest revision
    (nil? prev-revision)     [(deferred-tru "modified this")]
    :else                    (diff-strings model (:object prev-revision) (:object revision) names)))

(defn- revision-description-info
  [model prev-revision revision names]
  (let [changes (revision-changes model prev-revision revision names)]
    {:description          (if (seq changes)
                             (u/build-sentence changes)
                             ;; HACK: before #30285 we record revision even when there is nothing changed,
                             ;; so there are cases when revision can comeback as `nil`.
                             ;; This is a safe guard for us to not display "Crowberto null" as
                             ;; description on UI
                             (deferred-tru "created a revision with no change."))
     ;; this is used on FE
     :has_multiple_changes (> (count changes) 1)}))

(defn add-revision-details
  "Add enriched revision data such as `:diff` and `:description` as well as filter out some unnecessary props, naming
  Collections and Dashboards from `names`, the [[readable-names]] of the two revisions when not given."
  ([model revision prev-revision]
   (add-revision-details model revision prev-revision
                         (readable-names (into [] (keep :object) [revision prev-revision]))))
  ([model revision prev-revision names]
   (-> revision
       (assoc :diff (diff-map model (:object prev-revision) (:object revision)))
       (merge (revision-description-info model prev-revision revision names))
       ;; add revision user details
       (t2/hydrate :user)
       (update :user select-keys [:id :first_name :last_name :common_name])
       ;; Filter out irrelevant info
       (dissoc :model :model_id :user_id :object))))

(mu/defn revisions
  "Get the revisions for `model` with `id` in reverse chronological order."
  [model :- [:fn toucan-model?]
   id    :- pos-int?]
  (let [model-name (name model)]
    (revisions.db/revisions model-name id)))

(mu/defn revisions+details
  "Fetch `revisions` for `model` with `id` that the current user may see, and add details. Diffs and descriptions
  are computed between consecutive *visible* revisions, so a snapshot the caller is not entitled to never leaks
  through an adjacent revision's diff."
  [model :- [:fn toucan-model?]
   id    :- pos-int?]
  (when-let [revisions (revisions model id)]
    (let [visible (t2/hydrate (into []
                                    (comp (filter first) (map second))
                                    (map vector (revisions-readable? model (map :object revisions)) revisions))
                              :user)
          names   (readable-names (into [] (keep :object) visible))]
      (loop [acc [], [r1 r2 & more] visible]
        (if-not r2
          (conj acc (add-revision-details model r1 nil names))
          (recur (conj acc (add-revision-details model r1 r2 names))
                 (conj more r2)))))))

(def ^:private PushRevisionInput
  (into [:multi {:dispatch :entity}]
        (conj (vec (for [[model schema] revisions.db/revisioned-model-select-schema]
                     [model [:map {:closed true}
                             [:id                            pos-int?]
                             [:object                        schema]
                             [:entity                        [:= model]]
                             [:user-id                       pos-int?]
                             [:is-creation? {:optional true} [:maybe :boolean]]
                             [:message      {:optional true} [:maybe :string]]]]))
              [::mc/default [:map {:closed true}
                             [:id                            pos-int?]
                             [:object                        ::revisions.db/unregistered-model-object]
                             [:entity                        [:fn toucan-model?]]
                             [:user-id                       pos-int?]
                             [:is-creation? {:optional true} [:maybe :boolean]]
                             [:message      {:optional true} [:maybe :string]]]])))

(defn- for-comparison
  "The serialized object `m` of `entity` without what alone is no change to record: a Card's `:card_schema`, a
  technical marker that `revert-to-revision! :model/Card` reads back from the stored object."
  [entity m]
  (cond-> m
    (= entity :model/Card) (dissoc :card_schema)))

(defn- row
  [{:keys [id entity user-id is-creation? message]} serialized-object]
  {:model        (name entity)
   :model_id     id
   :user_id      user-id
   :object       serialized-object
   :is_creation  (boolean is-creation?)
   :is_reversion false
   :message      message})

(defn row-changed?
  "Whether the update of the row of `entity` with `id` from `before` to `after` changes what its Revision records,
  comparing the row alone, without the parts of an aggregate such as a Dashboard's dashcards."
  [entity id before after]
  (let [serialize #(for-comparison entity (serialize-instance entity id (assoc % :dashcards [] :tabs [])))]
    (not= (serialize before) (serialize after))))

(mu/defn revision-row :- [:map [:model :string]]
  "The new Revision row of `entity` with `id`, whose caller knows that it changed, for [[record-revisions!]]."
  [{:keys [id entity object] :as info} :- PushRevisionInput]
  (row info (serialize-instance entity id (dissoc object :message))))

(defn record-revisions!
  "Record the Revisions `rows`, which [[revision-row]] gives, in one statement."
  [rows]
  (revisions.db/insert-revisions! rows))

(def models-recording-own-revert
  "The models whose reversion also writes a Revision of its own update, which the reversion Revision follows."
  #{:model/CardTest :model/SegmentTest :model/TransformTest})

(mu/defn revert!
  "Revert `entity` with `id` to a given Revision."
  [info :- [:map {:closed true}
            [:id          pos-int?]
            [:user-id     pos-int?]
            [:revision-id pos-int?]
            [:entity      [:fn toucan-model?]]]]
  (let [{:keys [id user-id revision-id entity]} info
        model-name (name entity)
        serialized-instance (revisions.db/revision-object model-name id revision-id)]
    (t2/with-transaction [_conn]
      (let [already-in-target-state? (= serialized-instance
                                        (revisions.db/latest-revision-object model-name id))
            own-update?              (contains? models-recording-own-revert entity)
            record-reversion!        #(when-not already-in-target-state?
                                        (revisions.db/insert-revision-returning! {:model        model-name
                                                                                  :model_id     id
                                                                                  :user_id      user-id
                                                                                  :object       serialized-instance
                                                                                  :is_creation  false
                                                                                  :is_reversion true}))
            in-batch                 (events/with-event-context {:reverting? true}
                                       (events/with-batched-events
                                         (revert-to-revision! entity id user-id serialized-instance)
                                         (when-not own-update?
                                           [(revisions.db/latest-revision model-name id) (record-reversion!)])))
            [last-revision new-revision] (or in-batch
                                             [(revisions.db/latest-revision model-name id) (record-reversion!)])]
        (if new-revision
          (add-revision-details entity new-revision last-revision)
          last-revision)))))
