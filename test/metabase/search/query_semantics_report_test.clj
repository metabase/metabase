(ns metabase.search.query-semantics-report-test
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-report :as report]
   [metabase.search.query-semantics-stats :as stats])
  (:import
   (java.nio ByteBuffer)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private scenario
  {:id     "alpha"
   :focus  "alpha cards"
   :config "simple"
   :query  "alpha"
   :docs   {:A {:name "Alpha"}}
   :expect {:in-place       [:A]
            :appdb-h2       [:A]
            :appdb-mysql    [:A]
            :appdb-postgres [:A]
            :semantic       {:keyword [:A], :vector [:A]}}})

(def ^:private options
  {:themes   [{:id "words", :scenarios ["alpha"]}]
   :findings [{:case "alpha", :text "Alpha matches.", :holds {:appdb-mysql {:A true}}}]})

(defn- encode [components]
  (let [buffer (ByteBuffer/allocate (* 4 (count components)))]
    (doseq [value components] (.putFloat buffer (float value)))
    (.encodeToString (Base64/getEncoder) (.array buffer))))

(defn- frozen [components]
  {:model      "fixture"
   :dimensions (count components)
   :vectors    {"query: alpha"        (encode components)
                "[card]\nname: Alpha" (encode components)}})

(defn- problem-data [thunk]
  (try (thunk) nil (catch clojure.lang.ExceptionInfo e (ex-data e))))

