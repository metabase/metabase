(ns metabase.metabot.self.google.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.google.models :as models]))

(deftest ^:parallel reasoning-model?-test
  (testing "exactly the catalog models stream renderable thought summaries"
    (is (true?  (models/reasoning-model? "google/gemini-3.5-flash")))
    (is (true?  (models/reasoning-model? "google/gemini-3.6-flash")))
    (is (true?  (models/reasoning-model? "google/gemini-3.7-flash")))
    (is (false? (models/reasoning-model? "google/gemini-2.5-flash")))
    (is (false? (models/reasoning-model? "gemini-3.5-flash")))
    (is (false? (models/reasoning-model? nil)))))

(deftest ^:parallel catalog-matches-connection-form-test
  (testing "the adapter catalog offers the same models as the connection form, so neither can drift alone"
    (is (= (set (map :id (:models (llm.provider/provider-type "google"))))
           (set (keys models/catalog))))))
