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
   [toucan2.tools.before-delete :as t2.before-delete]))

(set! *warn-on-reflection* true)

(defn- collect!
  [model operation row extra]
  (events.batch/collect! (merge {:model     model
                                 :operation operation
                                 :id        (first (vals (t2.model/primary-key-values-map row)))
                                 :object    row
                                 :user-id   (mi/current-user-id)}
                                extra)))

(t2/define-after-insert :hook/events
  [instance]
  (collect! &model :create instance nil)
  instance)

(t2/define-before-update :hook/events
  [instance]
  (let [changes (t2/changes instance)]
    (when (seq changes)
      (collect! &model :update instance {:previous-object (t2/original instance)
                                         :changes         changes})))
  instance)

(t2/define-before-delete :hook/events
  [instance]
  instance)

(methodical/defmethod t2.before-delete/before-delete :before :hook/events
  [model instance]
  (collect! model :delete instance {:previous-object instance})
  instance)

(defmacro ^:private define-write-batch
  [query-type]
  `(methodical/defmethod t2.pipeline/transduce-query :around [~query-type :hook/events :default]
     [rf# query-type# model# parsed-args# resolved-query#]
     (events.batch/do-with-batched-events
      #(~'next-method rf# query-type# model# parsed-args# resolved-query#))))

(define-write-batch :toucan.query-type/insert.*)
(define-write-batch :toucan.query-type/update.*)
(define-write-batch :toucan.query-type/delete.*)

(mi/prefer-hook-trait! :hook/events)
