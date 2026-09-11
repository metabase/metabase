(ns metabase.core.module-cycle-ratchet-test
  "Named cyclic module clusters: measurement, identity, the membership ratchet, and recording."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.module-cycle-ratchet :as cycle-ratchet]
   [dev.module-cycle-scan :as cycle-scan]))

(set! *warn-on-reflection* true)

(defn- cluster
  "An actual cluster as [[dev.module-cycle-scan/structure]] reports one.
  `edges` only matters where a name has to be proposed, which follows from the module with the most of them."
  ([modules]
   (cluster modules nil))
  ([modules edges]
   {:modules (set modules)
    :edges   (set edges)}))

(defn- snapshot [uses & {:keys [combined mode], :or {combined {}, mode :enforce}}]
  {:mode               mode
   :uses               uses
   :uses+model-imports combined})

(defn- actual [uses & {:keys [combined], :or {combined []}}]
  {:uses               uses
   :uses+model-imports combined})

(defn- statuses
  "`{name-or-sorted-modules status}` for one graph's resolution, so identity asserts as one map."
  [recorded-clusters actual-clusters]
  (into {}
        (map (fn [{:keys [name status modules]}] [(or name (sort modules)) status]))
        (:clusters (cycle-ratchet/resolve-clusters recorded-clusters actual-clusters))))

;;;; =============================================================================
;;;; Measurement
;;;; =============================================================================

