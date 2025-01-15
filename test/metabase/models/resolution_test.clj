(ns metabase.models.resolution-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.resolution :as models.resolution]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.jvm :as u.jvm]
   [toucan2.core :as t2]))

(defn- load-every-metabase-namespace
  "Load all Metabase namespaces so we can make sure all models are accounted for in the map."
  []
  ;; I know I literally just made this var deprecated last week but we really need the entire system to be loaded for
  ;; this to work and I don't have a better way of making this happen yet.
  #_{:clj-kondo/ignore [:deprecated-var]}
  (doseq [nspace u.jvm/metabase-namespace-symbols]
    ;; classloader/require for thread safety
    (classloader/require nspace)))

(use-fixtures :once (fn [thunk]
                      (load-every-metabase-namespace)
                      (thunk)))

(deftest ^:parallel all-models-are-accounted-for-test
  (doseq [model (descendants :metabase/model)
          :when (= (namespace model) "model")]
    (testing model
      (is (models.resolution/model->namespace model)
          (format "%s should have a mapping for %s" `models.resolution/model->namespace model)))))

(deftest ^:parallel all-entries-are-valid-test
  (doseq [[model nspace] models.resolution/model->namespace]
    (testing model
      (is (isa? model :metabase/model)
          (format "%s should be a descendant of :metabase/model" model))
      (let [e (try
                (classloader/require nspace)
                (catch Throwable e
                  e))]
        (is (not e)
            (format "%s has an invalid namespace mapping (there was an error loading %s)" model nspace))))))

(deftest ^:parallel symbol-resolution-test
  (is (= :model/User
         (t2/resolve-model 'User))))
