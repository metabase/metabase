(ns metabase.events.lifecycle
  "The `:hook/events` trait: a model deriving it publishes `:event/<name>-create`, `-update` and `-delete` for every
  write of its rows by any writer, inside the transaction of the write."
  (:require
   [metabase.events.batch :as events.batch]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]
   [toucan2.tools.before-delete :as t2.before-delete]))

(set! *warn-on-reflection* true)

(defn- model-of
  "The model keyword of `model`, which a write may give as an instance."
  [model]
  (let [model (t2/resolve-model model)]
    (if (keyword? model) model (t2/model model))))

(defn- collect!
  [model operation row extra]
  (events.batch/collect! (merge {:model     model
                                 :operation operation
                                 :id        (first (vals (t2.model/primary-key-values-map row)))
                                 :user-id   (mi/current-user-id)}
                                extra)))

(t2/define-after-insert :hook/events
  [instance]
  (collect! (model-of &model) :create instance {:object (t2.realize/realize instance)})
  instance)

(defn- settled
  "The row `object` as the update will leave it, with the `:updated_at` that a timestamp hook set as an SQL expression
  to be evaluated by the database taken from the `previous-object`."
  [object previous-object]
  (cond-> object
    (let [updated-at (:updated_at object)]
      (or (keyword? updated-at) (vector? updated-at))) (assoc :updated_at (:updated_at previous-object))))

(t2/define-before-update :hook/events
  [instance]
  (when (seq (t2/changes instance))
    (let [model    (model-of &model)
          previous (t2/instance model (t2.realize/realize (t2/original instance)))]
      (collect! model :update instance {:object          (settled (t2.realize/realize instance) previous)
                                        :previous-object previous})))
  instance)

(t2/define-before-delete :hook/events
  [instance]
  instance)

(methodical/defmethod t2.before-delete/before-delete :before :hook/events
  [model instance]
  (collect! (model-of model) :delete instance {:previous-object (t2.realize/realize instance)})
  instance)

(methodical/defmethod t2.pipeline/build :before [:toucan.query-type/delete.* :hook/events :default]
  "Run the captures of the rows of a DELETE once for the statement, after its before-delete hooks and before it runs."
  [_query-type _model _parsed-args resolved-query]
  (events.batch/capture-deletes!)
  resolved-query)

(defmacro ^:private define-write-batch
  [query-type]
  `(methodical/defmethod t2.pipeline/transduce-query :around [~query-type :hook/events :default]
     [rf# query-type# model# parsed-args# resolved-query#]
     (events.batch/do-with-write-batch
      #(~'next-method rf# query-type# model# parsed-args# resolved-query#))))

(define-write-batch :toucan.query-type/insert.*)
(define-write-batch :toucan.query-type/update.*)

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/delete.* :hook/events :default]
  [rf query-type model parsed-args resolved-query]
  (events.batch/do-with-write-batch
   (fn []
     (let [model* (model-of model)]
       (events.batch/do-with-delete-statement
        model*
        (first (t2/primary-keys model*))
        (fn [columns]
          (t2.pipeline/transduce-query (t2.pipeline/default-rf :toucan.query-type/select.instances)
                                       :toucan.query-type/select.instances
                                       model*
                                       (assoc (dissoc parsed-args :queryable) :columns columns)
                                       resolved-query))
        #(next-method rf query-type model parsed-args resolved-query))))))

(mi/prefer-hook-trait! :hook/events)

(defn- as-rows
  "`rows`, one row or a sequence of them, as a sequence."
  [rows]
  (if (map? rows) [rows] rows))

(mu/defn created!
  "Collect the create event of each of `rows`, one row or a sequence, of `model`, rows as the insert returned them, in
  the batch there is or a new one, which a converted model's after-insert hook calls as the `:hook/events` trait does."
  [model :- :keyword
   rows  :- [:or :map [:sequential :map]]]
  (events.batch/do-with-write-batch
   (fn []
     (doseq [row (as-rows rows)
             :let [row (t2/instance model (t2.realize/realize row))]]
       (collect! model :create row {:object row})))))

(mu/defn updated!
  "Collect the update event of `row` of `model`, the row as the update leaves it, or its changes, over `previous-row`,
  the row before it, when a column differs, which a write function calls after its update as the `:hook/events` trait
  does in one."
  [model        :- :keyword
   row          :- :map
   previous-row :- :map]
  (let [previous (t2/instance model (t2.realize/realize previous-row))
        object   (t2/instance model (settled (merge previous (t2.realize/realize row)) previous))]
    (when (not= object previous)
      (events.batch/do-with-write-batch
       #(collect! model :update object {:object object :previous-object previous})))))

(mu/defn deleting!
  "Run `thunk`, which deletes `rows`, one row or a sequence of loaded rows of `model`, as one DELETE statement of the
  batch, as the `:hook/events` trait runs one: its statement captures, then the delete events, then its captures, then
  `thunk`, returning what `thunk` returns."
  [model :- :keyword
   rows  :- [:or :map [:sequential :map]]
   thunk :- ifn?]
  (let [rows (mapv #(t2/instance model (t2.realize/realize %)) (as-rows rows))]
    (events.batch/do-with-write-batch
     (fn []
       (events.batch/do-with-delete-statement
        model
        (first (t2/primary-keys model))
        (fn [columns]
          (mapv #(select-keys % columns) rows))
        (fn []
          (doseq [row rows]
            (collect! model :delete row {:previous-object row}))
          (events.batch/capture-deletes!)
          (thunk)))))))
