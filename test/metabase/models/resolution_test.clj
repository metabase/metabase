(ns metabase.models.resolution-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [toucan2.core :as t2]))

(deftest ^:parallel table-name-resolution-test
  (testing "table name should do model resolution"
    (is (= :core_session
           (t2/table-name :model/Session)))))

(defn- load-every-metabase-namespace
  "Load all Metabase namespaces so we can make sure all models are accounted for in the map."
  []
  ;; Use the model->namespace map which already contains all the model namespaces we need to load.
  (doseq [[_model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    ;; classloader/require for thread safety
    (classloader/require nspace)))

(deftest all-models-are-accounted-for-test
  (load-every-metabase-namespace)
  (doseq [model (descendants :metabase/model)
          :when (= (namespace model) "model")]
    (testing model
      (is (models.resolution/model->namespace model)
          (format "%s should have a mapping for %s" `models.resolution/model->namespace model)))))

(deftest all-entries-are-valid-test
  (doseq [[model nspace] models.resolution/model->namespace
          :when (or config/ee-available?
                    (not (str/starts-with? nspace "metabase-enterprise")))]
    (testing model
      (let [e (try
                (classloader/require nspace)
                (catch Throwable e
                  e))]
        (is (not e)
            (format "%s has an invalid namespace mapping (there was an error loading %s)" model nspace)))
      (is (isa? model :metabase/model)
          (format "%s should be a descendant of :metabase/model" model)))))

(deftest ^:parallel symbol-resolution-test
  (is (= :model/User
         (t2/resolve-model 'User))))

(deftest resolve-model-requires-namespace-even-when-already-derived-test
  (testing (str "resolve-model must ensure a model's namespace is loaded even when the model is already derived as "
                ":metabase/model. The derivation is established partway through a model namespace's load (before its "
                "deftransforms / define-before-insert side effects), so short-circuiting on it let concurrent "
                "first-access on another thread use the model before its transforms were registered.")
    (let [required (atom [])]
      (with-redefs [classloader/require (fn [& args] (swap! required into args))]
        (t2/resolve-model :model/QueryExecution))
      (is (contains? (set @required) 'metabase.queries.models.query-execution)))))

(deftest resolve-model-ignores-unknown-model-keywords-test
  (testing "resolve-model does not attempt to require a namespace for a `model`-namespaced keyword that is not a known model"
    (let [required (atom [])]
      (with-redefs [classloader/require (fn [& args] (swap! required into args))]
        (t2/resolve-model :model/DefinitelyNotARealModel))
      (is (empty? @required)
          "should not call classloader/require (which would blow up on a nil namespace) for unknown models"))))
