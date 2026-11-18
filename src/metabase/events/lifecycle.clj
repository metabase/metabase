(ns metabase.events.lifecycle
  "The `:hook/events` trait: a model deriving it publishes `:event/<name>-create`, `-update` and `-delete` for every
  write of its rows by any writer, inside the transaction of the write."
  (:require
   [metabase.events.batch :as events.batch]
   [metabase.models.interface :as mi]
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
                                        :previous-object previous
                                        :changed         (set (keys (t2/changes instance)))})))
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
