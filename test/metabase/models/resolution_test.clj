(ns metabase.models.resolution-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.jvm :as u.jvm]
   [toucan2.core :as t2]))

(deftest ^:parallel table-name-resolution-test
  (testing "table name should do model resolution"
    (is (= :core_session
           (t2/table-name :model/Session)))))

(defn- load-every-metabase-namespace
  "Load all Metabase namespaces so we can make sure all models are accounted for in the map."
  []
  ;; I know I literally just made this var deprecated last week but we really need the entire system to be loaded for
  ;; this to work and I don't have a better way of making this happen yet.
  #_{:clj-kondo/ignore [:deprecated-var]}
  (doseq [nspace u.jvm/metabase-namespace-symbols]
    ;; classloader/require for thread safety
    (classloader/require nspace)))

(deftest ^:parallel all-models-are-accounted-for-test
  (load-every-metabase-namespace)
  (doseq [model (descendants :metabase/model)
          :when (= (namespace model) "model")]
    (testing model
      (is (models.resolution/model->namespace model)
          (format "%s should have a mapping for %s" `models.resolution/model->namespace model)))))

(deftest ^:parallel all-entries-are-valid-test
  (doseq [[model nspace] models.resolution/model->namespace
          :when          (or config/ee-available?
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
