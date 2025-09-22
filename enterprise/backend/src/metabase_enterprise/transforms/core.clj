(ns metabase-enterprise.transforms.core
  "API namespace for the `metabase-enterprise.transform` module."
  (:require
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.schema :as t.schema]
   [metabase-enterprise.transforms.settings]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]
   [toucan2.core :as t2]))

(defn- source-database-id
  [transform]
  (-> transform :source :query lib/database-id))

(defn error-or-obj
  "Validates an object and throws an exception if it's falsy.

  Args:
    obj-or-falsey: The object to validate, which may be falsy.
    message: The error message to include in the exception if validation fails.

  Returns:
    The original object if it's truthy.

  Raises:
    ExceptionInfo: If obj-or-falsey is falsy, with the provided message and :validate-transform type."
  [obj-or-falsey message]
  (when-not obj-or-falsey
    (throw (ex-info (str message) {:type :validate-transform})))
  obj-or-falsey)

(defn- check-database-feature
  [transform]
  (let [database (error-or-obj (t2/select-one :model/Database (source-database-id transform))
                               (deferred-tru "The source database cannot be found."))
        feature (transforms.util/required-database-feature transform)]
    (error-or-obj (not (:is_sample database))
                  (deferred-tru "Cannot run transforms on the sample database."))
    (error-or-obj (not (:is_audit database))
                  (deferred-tru "Cannot run transforms on audit databases."))
    (error-or-obj (driver.u/supports? (:engine database) feature database)
                  (deferred-tru "The database does not support the requested transform target type."))))

(mu/defn create-transform!
  "Create a transform from input and associate it with tags.

  Args:
    input: a map describing the transform model

  Returns:
    a transform model

  Raises:
    an ex-info object if we cannot validate the transform model"
  [input :- [:map
             [:name :string]
             [:description {:optional true} [:maybe :string]]
             [:library_identifier {:optional true} :string]
             [:source :any]
             [:target ::t.schema/transform-target]
             [:run_trigger {:optional true} ::t.schema/run-trigger]
             [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (check-database-feature input)
  (error-or-obj (not (transforms.util/target-table-exists? input))
                (deferred-tru "A table with that name already exists."))
  (t2/with-transaction [_]
    (let [tag-ids (:tag_ids input)
          transform (t2/insert-returning-instance!
                     :model/Transform (select-keys input [:name :description :source :target :run_trigger :library_identifier]))]
      ;; Add tag associations if provided
      (when (seq tag-ids)
        (transform.model/update-transform-tags! (:id transform) tag-ids))
      ;; Return with hydrated tag_ids
      (t2/hydrate transform :transform_tag_ids))))

(mu/defn update-transform!
  "Update a transform from input

  Args:
    input: a map describing the transform model

  Returns:
    a transform model

  Raises:
    an ex-info object if we cannot validate the transform model"
  [id :- ms/PositiveInt
   input :- [:map
             [:name {:optional true} :string]
             [:description {:optional true} [:maybe :string]]
             [:library_identifier {:optional true} :string]
             [:source {:optional true} :any]
             [:target {:optional true} ::t.schema/transform-target]
             [:run_trigger {:optional true} ::t.schema/run-trigger]
             [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (t2/with-transaction [_]
    ;; Cycle detection should occur within the transaction to avoid race
    (let [old (t2/select-one :model/Transform id)
          new (merge old input)
          target-fields #(-> % :target (select-keys [:schema :name]))]
      (check-database-feature new)
      (when-let [{:keys [cycle-str]} (transforms.ordering/get-transform-cycle new)]
        (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                        {:status-code 400})))
      (error-or-obj (not (and (not= (target-fields old) (target-fields new))
                              (transforms.util/target-table-exists? new)))
                    (deferred-tru "A table with that name already exists.")))

    (t2/update! :model/Transform id (dissoc input :tag_ids))
    ;; Update tag associations if provided
    (when (contains? input :tag_ids)
      (transform.model/update-transform-tags! id (:tag_ids input)))
    (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids)))

(p/import-vars
 [metabase-enterprise.transforms.settings
  transform-timeout])
