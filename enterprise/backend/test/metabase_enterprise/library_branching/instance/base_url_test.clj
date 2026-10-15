(ns metabase-enterprise.library-branching.instance.base-url-test
  "The base of the app DB instance is keyed by the repository URL: the base row holds the URL with the commit, and an
  instance of another URL has no base. The tests change the one base row of the app DB, so they are not parallel, and
  each puts the row back."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def ^:private c1 "1111111111111111111111111111111111111111")
(def ^:private c2 "2222222222222222222222222222222222222222")
(def ^:private c3 "3333333333333333333333333333333333333333")

(def ^:private url-a "https://git.example.com/a.git")
(def ^:private url-b "file:///tmp/b")

(defn- inst [url] (app-db/app-db-instance app-db/kind-stores scope/roots url))

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil :url nil} :where [:= :id 1]}))

(defn- do-with-no-base! [f]
  (reset-base!)
  (try (f) (finally (reset-base!))))

(deftest base-of-another-url-test
  (testing (str "an instance has the base of its repository only; app DB " (mdb/db-type))
    (do-with-no-base!
     (fn []
       (is (= :ok (instance/set-base! (inst url-a) nil c1 {"x" "1"})))
       (is (= {:commit_id c1 :url url-a}
              (t2/query-one {:select [:commit_id :url] :from [:library_branching_base] :where [:= :id 1]})))
       (testing "the same URL finds the base and its digests"
         (is (= c1 (instance/base (inst url-a))))
         (is (= {"x" "1"} (instance/base-digests (inst url-a) c1))))
       (testing "another URL has no base and no digests"
         (is (nil? (instance/base (inst url-b))))
         (is (nil? (instance/base-digests (inst url-b) c1)))
         (is (nil? (instance/base (inst nil)))))
       (testing "a move from the base of another URL is refused: that instance has no base"
         (is (= {:moved nil} (instance/set-base! (inst url-b) c1 c2 {}))))
       (testing "the first base of another URL replaces the row"
         (is (= :ok (instance/set-base! (inst url-b) nil c2 {"y" "2"})))
         (is (= c2 (instance/base (inst url-b))))
         (is (nil? (instance/base (inst url-a))))
         (is (= {:moved nil} (instance/set-base! (inst url-a) c2 c3 {}))))
       (testing "a base with no URL is the base of an instance with no URL only"
         (is (= :ok (instance/set-base! (inst nil) nil c3 {})))
         (is (= c3 (instance/base (inst nil))))
         (is (nil? (instance/base (inst url-b))))
         (is (= {:moved c3} (instance/set-base! (inst nil) nil c1 {}))))))))

(def ^:private op-gen
  "An operation on the base row: a read, or a compare-and-swap, by an instance of one of three URLs."
  (gen/one-of [(gen/tuple (gen/return :base) (gen/elements [nil url-a url-b]))
               (gen/tuple (gen/return :set-base!) (gen/elements [nil url-a url-b])
                          (gen/elements [nil c1 c2]) (gen/elements [c1 c2 c3]))]))

(defn- model-step
  "The model of the base row `row` (`{:url u :commit c}`): `[row' result]` of `op`."
  [row [op url expected new]]
  (let [base (when (= url (:url row)) (:commit row))]
    (case op
      :base      [row base]
      :set-base! (if (= expected base)
                   [{:url url :commit new} :ok]
                   [row {:moved base}]))))

(defspec base-keyed-by-url-law-test 40
  (prop/for-all [ops (gen/vector op-gen 1 10)]
    (do-with-no-base!
     (fn []
       (let [[_ want] (reduce (fn [[row results] op]
                                (let [[row' result] (model-step row op)]
                                  [row' (conj results result)]))
                              [{:url nil :commit nil} []]
                              ops)
             got      (mapv (fn [[op url expected new]]
                              (case op
                                :base      (instance/base (inst url))
                                :set-base! (instance/set-base! (inst url) expected new {})))
                            ops)]
         (is (= want got) (pr-str ops))
         (= want got))))))