(deftest ^:parallel structure-test
  (let [config     {'audit      {:model-imports :any}
                    'events     {:model-imports #{:model/Card}}
                    'lib        {}
                    'lib.schema {}
                    'qp         {:model-exports #{:model/Card}}
                    'serdes     {:model-imports :bypass}}
        ownership  {:model/Card 'qp}
        references {'audit  #{:model/Card}
                    'serdes #{:model/Card}}
        deps       [{:module 'lib, :deps [{:module 'lib.schema}]}
                    {:module 'lib.schema, :deps [{:module 'lib}]}
                    {:module 'qp, :deps [{:module 'audit} {:module 'events} {:module 'serdes}]}]]
    (is (= {:uses               [{:modules '#{lib lib.schema}, :internal-edges 2, :cross-subtree-edges 0}]
            :uses+model-imports [{:modules '#{audit events qp}, :internal-edges 4, :cross-subtree-edges 4}
                                 {:modules '#{lib lib.schema}, :internal-edges 2, :cross-subtree-edges 0}]}
           (update-vals (cycle-scan/structure deps config ownership references)
                        (partial mapv #(dissoc % :edges))))
        (str "a cycle inside one subtree crosses no subtree boundary; a declared import and an :any import each"
             " close a cycle the require graph does not have, and a :bypass import adds no edge"))))

;;;; =============================================================================
;;;; The file
;;;; =============================================================================

(def ^:private a-snapshot
  (snapshot {'galactic-center   '#{app-db queries sync}
             'notification-knot '#{channel notification enterprise/channel.slack}}
            :combined {'galactic-center '#{app-db events queries sync}}))

(deftest ^:parallel render-round-trips-test
  (let [file (io/file (System/getProperty "java.io.tmpdir") (str "cycle-clusters-" (System/nanoTime) ".edn"))]
    (try
      (spit file (cycle-ratchet/render a-snapshot))
      (binding [cycle-ratchet/*clusters-file* (.getPath file)]
        (let [read-back (cycle-ratchet/read-snapshot)]
          (is (= a-snapshot read-back)
              "every recorded field survives a write and a read")
          (is (= (slurp file) (cycle-ratchet/render read-back))
              "rendering is idempotent, so a recorded file never diffs against itself")))
      (is (str/includes? (slurp file) (str "{:mode :enforce\n"
                                           " :uses\n"
                                           " {galactic-center\n"
                                           "  #{app-db\n"
                                           "    queries\n"
                                           "    sync}\n"
                                           "  notification-knot\n"))
          "one module per line, so every movement between clusters diffs on its own")
      (finally (.delete file)))))

(deftest ^:parallel malformed-record-never-reads-as-empty-test
  (testing "a damaged record is an error rather than a record with no clusters"
    (are [bad] (thrown? clojure.lang.ExceptionInfo (cycle-ratchet/validate-snapshot bad))
      []
      (dissoc (snapshot {}) :mode)
      (snapshot {} :mode :warn)
      (snapshot {'knot '#{only-one}})
      (snapshot {'knot '[a b]})
      (snapshot {"knot" '#{a b}})
      (snapshot {'knot '#{a b}} :combined [])
      (assoc (snapshot {}) :uses-with-friends {})
      (snapshot {'one-knot '#{a b}, 'other-knot '#{b c}})))
  (is (= (snapshot {}) (cycle-ratchet/validate-snapshot {:mode :enforce}))
      "an empty record is legal"))

;;;; =============================================================================
;;;; Identity
;;;; =============================================================================

(deftest ^:parallel shrinking-keeps-the-name-test
  (is (= {'galactic-center :continued}
         (statuses {'galactic-center '#{app-db queries sync}} [(cluster '[app-db queries])]))))

(deftest ^:parallel splitting-keeps-the-name-on-the-larger-component-test
  (let [{:keys [clusters resolved]}
        (cycle-ratchet/identify
         {'galactic-center '#{app-db queries sync lib}}
         [(cluster '[app-db queries sync] '[[app-db queries] [queries sync] [sync app-db]])
          (cluster '[lib driver] '[[lib driver] [driver lib]])])]
    (is (= [{:name 'galactic-center, :status :continued}
            {:name nil, :status :split-off, :proposed 'driver-knot}]
           (mapv #(select-keys % [:name :status :proposed]) clusters))
        "the component inheriting the most modules stays the incumbent; the other becomes a new cluster")
    (is (= [] resolved)
        "the incumbent is still cyclic, so it has not been resolved away")))

(deftest ^:parallel a-tied-split-is-ambiguous-rather-than-guessed-test
  (is (= {'(m1 m2) :ambiguous, '(m3 m4) :ambiguous}
         (statuses {'knot '#{m1 m2 m3 m4}} [(cluster '[m1 m2]) (cluster '[m3 m4])]))
      "two halves inherit equally, so neither may claim the name"))

(deftest ^:parallel a-new-cycle-is-not-a-split-test
  (is (= {'(driver lib) :new}
         (statuses {'galactic-center '#{app-db queries}} [(cluster '[driver lib])]))
      "a cluster sharing no module with any recorded one is a new cycle, not a component of an old one"))

(deftest ^:parallel merging-preserves-the-dominant-incumbent-test
  (let [{:keys [clusters resolved]}
        (cycle-ratchet/resolve-clusters {'galactic-center   '#{app-db queries sync}
                                         'notification-knot '#{channel notification}}
                                        [(cluster '[app-db queries sync channel notification])])]
    (is (= [{:name 'galactic-center, :status :merged, :from '[galactic-center notification-knot]}]
           (mapv #(select-keys % [:name :status :from]) clusters))
        "the incumbent contributing the most modules keeps its identity and the absorbed one is named")
    (is (= '[notification-knot] resolved))))

(deftest ^:parallel names-come-from-the-dominant-module-test
  (is (= 'queries-knot
         (cycle-ratchet/propose-name
          (cluster '[queries lib driver] '[[queries lib] [lib queries] [queries driver] [driver queries]])
          #{}))
      "the module holding the cluster together names it")
  (is (= 'enterprise-transforms-python-knot
         (cycle-ratchet/propose-name
          (cluster '[enterprise/transforms.python sync]
                   '[[enterprise/transforms.python sync] [sync enterprise/transforms.python]])
          #{}))
      "a nested or enterprise module name flattens into a readable one")
  (is (= 'lib-knot-2
         (cycle-ratchet/propose-name (cluster '[lib queries] '[[lib queries] [queries lib]]) '#{lib-knot}))
      "a name still held by a cluster whose dominant module has moved on is not reused"))

;;;; =============================================================================
;;;; The ratchet
;;;; =============================================================================

(deftest ^:parallel improvements-are-silent-test
  (is (= [] (cycle-ratchet/check-report
             (snapshot {'galactic-center '#{app-db queries sync lib driver}})
             (actual [(cluster '[app-db queries sync]) (cluster '[lib driver])])))
      "shrinking and splitting are what this is here to allow, and need no feature branch to rewrite the file")
  (is (= [] (cycle-ratchet/check-report (snapshot {'lib-knot '#{lib lib.schema}}) (actual [])))
      "a cluster that stops being cyclic at all is silent too"))

(deftest ^:parallel growth-fails-with-what-it-gained-test
  (is (= [":uses graph:"
          (str "  galactic-center gained 1 module(s): lib -- break the cycle, or add them to the cluster by"
               " hand and say why in the PR")]
         (cycle-ratchet/check-report (snapshot {'galactic-center '#{app-db queries sync}})
                                     (actual [(cluster '[app-db queries sync lib])])))
      "the failure names the cluster and the module that joined it"))

(deftest ^:parallel a-split-cannot-smuggle-in-a-module-test
  (is (= [":uses graph:"
          (str "  galactic-center gained 1 module(s): events -- break the cycle, or add them to the cluster by"
               " hand and say why in the PR")]
         (cycle-ratchet/check-report
          (snapshot {'galactic-center '#{app-db queries sync lib driver}})
          (actual [(cluster '[app-db queries sync]) (cluster '[lib driver events])])))
      (str "a component that splits off is checked with the cluster it came from, so a module that was never"
           " cyclic cannot arrive under cover of the improvement")))

(deftest ^:parallel new-cycles-and-merges-fail-test
  (is (= [":uses graph:"
          "  new cycle among driver, lib -- break it, or record it as driver-knot and say why in the PR"]
         (cycle-ratchet/check-report (snapshot {'galactic-center '#{app-db queries}})
                                     (actual [(cluster '[app-db queries])
                                              (cluster '[driver lib] '[[driver lib] [lib driver]])]))))
  (is (= [":uses graph:"
          (str "  galactic-center absorbed notification-knot -- 5 modules in one cluster:"
               " app-db, channel, notification, queries, sync")]
         (cycle-ratchet/check-report (snapshot {'galactic-center   '#{app-db queries sync}
                                                'notification-knot '#{channel notification}})
                                     (actual [(cluster '[app-db queries sync channel notification])])))
      "the incumbent contributing the most modules is named first, then what it absorbed"))

(deftest ^:parallel a-cluster-made-of-pieces-of-two-others-is-named-once-test
  (is (= [":uses graph:"
          "  d-knot joins parts of galactic-center, notification-knot -- 3 modules in one cluster: d, e, f"]
         (cycle-ratchet/check-report (snapshot {'galactic-center   '#{a b c d e}
                                                'notification-knot '#{f g h}})
                                     (actual [(cluster '[a b c]) (cluster '[d e f])])))
      (str "galactic-center continues in the larger component, so the cluster that took the rest of it and part"
           " of notification-knot inherits neither name and is reported under the one it would be given")))

(deftest ^:parallel both-graphs-are-covered-test
  (is (= [":uses+model-imports graph:"
          (str "  galactic-center gained 1 module(s): events -- break the cycle, or add them to the cluster by"
               " hand and say why in the PR")]
         (cycle-ratchet/check-report (snapshot {'galactic-center '#{app-db queries}}
                                               :combined {'galactic-center '#{app-db queries}})
                                     (actual [(cluster '[app-db queries])]
                                             :combined [(cluster '[app-db queries events])])))
      "a cycle that only exists through model imports is caught in the combined graph"))

(deftest ^:parallel widening-by-hand-is-what-accepts-a-new-cycle-test
  (let [grown   (actual [(cluster '[app-db queries])
                         (cluster '[driver lib] '[[driver lib] [lib driver]])])
        before  (snapshot {'galactic-center '#{app-db queries}})
        widened (assoc-in before [:uses 'driver-knot] '#{driver lib})]
    (is (seq (cycle-ratchet/check-report before grown))
        "a new cycle fails against the record that predates it")
    (is (= [] (cycle-ratchet/check-report widened grown))
        "recording it by hand -- the only way to widen -- is what makes the check accept it")
    (is (thrown? clojure.lang.ExceptionInfo (cycle-ratchet/updated before grown))
        "and the fixer will not do it for you")))

;;;; =============================================================================
;;;; Recording
;;;; =============================================================================

(deftest ^:parallel recording-keeps-names-through-shrinks-splits-and-dissolutions-test
  (is (= (snapshot {'galactic-center '#{app-db queries sync}
                    'driver-knot     '#{driver lib}})
         (cycle-ratchet/updated
          (snapshot {'galactic-center   '#{app-db queries sync driver lib}
                     'notification-knot '#{channel notification}})
          (actual [(cluster '[app-db queries sync] '[[app-db queries] [queries sync] [sync app-db]])
                   (cluster '[driver lib] '[[driver lib] [lib driver]])])))
      "the incumbent keeps its name, the split component is named, and the dissolved one goes"))

(deftest ^:parallel recording-refuses-a-regression-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo #"refusing to record a worse structure"
       (cycle-ratchet/updated (snapshot {'galactic-center '#{app-db queries}})
                              (actual [(cluster '[app-db queries sync])])))
      "widening is a hand edit justified in a PR, never something the fixer blesses"))

(deftest ^:parallel a-tied-split-passes-but-is-not-recorded-test
  (let [record (snapshot {'knot '#{m1 m2 m3 m4}})]
    (is (= [] (cycle-ratchet/check-report record (actual [(cluster '[m1 m2]) (cluster '[m3 m4])])))
        "nothing grew, so the branch that split the cluster in half passes")
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"identity is ambiguous"
         (cycle-ratchet/updated record (actual [(cluster '[m1 m2]) (cluster '[m3 m4])])))
        "but the fixer will not guess which half keeps the name")
    (is (= [":uses graph:"
            (str "  m5 became cyclic in m3, m4, m5, which could continue any of knot -- break the cycle, or"
                 " record the intended split by hand")]
           (cycle-ratchet/check-report record (actual [(cluster '[m1 m2]) (cluster '[m3 m4 m5])])))
        "a module that was never cyclic still fails, ambiguous identity or not")))

(deftest ^:parallel seeding-names-the-structure-as-it-stands-test
  (is (= (snapshot {'galactic-center '#{app-db queries sync}
                    'lib-knot        '#{lib lib.schema}})
         (cycle-ratchet/updated cycle-ratchet/empty-snapshot
                                (actual [(cluster '[lib lib.schema] '[[lib lib.schema] [lib.schema lib]])
                                         (cluster '[app-db queries sync]
                                                  '[[app-db queries] [queries sync] [sync app-db]])])
                                {:seed? true}))
      "the largest cluster is galactic-center and the rest are named after the module holding them together"))

;;;; =============================================================================
;;;; Observing instead of failing
;;;; =============================================================================

(def ^:private observed
  (snapshot {'galactic-center   '#{app-db queries sync}
             'notification-knot '#{channel notification}}
            :mode :observe))

(deftest ^:parallel observe-mode-reports-every-change-test
  (is (= [":uses graph:"
          "  driver-knot: new, 2 modules: driver, lib"
          "  galactic-center: +1 module(s) events; -1 module(s) sync; now 3"
          "  notification-knot: dissolved"]
         (cycle-ratchet/report-lines observed
                                     (actual [(cluster '[app-db queries events])
                                              (cluster '[driver lib] '[[driver lib] [lib driver]])])))
      "each cluster is named as the fixer would name it, and nothing fails")
  (is (= [":uses graph:"
          (str "  galactic-center gained 1 module(s): events -- break the cycle, or add them to the cluster by"
               " hand and say why in the PR")]
         (cycle-ratchet/report-lines (assoc observed :mode :enforce)
                                     (actual [(cluster '[app-db queries sync events])
                                              (cluster '[channel notification])])))
      "the same record in :enforce mode reports only what breaks the ceiling"))

(deftest ^:parallel observe-mode-records-growth-test
  (is (= (assoc observed :uses '{galactic-center #{app-db events queries sync}
                                 notification-knot #{channel notification}})
         (cycle-ratchet/updated observed
                                (actual [(cluster '[app-db queries sync events])
                                         (cluster '[channel notification])])))
      "observing records the structure as it stands, growth included"))

(deftest ^:parallel pr-summary-test
  (let [shrunk (assoc-in observed [:uses 'galactic-center] '#{app-db queries})]
    (is (= (str "### Module cycles\n\n"
                "`./bin/mage fix-module-cycles` recorded these in `.clj-kondo/config/modules/cycle-clusters.edn`."
                " It only ever records a cluster shrinking, splitting or dissolving.\n\n"
                "```text\n"
                ":uses graph:\n"
                "  galactic-center: -1 module(s) sync; now 2\n"
                "```\n")
           (cycle-ratchet/pr-summary observed shrunk)))
    (is (nil? (cycle-ratchet/pr-summary observed observed)))))

;;;; =============================================================================
;;;; The repository itself
;;;; =============================================================================

(deftest module-cycles-test
  (let [{:keys [enforce? lines]} (cycle-scan/report)]
    (when (and (seq lines) (not enforce?))
      (cycle-scan/announce! lines))
    (testing (str "The cyclic clusters of the module graph stay within"
                  " .clj-kondo/config/modules/cycle-clusters.edn.\n"
                  "Shrinking, splitting and dissolving a cluster pass here, and the shrink workflow records them\n"
                  "on master. A module joining a cluster, two clusters merging, or a new cycle fails: break the\n"
                  "cycle, or record it by hand and say why in the PR.")
      (is (empty? (when enforce? lines))))))

(deftest cycle-clusters-file-is-normalized-test
  (testing "cycle-clusters.edn is written the way the fixer writes it, so it never diffs against itself"
    (is (= (slurp cycle-ratchet/*clusters-file*) (cycle-ratchet/render (cycle-ratchet/read-snapshot)))
        "run `./bin/mage fix-module-cycles` to normalize it")))