(defn- engine-entry
  "The entry for engine `id` in a report row."
  [row id]
  (some #(when (= id (:id %)) %) (:engines row)))

(defn- problems [changes]
  (report/problems (stats/scenario-rows [scenario]) (merge options changes)))

(deftest ^:parallel report-data-test
  (let [data (report/report-data [scenario] (frozen [1 0]) {:commit "fixture"} options)]
    (is (= (mapv name stats/engines) (:engines data)))
    (is (= {:commit "fixture", :model "fixture", :cutoff 0.7} (:provenance data)))
    (is (= [{:case "alpha", :text "Alpha matches."}] (:findings data)))
    (is (= ["A"] (:hits (engine-entry (get-in data [:sameQuery :cases 0]) "appdb-mysql"))))
    (is (= {"A" 0.0} (:distances (engine-entry (get-in data [:sameQuery :cases 0]) "semantic-only"))))
    (is (empty? (get-in data [:translations :cases])))))

(deftest ^:parallel corpus-report-test
  (let [frozen-input (-> "search/arctic_embed_l_v2_vectors.edn" io/resource slurp edn/read-string)
        data         (report/report-data fixtures/cases frozen-input {})]
    (is (= (mapv name stats/engines) (:engines data)))
    (is (= (count fixtures/cases) (count (get-in data [:sameQuery :cases]))))
    (is (= (count (mapcat :comparisons fixtures/cases)) (count (get-in data [:translations :cases]))))))

(deftest ^:parallel goal-report-data-test
  ;; PostgreSQL misses the typed query and finds the card with its adapted one.
  (let [goal-scenario (-> scenario
                          (assoc :note ["Alpha" "note."])
                          (assoc-in [:expect :appdb-postgres] [])
                          (assoc :comparisons [{:id           "alpha-prefix"
                                                :focus        "alpha cards"
                                                :kind         :typing
                                                :note         ["Goal" "note."]
                                                :correct      [:A]
                                                :alternatives {:appdb-postgres {:query "alpha*", :hits [:A]}}}]))
        data          (report/report-data [goal-scenario] (frozen [1 0]) {} options)
        goal          (get-in data [:translations :cases 0])]
    (is (=? {:id           "alpha/alpha-prefix"
             :scenario     "alpha"
             :kind         "typing"
             :note         "Goal note."
             :scenarioNote "Alpha note."
             :correct      ["A"]
             :conforming   (mapv name stats/engines)
             :meanF1       1.0}
            goal))
    (is (=? {:query      "alpha*"
             :hits       ["A"]
             :typedHits  []
             :bestScore  {:f1 1.0}
             :typedScore {:f1 0.0}}
            (engine-entry goal "appdb-postgres")))
    (is (= ["A"] (:keywordHits (engine-entry (get-in data [:sameQuery :cases 0]) "semantic-with-fallback"))))))

(deftest ^:parallel valid-report-claims-test
  (is (= [] (problems {}))))

(deftest ^:parallel duplicate-scenario-ids-test
  (is (= [{:type :scenario-ids, :repeated ["alpha"], :invalid []}]
         (report/problems (stats/scenario-rows [scenario scenario]) options))))

(deftest ^:parallel invalid-scenario-ids-test
  (is (= [{:type :scenario-ids, :repeated [], :invalid [""]}]
         (report/problems (stats/scenario-rows [(assoc scenario :id "")])
                          (assoc options :themes [{:scenarios [""]}], :findings [])))))

(deftest ^:parallel missing-theme-placement-test
  (is (= [{:type     :theme-placement
           :repeated []
           :unknown  []
           :missing  ["alpha"]}]
         (problems {:themes []}))))

(deftest ^:parallel unknown-theme-scenario-test
  (is (= [{:type     :theme-placement
           :repeated []
           :unknown  ["beta"]
           :missing  []}]
         (problems {:themes [{:scenarios ["alpha" "beta"]}]}))))

(deftest ^:parallel duplicate-theme-placement-test
  (is (= [{:type     :theme-placement
           :repeated ["alpha"]
           :unknown  []
           :missing  []}]
         (problems {:themes [{:scenarios ["alpha" "alpha"]}]}))))

(deftest ^:parallel unknown-finding-scenario-test
  (is (= [{:type :unknown-finding-scenario, :case "beta"}]
         (problems {:findings [{:case "beta"}]}))))

(deftest ^:parallel unknown-finding-engine-test
  (is (= [{:type :unknown-finding-engine, :case "alpha", :engine :unknown}]
         (problems {:findings [{:case "alpha", :holds {:unknown :none}}]}))))

(deftest ^:parallel unknown-finding-label-test
  (doseq [present? [true false]]
    (is (= [{:type   :unknown-finding-label
             :case   "alpha"
             :engine :appdb-mysql
             :label  :unknown}]
           (problems {:findings [{:case "alpha", :holds {:appdb-mysql {:unknown present?}}}]})))))

(deftest ^:parallel invalid-finding-claim-test
  (doseq [claim [:anything {:A :anything}]]
    (is (= :invalid-finding-claim
           (:type (first (problems {:findings [{:case "alpha", :holds {:appdb-mysql claim}}]})))))))

(deftest ^:parallel contradicted-finding-test
  (is (= [{:type     :finding-mismatch
           :case     "alpha"
           :engine   :appdb-mysql
           :label    :A
           :expected false
           :actual   true}]
         (problems {:findings [{:case "alpha", :holds {:appdb-mysql {:A false}}}]})))
  (is (= :finding-mismatch
         (:type (first (problems {:findings [{:case "alpha", :holds {:appdb-mysql :none}}]}))))))

(deftest ^:parallel invalid-report-data-test
  (is (= :unknown-finding-label
         (:type (problem-data #(report/report-data [scenario] (frozen [1 0]) {}
                                                   (assoc options :findings
                                                          [{:case  "alpha"
                                                            :holds {:appdb-mysql {:unknown false}}}])))))))

(deftest ^:parallel missing-vector-test
  (doseq [input ["query: alpha" "[card]\nname: Alpha"]]
    (is (= {:type :missing-vector, :input input}
           (problem-data #(report/report-data [scenario] (update (frozen [1 0]) :vectors dissoc input)
                                              {} options))))))

