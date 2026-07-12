(ns metabase.mcp.instructions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.instructions :as mcp.instructions]
   [metabase.mcp.skills :as mcp.skills]))

(set! *warn-on-reflection* true)

(def ^:private lead
  "The prefix some clients inject on its own. Everything load-bearing has to survive being cut here."
  500)

(deftest ^:parallel instructions-fit-the-budget-test
  (let [instructions (mcp.instructions/instructions)]
    (testing "the instructions ride in every connection's prompt prefix, so they stay under the 2KB tier-1 budget"
      (is (<= (count (.getBytes instructions "UTF-8")) mcp.instructions/max-bytes)
          (str "instructions are " (count (.getBytes instructions "UTF-8")) "B; move content into a skill")))
    (testing "and there are some"
      (is (not (str/blank? instructions))))))

(deftest ^:parallel instructions-lead-is-self-contained-test
  (testing "the first ~500 characters name what the server is and where to start, because that is all
            some clients inject"
    (let [opening (subs (mcp.instructions/instructions) 0 lead)]
      (is (str/includes? opening "Metabase"))
      (doseq [tool ["search" "browse_data" "get_content"]]
        (is (str/includes? opening tool)
            (str "the opening does not name `" tool "`, so a client that injects only the lead has no entry point"))))))

(deftest ^:parallel instructions-route-to-every-skill-test
  (testing "every shipped skill is named in the instructions — a skill nothing routes to is a skill nobody loads"
    (let [instructions (mcp.instructions/instructions)]
      (doseq [{:keys [skill]} mcp.skills/registry]
        (is (str/includes? instructions (str "`" skill "`"))
            (str "the `" skill "` skill is not named in the server instructions"))))))
