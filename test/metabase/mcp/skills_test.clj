(ns metabase.mcp.skills-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   ;; the boot-time wiring that publishes the skills as resources, which `skills-are-served-as-resources-test` reads back
   [metabase.mcp.init]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.skills :as mcp.skills]))

(set! *warn-on-reflection* true)

(def ^:private min-skills
  "The registry ships at least this many skills. Every test here walks the registry, so without a floor
   they would all pass an empty one."
  5)

(def ^:private max-description-chars
  "A skill's description is what a client routes on, and every skill's rides in the index. Long enough
   to say when to load it, short enough that the whole set is not a second instructions blob."
  1024)

(defn- skill-directories
  "The skill directories on the classpath — the same place [[mcp.skills/skills]] reads from, rather than
   a path relative to whatever directory the tests happen to run in."
  []
  (into #{}
        (comp (filter #(.isDirectory ^java.io.File %))
              (map #(.getName ^java.io.File %)))
        (some-> "mcp/skills" io/resource io/file .listFiles)))

(deftest ^:parallel skills-load-and-validate-test
  (let [skills (mcp.skills/skills)]
    (is (<= min-skills (count skills)))
    (doseq [{:keys [name description markdown]} skills]
      (testing name
        (is (not (str/blank? description)))
        (is (<= (count description) max-description-chars)
            (str "the `" name "` description is " (count description) " chars; the body is where detail goes"))
        (testing "the description says when to load the skill, not just what it covers"
          (is (str/includes? description "Load")))
        (is (str/includes? markdown "\n# ")
            "a skill body with no heading is a description with extra steps")))))

(deftest ^:parallel skills-match-the-registry-test
  (testing "every skill directory on the classpath is in the registry, and vice versa — a skill the
            registry does not name is served to nobody, and a row that names no directory fails to load"
    (let [on-disk    (skill-directories)
          registered (into #{} (map :skill) mcp.skills/registry)]
      (is (<= min-skills (count on-disk)))
      (is (= on-disk registered))))
  (testing "a reference file is named by the body of the skill that ships it, so the agent knows to fetch it"
    (let [references (for [{:keys [name markdown references]} (mcp.skills/skills)
                           {:keys [file]}                     references]
                       (do (testing (str name "/" file)
                             (is (str/includes? markdown file)
                                 (str "the `" name "` body never names `" file "`, so nothing routes to it")))
                           file))]
      (is (seq references)
          "no skill declares a reference file, so this test proved nothing"))))

(deftest ^:parallel skills-are-served-as-resources-test
  (testing "each skill is readable at the `skill://` URI SEP-2640 proposes, by any authenticated caller"
    (let [skills (mcp.skills/skills)]
      (is (<= min-skills (count skills)))
      (doseq [{:keys [name uri markdown]} skills]
        (testing name
          (let [result (mcp.resources/read-resource uri #{"agent:discover:read"} {})]
            (is (= :ok (:status result)))
            (is (= markdown (:text (first (:contents result)))))
            (testing "and it is cacheable for everyone, since the bytes don't vary by caller"
              (is (= "public" (get-in result [:cache :scope])))))))))
  (testing "reference files are addressed on their own, so loading a skill doesn't drag its catalogs in"
    (doseq [{:keys [references]} (mcp.skills/skills)
            {:keys [uri markdown]} references]
      (is (= markdown (-> (mcp.resources/read-resource uri nil {}) :contents first :text)))))
  (testing "and they are advertised in resources/list"
    (let [uris (into #{} (map :uri) (:resources (mcp.resources/list-resources #{"agent:discover:read"})))]
      (doseq [{:keys [uri]} (mcp.skills/skills)]
        (is (contains? uris uri))))))

(deftest ^:parallel parse-frontmatter-test
  (testing "frontmatter is parsed off the body"
    (let [markdown           "---\nname: x\ndescription: does a thing\n---\n\n# X\n\nbody\n"
          [frontmatter body] (mcp.skills/parse-frontmatter markdown)]
      (is (= {:name "x" :description "does a thing"} frontmatter))
      (is (= "# X\n\nbody\n" body))))
  (testing "a skill with no frontmatter cannot be routed to, so it fails loudly"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no YAML frontmatter"
                          (mcp.skills/parse-frontmatter "# X\n\nbody\n")))))
