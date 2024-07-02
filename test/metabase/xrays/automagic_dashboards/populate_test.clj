(ns metabase.xrays.automagic-dashboards.populate-test
  (:require
   [clojure.test :refer :all]
   [metabase.xrays.automagic-dashboards.populate :as populate]))

(deftest ^:parallel ordered-group-by-seq-test
  (let [groups {"Overview"     {:title "Summary", :score 90},
                "Singletons"   {:title "These are the same for all [[this.short-name]]",
                                :score 50},
                "ByTime"       {:title "These [[this.short-name]] across time", :score 80},
                "Geographical" {:title "Where these [[this.short-name]] are",
                                :score 85},
                "General"      {:title "How these [[this.short-name]] are distributed",
                                :score 70}}
        results (populate/ordered-group-by-seq
                 :group (sort-by (comp - :score groups) (keys groups))
                 [{:group "Geographical" :k 1}
                  {:group "Overview" :k 1}
                  {:group "Overview" :k 2}
                  {:group "ByTime" :k 1}
                  {:group "Overview" :k 3}])]
    (is (=? [["Overview" [{:group "Overview", :k 1}
                          {:group "Overview", :k 2}
                          {:group "Overview", :k 3}]]
             ["Geographical" [{:group "Geographical", :k 1}]]
             ["ByTime" [{:group "ByTime", :k 1}]]]
            results)))

  (testing "If there's no key order we just get a seq of the grouped map"
    (let [results (populate/ordered-group-by-seq
                   :group nil
                   [{:k 1} {:k 2} {:k 3}])]
      (is (=? [[nil [{:k 1} {:k 2} {:k 3}]]]
              results))))

  (testing "Returns remaining keys at end if they aren't asked for"
    (let [groups {"Overview"     {:title "Summary", :score 90},
                  "Singletons"   {:title "These are the same for all [[this.short-name]]",
                                  :score 50},
                  "ByTime"       {:title "These [[this.short-name]] across time", :score 80},
                  "Geographical" {:title "Where these [[this.short-name]] are",
                                  :score 85},
                  "General"      {:title "How these [[this.short-name]] are distributed",
                                  :score 70}}
          results (populate/ordered-group-by-seq
                   :group (sort-by (comp - :score groups) (keys groups))
                   [{:group "Geographical" :k 1}
                    {:group "Overview" :k 1}
                    {:group "Overview" :k 2}
                    {:group "Custom Metric" :k 1}
                    {:group "ByTime" :k 1}
                    {:group "Overview" :k 3}
                    {:group "Custom Metric" :k 2}])]
      (is (=? [["Overview" [{:group "Overview", :k 1}
                            {:group "Overview", :k 2}
                            {:group "Overview", :k 3}]]
               ["Geographical" [{:group "Geographical", :k 1}]]
               ["ByTime" [{:group "ByTime", :k 1}]]
               ["Custom Metric" [{:group "Custom Metric" :k 1}
                                 {:group "Custom Metric" :k 2}]]]
              results)))))
