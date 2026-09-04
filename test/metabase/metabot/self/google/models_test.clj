(ns metabase.metabot.self.google.models-test
  (:require
   [clojure.string :as str]
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
  (testing "the adapter catalog offers the same Gemini models as the connection form, so neither can drift alone"
    ;; the form also offers Anthropic partner models, which raw-predict serves; this catalog
    ;; deliberately owns only the google/-publisher half
    (is (= (->> (:models (llm.provider/provider-type "google"))
                (map :id)
                (filter #(str/starts-with? % "google/"))
                set)
           (set (keys models/catalog))))))
