(ns dev.with-perm
  (:require
   [methodical.core :as m]
   [toucan2.insert :as insert]
   [clojure.spec.alpha :as s]
   [toucan2.model :as model]
   [toucan2.tools.with-temp :as t2.with-temp]
   [toucan2.types :as types]
   [toucan2.util :as u]))

(comment types/keep-me)

(m/defmulti with-perm-defaults
  "Returns the default attributes to use when inserting a model with [[with-perm]]."
  {:arglists            '([model])
   :defmethod-arities   #{1}
   :dispatch-value-spec (s/nonconforming ::types/dispatch-value.model)}
  u/dispatch-on-first-arg)

(m/defmethod with-perm-defaults :default
  [model]
  (t2.with-temp/with-temp-defaults model))

(m/defmulti do-with-perm*
  "Implementation of [[with-perm]]. Behaves like [[do-with-temp*]], but doesn't delete things.
   You can implement this if you need to do some sort of special behavior for a
  particular model. But normally you would just implement [[with-perm-defaults]]. If you need to do special setup when
  using [[with-perm]], you can implement a `:before` method:

  ```clj
  (m/defmethod do-with-perm* :before :default
    [_model _explicit-attributes f]
    (set-up-db!)
    f)
  ```

  `explicit-attributes` are the attributes specified in the `with-perm` form itself, any may be `nil`. The default
  implementation merges the attributes from [[with-perm-defaults]] like

  ```clj
  (merge {} (with-perm-defaults model) explict-attributes)
  ```"
  {:arglists            '([model₁ explicit-attributes])
   :defmethod-arities   #{2}
   :dispatch-value-spec (s/nonconforming ::types/dispatch-value.model)}
  u/dispatch-on-first-arg)

(m/defmethod do-with-perm* :default
  [model explicit-attributes]
  (assert (some? model) (format "%s model cannot be nil." `with-perm))
  (when (some? explicit-attributes)
    (assert (map? explicit-attributes) (format "attributes passed to %s must be a map." `with-perm)))
  (let [defaults          (with-perm-defaults model)
        merged-attributes (merge {} defaults explicit-attributes)]
    (first (insert/insert-returning-instances! model merged-attributes))))

(defn with-perm
  "Inserts the model with attributes merged into it's with-temp-defaults. This is the primary way to insert models
   for load testing. If you need to do something special for a particular model, you can implement `do-with-perm*`."
  [modelable attributes]
  (let [model (model/resolve-model modelable)]
    (do-with-perm* model attributes)))