(deftest ^:parallel invalid-vector-test
  (doseq [[encoded reason] [[nil :encoding]
                            ["not base64" :encoding]
                            [(encode [1]) :length]
                            [(encode [0 0]) :components]
                            [(encode [Double/NaN 0]) :components]]]
    (is (= {:type :invalid-vector, :input "query: alpha", :reason reason}
           (problem-data #(report/report-data [scenario]
                                              (assoc-in (frozen [1 0]) [:vectors "query: alpha"] encoded)
                                              {} options))))))

(deftest ^:parallel invalid-vector-dimensions-test
  (is (= {:type :invalid-vector, :input :dimensions, :reason :dimensions}
         (problem-data #(report/report-data [scenario] (assoc (frozen [1 0]) :dimensions 0) {} options)))))

(deftest ^:parallel inconsistent-vector-hits-test
  (is (= {:type     :vector-hits
          :input    "alpha"
          :expected #{}
          :actual   #{:A}}
         (problem-data #(report/report-data [(assoc-in scenario [:expect :semantic :vector] [])]
                                            (frozen [1 0]) {} options)))))

(deftest ^:parallel vector-cutoff-test
  (let [vectors  (assoc-in (frozen [1 0]) [:vectors "[card]\nname: Alpha"] (encode [0 1]))
        adjusted (assoc-in scenario [:expect :semantic :vector] [])
        distance #(:distances (engine-entry (get-in % [:sameQuery :cases 0]) "semantic-only"))]
    (is (= {"A" 1.0} (distance (report/report-data [adjusted] vectors {} options))))
    (is (= {"A" 1.0} (distance (report/report-data [scenario] vectors {} (assoc options :cutoff 1.0)))))))

(deftest ^:parallel script-delimiter-escaping-test
  (is (= "<script>{\"query\":\"\\u003c/script>\"}</script>"
         (report/render "<script>__REPORT_DATA__</script>" "{\"query\":\"</script>\"}"))))

(deftest ^:parallel missing-placeholder-test
  (is (= {:type :missing-placeholder, :placeholder "__REPORT_DATA__"}
         (problem-data #(report/render "<html></html>" "{}"))))
  (is (= {:type :missing-placeholder, :placeholder "__REPORT_MODEL__"}
         (problem-data #(report/render "__REPORT_DATA__" "{}" "code")))))

(deftest ^:parallel embedded-model-test
  (is (= "<script>{}</script><script type=module>export const score = 1;</script>"
         (report/render "<script>__REPORT_DATA__</script><script type=module>__REPORT_MODEL__</script>"
                        "{}" "export const score = 1;"))))

(deftest ^:parallel problem-message-test
  ;; Each row checks the facts carried by one diagnostic type.
  (doseq [[fragments problem]
          [[["alpha" "unique"]          {:type :scenario-ids, :repeated ["alpha"], :invalid []}]
           [["beta" "Themes"]           {:type     :theme-placement
                                         :unknown  ["beta"]
                                         :missing  []
                                         :repeated []}]
           [["beta" "unknown scenario"] {:type :unknown-finding-scenario, :case "beta"}]
           [["alpha" ":other"]          {:type :unknown-finding-engine, :case "alpha", :engine :other}]
           [["alpha" ":B"]              {:type   :unknown-finding-label
                                         :case   "alpha"
                                         :engine :appdb-mysql
                                         :label  :B}]
           [["alpha" "boolean"]         {:type :invalid-finding-claim, :case "alpha", :engine :appdb-mysql}]
           [["alpha" "false" "true"]    {:type     :finding-mismatch
                                         :case     "alpha"
                                         :expected false
                                         :actual   true}]
           [["query: alpha" "freeze!"]  {:type :missing-vector, :input "query: alpha"}]
           [["query: alpha" "length"]   {:type :invalid-vector, :input "query: alpha", :reason :length}]
           [["alpha" "distances"]       {:type :vector-hits, :input "alpha"}]
           [["__REPORT_DATA__"]         {:type :missing-placeholder, :placeholder "__REPORT_DATA__"}]]]
    (doseq [fragment fragments]
      (is (str/includes? (report/message problem) fragment)))))
