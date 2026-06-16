(ns metabase.search.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.config :as search.config]
   [metabase.util.malli.registry :as mr]))

;; All that matters is that this is not legacy search.
(def ^:private search-engine :search.engine/appdb)

;; `filter-default` and `weights` take an already-normalized context (normalization happens once at the top
;; of the search call tree); these tests pass the normalized values directly.

(deftest filter-default-test
  (testing "Default values"
    (is (= false (search.config/filter-default search-engine nil :archived)))
    (is (= "all" (search.config/filter-default search-engine nil :filter-items-in-personal-collection))))
  (testing "the :global profile excludes others' personal collections"
    (is (= "exclude-others"
           (search.config/filter-default search-engine :global :filter-items-in-personal-collection))))
  (testing "Legacy search uses the same per-context defaults (#UXW-3238)"
    (is (= "exclude-others"
           (search.config/filter-default :search.engine/in-place :global :filter-items-in-personal-collection)))))

(deftest context-schema-test
  (testing "the HTTP `context` enum allows the UI surfaces, :api, and :metabot (accepted for debugging)"
    (is (mr/validate search.config/Context :search-app))
    (is (mr/validate search.config/Context :api))
    (is (mr/validate search.config/Context :metabot)))
  (testing "values outside the enum are rejected"
    (is (not (mr/validate search.config/Context :bogus)))))

(deftest normalized-context-test
  (testing "the broad-search surfaces normalize to a single :global context"
    (is (= [:global :global :global]
           (map search.config/normalized-context [:search-app :command-palette :type-filter]))))
  (testing "the nav search bar is intentionally not normalized (keeps default filters/weights for now)"
    (is (= :search-bar (search.config/normalized-context :search-bar))))
  (testing "every other context normalizes to itself"
    (is (= [:entity-picker :data-picker :metabot :api]
           (map search.config/normalized-context [:entity-picker :data-picker :metabot :api]))))
  (testing "static-context-weights are keyed only by normalized contexts, never the :default base"
    (is (not (contains? search.config/static-context-weights :default)))
    (is (every? (set search.config/normalized-contexts) (keys search.config/static-context-weights)))))

(deftest normalize-override-keys-test
  (let [normalize #'search.config/normalize-override-keys]
    (testing "an override persisted under a context that has since collapsed is re-keyed to its normalized context"
      (is (= {:global {:exact 1}} (normalize {:command-palette {:exact 1}}))))
    (testing "when a raw alias and its normalized context both have overrides, the normalized one wins"
      (is (= {:global {:exact 2}} (normalize {:command-palette {:exact 1} :global {:exact 2}})))
      (is (= {:global {:text 5 :exact 9}} (normalize {:type-filter {:text 5} :global {:exact 9}}))))
    (testing "the :default base and un-remapped contexts pass through untouched"
      (is (= {:default {:text 7} :entity-picker {:exact 3}}
             (normalize {:default {:text 7} :entity-picker {:exact 3}}))))
    (testing "legacy flat overrides (bare weights, not per-context maps) fold into the :default base"
      (is (= {:default {:text 7.0 :exact 3.0}} (normalize {:text 7.0 :exact 3.0})))
      (is (= {:global {:exact 1} :default {:text 7.0}} (normalize {:command-palette {:exact 1} :text 7.0}))))
    (testing "an explicit :default context override wins over a legacy flat weight for the same scorer"
      (is (= {:default {:text 5.0 :exact 9}} (normalize {:text 5.0 :exact 1.0 :default {:exact 9}})))))
  (testing "several aliases collapsing to one normalized context resolve deterministically, regardless of
            input order (the lowest-sorted alias wins among aliases)"
    (let [normalize #'search.config/normalize-override-keys]
      (is (= {:global {:exact 2}}
             (normalize (array-map :search-app {:exact 1} :command-palette {:exact 2}))
             (normalize (array-map :command-palette {:exact 2} :search-app {:exact 1})))))))

(deftest weights-by-context-test
  (testing "the broad-search surfaces share one weight profile that boosts prefix matches"
    (is (= 5 (search.config/weight {:context :global} :prefix)))
    (is (= 0 (search.config/weight {:context :default} :prefix)))))

(deftest known-rankers-test
  (testing "overridable rankers span every profile, not just :default"
    ;; :library lives in :default; :data-layer only in :metabot
    (is (contains? search.config/known-rankers :library))
    (is (contains? search.config/known-rankers :data-layer))))

(deftest weight-tuning-test
  (testing "an exact name match outranks a single curation tier"
    (is (> (search.config/weight {:context :global} :exact)
           (search.config/weight {:context :global} :verified))))
  (testing "the library boost is opt-in: off by default, a curation-tier boost for the data picker"
    (is (= 0 (search.config/weight {:context :global} :library)))
    (is (= 80 (search.config/weight {:context :data-picker} :library))))
  (testing "in the data picker, an exact name match can overpower the library boost"
    (is (> (search.config/weight {:context :data-picker} :exact)
           (search.config/weight {:context :data-picker} :library))))
  (testing "curation badges are tie-breakers by default; the data picker boosts them, but the library boost
            outweighs both badges combined"
    (is (= 1 (search.config/weight {:context :global} :official-collection)))
    (is (= 1 (search.config/weight {:context :global} :verified)))
    (is (> (search.config/weight {:context :data-picker} :library)
           (+ (search.config/weight {:context :data-picker} :official-collection)
              (search.config/weight {:context :data-picker} :verified))))))
