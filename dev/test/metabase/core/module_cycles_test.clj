(ns metabase.core.module-cycles-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]
   [dev.module-cycle-names :as cycle-names]
   [dev.module-cycles :as module-cycles]))

(set! *warn-on-reflection* true)

(def ^:private graph
  "Two cycles, `qp <-> sync` and `app-db <-> settings`, joined one way by `sync -> settings`."
  {'app-db   #{'settings}
   'qp       #{'sync}
   'settings #{'app-db}
   'sync     #{'qp 'settings}})

(def ^:private modules
  (set (keys graph)))

(def ^:private anchors
  '{foundation app-db, galactic-center qp})

(defn- ring
  "A graph in which `modules` require each other in a single loop."
  [modules]
  (zipmap modules (map hash-set (rest (cycle modules)))))

(defn- lines [problem]
  (str/split-lines (module-cycles/message problem)))

(deftest ^:parallel passing-structures-test
  (testing "each cluster holding one anchor passes"
    (is (= [] (module-cycles/problems graph modules anchors))))
  (testing "a named cluster can gain a module"
    (is (= [] (module-cycles/problems (assoc graph 'qp #{'sync 'lib}, 'lib #{'qp}) (conj modules 'lib) anchors)))))

(deftest ^:parallel merges-fail-test
  (testing "a merge shows the requires linking the two anchors, both ways"
    (is (=? [{:type   :merge
              :names  '[foundation galactic-center]
              :chains [{:from 'foundation, :to 'galactic-center, :path '[app-db settings qp]}
                       {:from 'galactic-center, :to 'foundation, :path '[qp sync settings app-db]}]}]
            (module-cycles/problems (assoc graph 'settings #{'app-db 'qp}) modules anchors))))
  (testing "a three-way merge links the first name to each of the others"
    (let [graph   (assoc graph 'settings #{'app-db 'qp}, 'lib #{'qp}, 'qp #{'sync 'lib})
          anchors (assoc anchors 'tardis 'lib)
          [merge] (module-cycles/problems graph (conj modules 'lib) anchors)]
      (is (= '[[foundation galactic-center] [galactic-center foundation] [foundation tardis] [tardis foundation]]
             (map (juxt :from :to) (:chains merge)))))))

(deftest ^:parallel unnamed-clusters-fail-test
  (testing "a tie for the most requires inside the cluster proposes the alphabetically first member"
    (is (= [{:type     :unnamed
             :cluster  '#{qp sync}
             :requires '[[qp sync] [sync qp]]
             :proposal '{:name qp-knot, :anchor qp}}]
           (module-cycles/problems graph modules '{foundation app-db}))))
  (testing "a proposal avoids the names already taken"
    (is (=? [{:type :unnamed, :proposal '{:name qp-knot-2}}
             {:type :anchor-left, :name 'qp-knot}]
            (module-cycles/problems graph (conj modules 'lib) '{foundation app-db, qp-knot lib}))))
  (testing "two proposals never share a name"
    (let [graph (merge (ring '[foo.bar x]) (ring '[foo-bar y]))]
      (is (= '#{foo-bar-knot foo-bar-knot-2}
             (set (map (comp :name :proposal) (module-cycles/problems graph (set (keys graph)) {})))))))
  (testing "dots and slashes in a module name become dashes"
    (is (= 'enterprise-transforms-python-knot
           (:name (module-cycles/propose (ring '[enterprise/transforms.python x])
                                         '#{enterprise/transforms.python x}
                                         '#{enterprise/transforms.python x}
                                         #{})))))
  (testing "a proposal only anchors on a declared module"
    (is (=? [{:type :unnamed, :proposal '{:anchor sync}}]
            (module-cycles/problems graph (disj modules 'qp) '{foundation app-db}))))
  (testing "a cycle of undeclared modules gets no proposal"
    (is (=? [{:type :unnamed, :proposal nil}]
            (module-cycles/problems graph (disj modules 'qp 'sync) '{foundation app-db})))))

(deftest ^:parallel anchors-leaving-every-cycle-test
  (testing "a cycle that is gone leaves its anchor behind"
    (is (= [{:type :anchor-left, :name 'galactic-center, :anchor 'qp}]
           (module-cycles/problems (assoc graph 'sync #{'settings}) modules anchors))))
  (testing "an anchor that left a surviving cycle is reported alongside the cycle it left"
    (is (=? [{:type :unnamed, :cluster '#{lib sync}}
             {:type :anchor-left, :anchor 'qp}]
            (module-cycles/problems (assoc graph 'qp #{}, 'sync #{'lib}, 'lib #{'sync}) (conj modules 'lib) anchors)))))

(deftest ^:parallel undeclared-anchors-test
  (testing "an undeclared anchor outside every cycle leaves its cluster unnamed"
    (is (=? [{:type :unnamed, :cluster '#{qp sync}}
             {:type :undeclared-anchor, :name 'galactic-center, :anchor 'query-processor}]
            (module-cycles/problems graph modules '{foundation app-db, galactic-center query-processor}))))
  (testing "an undeclared anchor inside a cycle is the only problem for that cycle"
    (is (= [{:type :undeclared-anchor, :name 'galactic-center, :anchor 'qp}]
           (module-cycles/problems graph (disj modules 'qp) anchors)))))

(deftest ^:parallel names-file-test
  (testing "malformed names throw"
    (are [anchors msg] (thrown-with-msg? clojure.lang.ExceptionInfo msg (cycle-names/validate-anchors anchors))
      '[foundation app-db]               #"must hold a map"
      '{:foundation app-db}              #"not a cluster name"
      '{foundation "app-db"}             #"must be anchored by a module symbol"
      '{foundation app-db, other app-db} #"app-db anchors more than one cluster: foundation, other"))
  (testing "a file must hold exactly one form"
    (let [file (io/file (System/getProperty "java.io.tmpdir") (str "cycle-clusters-" (System/nanoTime) ".edn"))]
      (try
        (are [contents msg] (thrown-with-msg? clojure.lang.ExceptionInfo msg
                                              (do (spit file contents)
                                                  (cycle-names/read-anchors (.getPath file))))
          ";; nothing\n"            #"is empty"
          "{a app-db}\n{b qp}\n"    #"more than one form")
        (finally
          (io/delete-file file true)))))
  (testing "a missing file throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is missing"
                          (cycle-names/read-anchors "no/such/cycle-clusters.edn")))))

(deftest ^:parallel messages-test
  (testing "a merge names the clusters, shows the chains, and keeps removing a name as the last resort"
    (let [msg (lines {:type    :merge
                      :cluster '#{app-db qp settings sync}
                      :names   '[foundation galactic-center]
                      :chains  [{:from 'foundation, :to 'galactic-center, :path '[app-db settings qp]}]})]
      (is (= "foundation and galactic-center merged into one cycle of 4 modules." (first msg)))
      (is (some #{"  foundation reaches galactic-center through app-db -> settings -> qp"} msg))
      (is (re-find #"remove all but one of the names" (last msg)))))
  (testing "an unnamed cluster lists its requires and the line to add"
    (let [msg (lines {:type     :unnamed
                      :cluster  '#{qp sync}
                      :requires '[[qp sync] [sync qp]]
                      :proposal '{:name qp-knot, :anchor qp}})]
      (is (=? ["A cluster without a name: 2 modules, qp, sync."
               "  It is a cycle through these requires:"
               "    qp -> sync"
               "    sync -> qp"]
              (take 4 msg)))
      (is (some #(str/includes? % "You get to name the new one") msg))
      (is (some #(str/includes? % "add a line like `qp-knot qp`") msg))))
  (testing "an unnamed cluster without a proposal asks for its modules to be declared"
    (is (some #(str/includes? % "None of its modules is declared")
              (lines {:type :unnamed, :cluster '#{qp sync}, :requires [], :proposal nil}))))
  (testing "a large cluster is cut off after eight modules, and its requires are not listed"
    (let [members (mapv #(symbol (format "m%02d" %)) (range 11))
          msg     (lines {:type     :unnamed
                          :cluster  (set members)
                          :requires (mapv vector members (rest (cycle members)))
                          :proposal '{:name m00-knot, :anchor m00}})]
      (is (re-find #"11 modules, m00, .*, m07 \(and 3 more\)\.$" (first msg)))
      (is (not-any? #(str/includes? % "It is a cycle through") msg))))
  (testing "a small cluster lists its requires however many there are"
    (let [members '[a b c d e]
          msg     (lines {:type     :unnamed
                          :cluster  (set members)
                          :requires (vec (for [from members, to members :when (not= from to)] [from to]))
                          :proposal '{:name a-knot, :anchor a}})]
      (is (= 20 (count (filter #(str/includes? % " -> ") msg))))))
  (testing "an anchor that left every cycle asks for the name to move or retire"
    (let [msg (lines {:type :anchor-left, :name 'galactic-center, :anchor 'qp})]
      (is (= "galactic-center is anchored on qp, which is no longer in any cycle." (first msg)))
      (is (re-find #"Remove its line" (last msg)))))
  (testing "an undeclared anchor asks for the module to be declared or the name moved"
    (is (re-find #"^galactic-center is anchored on qp, which is not a declared module\. Declare it"
                 (module-cycles/message {:type :undeclared-anchor, :name 'galactic-center, :anchor 'qp})))))

(deftest module-cycles-test
  ;; Release branches disable the ratchets, and their structure is frozen with them.
  (when-not (kondo-ratchet/disabled?)
    (let [problems (module-cycles/report)]
      (is (empty? problems)
          (str "Every cyclic cluster of the module require graph holds exactly one anchor from "
               cycle-names/clusters-file ".\n\n" (str/join "\n\n" problems))))))
