(ns dev.security-lint.callgraph-test
  (:require
   [clojure.test :refer :all]
   [dev.security-lint.callgraph :as cg]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(defn- root [s] (z/root (z/of-string s {:track-position? true})))

(def ^:private src
  "(ns t)

(defn- helper [idp redirect]
  (str idp redirect))

(defn handle [request]
  (let [target (get-in request [:params :redirect])]
    (helper \"https://idp\" target)))
")

(deftest param-slots-test
  (testing "each parameter of a defn becomes a numbered slot with a source region"
    (let [slots (:params (cg/extract "f.clj" 't (root src)))
          by-fn (group-by :fn slots)]
      (is (= #{'t/helper 't/handle} (set (keys by-fn))))
      (is (= [0 1] (map :index (sort-by :index (by-fn 't/helper)))))
      (is (= [0] (map :index (by-fn 't/handle)))))))

(deftest binding-inits-test
  (testing "a let binding records the region of its init expression"
    (let [inits (:inits (cg/extract "f.clj" 't (root src)))]
      (is (= 1 (count inits)))
      (is (= 7 (-> inits first :bind :row)) "target is bound on row 7"))))

(deftest call-args-test
  (testing "each argument of a call gets an index and a region"
    (let [calls (->> (cg/extract "f.clj" 't (root src)) :calls (filter #(= 'helper (:head %))))]
      (is (= [0 1] (map :index (sort-by :index calls)))))))

(deftest propagation-reaches-across-functions-test
  (testing "a request value flows through a let and a call into the callee's parameter"
    (let [;; stand-ins for what clj-kondo reports; ids are arbitrary but stable
          locals  [{:id 1 :name 'idp      :filename "f.clj" :row 3 :col 16}
                   {:id 2 :name 'redirect :filename "f.clj" :row 3 :col 20}
                   {:id 3 :name 'request  :filename "f.clj" :row 6 :col 15}
                   {:id 4 :name 'target   :filename "f.clj" :row 7 :col 9}]
          usages  [{:id 3 :filename "f.clj" :row 7 :col 24}     ; request, inside target's init
                   {:id 4 :filename "f.clj" :row 8 :col 27}     ; target, as helper's 2nd argument
                   {:id 1 :filename "f.clj" :row 4 :col 8}      ; idp, in helper's body
                   {:id 2 :filename "f.clj" :row 4 :col 12}]    ; redirect, in helper's body
          tables  {"f.clj" (cg/extract "f.clj" 't (root src))}
          tainted (cg/propagate {:tables tables :locals locals :local-usages usages :sources #{3}})]
      (testing "the request parameter itself stays tainted"
        (is (contains? tainted 3)))
      (testing "the let binding initialized from it becomes tainted"
        (is (contains? tainted 4)))
      (testing "the callee parameter it is passed to becomes tainted"
        (is (contains? tainted 2) "helper's `redirect` parameter"))
      (testing "an unrelated parameter of the same callee does not"
        (is (not (contains? tainted 1)) "helper's `idp` parameter receives a literal")))))

(deftest source-regions-test
  (testing "a Ring request parameter is a trust boundary"
    (let [t (cg/extract "f.clj" 't (root src))]
      (is (= 1 (count (:sources t))))
      (is (= 6 (-> t :sources first :row)) "the request param on row 6")))
  (testing "a defendpoint parameter vector is a trust boundary"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [u]}] u)\n"))]
      (is (= 1 (count (:sources t))))))
  (testing "an ordinary parameter is not"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn f [x] x)\n"))]
      (is (empty? (:sources t))))))

(deftest metadata-on-defn-name-test
  (testing "a ^:private defn still contributes parameter slots"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn ^:private redirect-to-idp [idp redirect]\n  (str idp redirect))\n"))]
      (is (= ['t/redirect-to-idp 't/redirect-to-idp] (map :fn (:params t))))
      (is (= [0 1] (sort (map :index (:params t)))))))
  (testing "and so does a defn- with a metadata-tagged parameter"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn- g ^String [^String s] s)\n"))]
      (is (= 1 (count (:params t)))))))

(deftest anonymous-handler-is-a-source-test
  (testing "an anonymous fn destructuring a Ring request is a trust boundary"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn- h [url]\n  (fn [{:keys [query-string]} respond _raise]\n    (respond (str url query-string))))\n"))]
      (is (= 1 (count (:sources t))))
      (is (= 3 (-> t :sources first :row)))))
  (testing "an anonymous fn destructuring something else is not"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn- h []\n  (fn [{:keys [total count]}] total))\n"))]
      (is (empty? (:sources t)))))
  (testing "a named parameter still works alongside it"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request] request)\n"))]
      (is (= 1 (count (:sources t)))))))

(deftest destructuring-binding-test
  (testing "a destructured let binding is tainted by its initializer"
    (let [t {"f.clj" (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request]\n  (let [{:keys [url]} request]\n    url))\n"))}
          ;; `request` is the parameter on row 2; `url` is bound inside the map on row 3
          locals [{:id 1 :name 'request :filename "f.clj" :row 2 :col 10}
                  {:id 2 :name 'url     :filename "f.clj" :row 3 :col 17}]
          usages [{:id 1 :filename "f.clj" :row 3 :col 23}]
          tainted (cg/propagate {:tables t :locals locals :local-usages usages :sources #{1}})]
      (is (contains? tainted 2) "url, destructured from the request"))))

(deftest multi-arity-params-test
  (testing "every arity of a multi-arity defn contributes parameter slots"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn- h ([u] u) ([u v] [u v]))\n"))]
      (is (= 3 (count (:params t))) "u, and u/v from the second arity")
      (is (= #{0 1} (set (map :index (:params t))))))))

(deftest rest-args-test
  (testing "a rest parameter is marked and keeps the position it starts at"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn- h [a & more] [a more])\n"))]
      (is (= [{:index 0 :rest? nil} {:index 1 :rest? true}]
             (map #(hash-map :index (:index %) :rest? (:rest? %)) (sort-by :index (:params t))))))))

(deftest threading-steps-test
  (testing "each step of a thread records a call receiving the seed"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request] (-> request :url render))\n"))
          synthetic (filter #(= 'render (:head %)) (:calls t))]
      (is (= 1 (count synthetic)))
      (is (= 0 (:index (first synthetic))) "-> threads into the first position")))
  (testing "->> threads into the last position"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request] (->> request render))\n"))]
      (is (= [:last] (map :index (filter #(= 'render (:head %)) (:calls t))))))))

(deftest higher-order-test
  (testing "a collection argument taints the function applied to it"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request] (mapv render (:items request)))\n"))
          synthetic (filter #(= 'render (:head %)) (:calls t))]
      (is (= 1 (count synthetic)))
      (is (= 0 (:index (first synthetic))))))
  (testing "a function in a non-first position is not modelled"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn h [request] (reduce combine {} (:items request)))\n"))]
      (is (empty? (filter #(and (= 'combine (:head %)) (= 0 (:index %))) (:calls t)))))))

(def ^:private reach-src
  "(ns t (:require [metabase.api.macros :as api.macros]))

(defn- deep [x] x)

(defn- middle [x] (deep x))

(defn- orphan [x] (deep x))

(api.macros/defendpoint :get \"/x\"
  \"doc\"
  [_route _query {:keys [id]}]
  (middle id))
")

(deftest fn-regions-test
  (testing "each defn records the region of its whole form, so a call can be attributed to its caller"
    (let [t (cg/extract "f.clj" 't (root reach-src))]
      (is (= #{'t/deep 't/middle 't/orphan} (set (map :fn (:fns t))))))))

(deftest endpoint-reachability-test
  (let [tables {"f.clj" (cg/extract "f.clj" 't (root reach-src))}
        reach  (cg/reachable-regions {:tables tables :resolve {}})
        at     (fn [row] (cg/reachable? reach {:filename "f.clj" :row row :col 3}))]
    (testing "functions called from an endpoint are reachable, transitively"
      (is (true? (at 5)) "middle, called directly by the endpoint")
      (is (true? (at 3)) "deep, called by middle"))
    (testing "a function nothing routes to is not"
      (is (false? (at 7)) "orphan is never called from an endpoint"))))

(def ^:private guard-src
  "(ns t (:require [clojure.java.io :as io] [metabase.api.macros :as api.macros]))

(defn- guarded [session-id]
  (when (re-matches #\"^[a-z0-9-]+$\" (str session-id))
    (io/file \"/data\" (str session-id \".jsonl\"))))

(defn- unguarded [session-id]
  (io/file \"/data\" (str session-id \".jsonl\")))

(api.macros/defendpoint :get \"/:session-id\"
  \"doc\"
  [{:keys [session-id]} _query _body]
  [(guarded session-id) (unguarded session-id)])
")

(deftest guard-extraction-test
  (testing "a conditional whose test validates a value records the body it protects"
    (let [t (cg/extract "f.clj" 't (root guard-src))]
      (is (= 1 (count (:guards t))))
      (is (= 4 (-> t :guards first :checks first :row)) "the re-matches check on row 4")
      (is (= 5 (-> t :guards first :body :row)) "the body it guards on row 5"))))

(def ^:private throwing-guard-src
  "(ns t)

(def ^:private units #{:day :month})

(defn- guarded [unit x]
  (when-not (contains? units unit)
    (throw (ex-info \"bad unit\" {:unit unit})))
  [:raw (name unit)]
  x)

(defn- not-a-guard [unit]
  (when-not (contains? units unit)
    (log/warn \"odd unit\" unit))
  [:raw (name unit)])
")

(deftest throwing-guard-extraction-test
  (testing "a when-not whose body only throws is an assertion: it vouches for the forms after it in the same body"
    (let [t (cg/extract "f.clj" 't (root throwing-guard-src))]
      (is (= 1 (count (:guards t))) "the logging when-not vouches for nothing: its body runs on and the value is still used")
      (is (= 6 (-> t :guards first :checks first :row)) "the contains? check on row 6")
      (is (= [8 9] ((juxt :row :end-row) (-> t :guards first :body))) "the forms after it, to the end of the body"))))

(def ^:private privilege-routes
  "(ns metabase.api-routes.routes (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :as routes.common]))
(defn- +auth [h] (routes.common/+auth (api.macros/ns-handler h)))
(def ^:private route-map {\"/a\" (+auth 'metabase.a.api) \"/pub\" 'metabase.pub.api \"/adm\" (+auth 'metabase.adm.api)
                          \"/transform\" (+auth 'metabase.transforms-rest.api.transform) \"/database\" (+auth 'metabase.warehouses-rest.api)})
")

(def ^:private privilege-a
  "(ns metabase.a.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [metabase.permissions.core :as perms]))
(api.macros/defendpoint :get \"/plain\" \"doc\" [_r _q _b] (metabase.helpers/shared))
(api.macros/defendpoint :get \"/su\" \"doc\" [_r _q _b] (api/check-superuser) (metabase.helpers/su-only))
(api.macros/defendpoint :get \"/setting\" \"doc\" [_r _q _b] (perms/check-has-application-permission :setting) (metabase.helpers/setting-only))
(defn- gate [] (api/check-superuser))
(api.macros/defendpoint :get \"/su-nearby\" \"doc\" [_r _q _b] (gate) 1)
")

(def ^:private privilege-pub
  "(ns metabase.pub.api (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] (metabase.helpers/shared))
")

(def ^:private privilege-transforms
  "(ns metabase.transforms-rest.api.transform (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :post \"/:id/run\" \"doc\" [_r _q _b] 1)
")

(def ^:private privilege-warehouses
  "(ns metabase.warehouses-rest.api (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/:id\" \"doc\" [_r _q _b] 1)
(api.macros/defendpoint :put \"/:id\" \"doc\" [_r _q _b] 1)
")

(def ^:private privilege-adm
  "(ns metabase.adm.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api]))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] 1)
(def routes (api.macros/ns-handler *ns* api/+check-superuser))
")

(def ^:private privilege-helpers
  "(ns metabase.helpers (:require [clojurewerkz.quartzite.jobs :as jobs]))
(defn shared [] 1)
(defn su-only [] 2)
(defn setting-only [] 3)
(defn job-only [] 4)
(defn nobody [] 5)
(jobs/defjob Nightly [_] (job-only))
")

(defn- privilege-reach
  "The helpers are called fully qualified: with no clj-kondo resolution in these unit tests, only a qualified head
  crosses files."
  []
  (let [files {"routes.clj" ['metabase.api-routes.routes privilege-routes]
               "a.clj"      ['metabase.a.api privilege-a]
               "pub.clj"    ['metabase.pub.api privilege-pub]
               "adm.clj"    ['metabase.adm.api privilege-adm]
               "tr.clj"     ['metabase.transforms-rest.api.transform privilege-transforms]
               "wh.clj"     ['metabase.warehouses-rest.api privilege-warehouses]
               "helpers.clj" ['metabase.helpers privilege-helpers]}
        tables (into {} (for [[f [ns src]] files] [f (cg/extract f ns (root src))]))]
    (cg/reachable-regions {:tables tables :resolve {}})))

(deftest entry-privilege-test
  (testing "the least an actor needs to hold to start at each endpoint"
    (let [reach (privilege-reach)
          at    (fn [file row] (:privilege (first (filter #(and (= file (:filename %)) (= row (:row %))) (cg/entries reach)))))]
      (is (= :session  (at "a.clj" 2)) "mounted under +auth and checks nothing more")
      (is (= :superuser (at "a.clj" 3)) "check-superuser in the body")
      (is (= :elevated  (at "a.clj" 4)) "an application permission a non-superuser can hold")
      (is (= :superuser (at "a.clj" 6)) "check-superuser one hop down")
      (is (= :anonymous (at "pub.clj" 2)) "mounted under no authenticating wrapper")
      (is (= :superuser (at "adm.clj" 2)) "the namespace's own ns-handler wraps every endpoint in +check-superuser")
      (is (= :elevated  (at "tr.clj" 2)) "a transform: the model's own checks need the data-analyst flag, by vocabulary")
      (is (= :session   (at "wh.clj" 2)) "reading a database is any user's")
      (is (= :elevated  (at "wh.clj" 3)) "writing one is manage-database, by vocabulary"))))

(deftest min-privilege-test
  (testing "the least privilege among everything that reaches a position; a job is nobody's request"
    (let [reach (privilege-reach)
          at    (fn [row] (cg/min-privilege reach {:filename "helpers.clj" :row row :col 3}))]
      (is (= :anonymous  (at 2)) "shared: reached from the public mount as well as the session one")
      (is (= :superuser  (at 3)) "su-only: only through the superuser check")
      (is (= :elevated   (at 4)) "setting-only: only through the application-permission check")
      (is (= :background (at 5)) "job-only: no request starts here")
      (is (nil? (at 6)) "nobody: nothing reaches it"))))

(def ^:private middleware-src
  "(ns metabase.server.middleware.x (:require [metabase.settings.core :as setting]))
(defn- act [v] v)
(defn wrap-x [handler]
  (fn [request respond raise]
    (act (get-in request [:headers \"host\"]))
    (handler request respond raise)))
")

(deftest middleware-entry-kind-test
  (testing "Ring middleware is an entry of its own kind, and starts an anonymous path: it runs before any session is checked"
    (let [tables {"mw.clj" (cg/extract "mw.clj" 'metabase.server.middleware.x (root middleware-src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          pos    {:filename "mw.clj" :row 2 :col 3}]
      (is (= #{:middleware} (cg/reachable-from reach pos)))
      (is (= :anonymous (cg/min-privilege reach pos))))))

(def ^:private superuser-guard-src
  "(ns metabase.a.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api]))
(defn- act [v] v)
(api.macros/defendpoint :get \"/flag\" \"doc\" [_r _q _b {superuser? :is-superuser?}]
  (when superuser?
    (act 1))
  (act 2))
(api.macros/defendpoint :get \"/var\" \"doc\" [_r _q _b]
  (if api/*is-superuser?*
    (act 3)
    (act 4)))
")

(deftest superuser-guard-test
  (testing "a branch a superuser flag guards is a superuser's, whatever reaches the endpoint"
    (let [tables {"routes.clj" (cg/extract "routes.clj" 'metabase.api-routes.routes (root privilege-routes))
                  "a.clj"      (cg/extract "a.clj" 'metabase.a.api (root superuser-guard-src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          at     (fn [row col] (cg/min-privilege reach {:filename "a.clj" :row row :col col}))]
      (is (= :superuser (at 5 5)) "under (when superuser? ...), the flag destructured from the request")
      (is (= :session   (at 6 3)) "after it")
      (is (= :superuser (at 9 5)) "the then-branch of (if api/*is-superuser?* ...)")
      (is (= :session   (at 10 5)) "not the else-branch"))))

(def ^:private conditional-check-src
  "(ns metabase.a.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api]))
(defn- maybe-gate [x] (when x (api/check-superuser)))
(defn- rescue-gate [] (try (check-a) (catch Exception _ (api/check-superuser))))
(defn- gate [] (api/check-superuser))
(defn- branch-gate [x] (if x (api/check-superuser) (check-b)))
(api.macros/defendpoint :get \"/maybe\" \"doc\" [_r _q _b] (maybe-gate 1))
(api.macros/defendpoint :get \"/rescue\" \"doc\" [_r _q _b] (rescue-gate))
(api.macros/defendpoint :get \"/always\" \"doc\" [_r _q _b] (gate))
(api.macros/defendpoint :get \"/branch\" \"doc\" [_r _q _b] (branch-gate 1))
(api.macros/defendpoint :get \"/inline\" \"doc\" [_r _q _b] (when (flag) (api/check-superuser)) 1)
(api.macros/defendpoint :get \"/inline-always\" \"doc\" [_r _q _b] (api/check-superuser) 1)
")

(deftest conditional-check-does-not-grade-test
  (testing "a check that runs only on some branch does not raise the privilege an endpoint demands: the other
            branch is any session's"
    (let [tables {"routes.clj" (cg/extract "routes.clj" 'metabase.api-routes.routes (root privilege-routes))
                  "a.clj"      (cg/extract "a.clj" 'metabase.a.api (root conditional-check-src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          at     (fn [row] (:privilege (first (filter #(and (= "a.clj" (:filename %)) (= row (:row %))) (cg/entries reach)))))]
      (is (= :session   (at 6))  "check-superuser under (when x ...) one hop down")
      (is (= :session   (at 7))  "check-superuser in a catch clause")
      (is (= :superuser (at 8))  "an unconditional check-superuser one hop down still grades")
      (is (= :session   (at 9))  "check-superuser in one branch of an if")
      (is (= :session   (at 10)) "check-superuser under (when ...) in the endpoint's own body")
      (is (= :superuser (at 11)) "and unconditional there"))))

(deftest superuser-flag-guard-extraction-test
  (let [guards (fn [src] (:privilege-guards (cg/extract "f.clj" 't (root src))))]
    (testing "a bare symbol named like the flag guards only when it was destructured from a parameter's :is-superuser? key"
      (is (empty? (guards "(ns t)\n(defn f [is-superuser? x] (when is-superuser? (act x)))\n"))
          "a plain parameter is whatever the caller passed")
      (is (= 1 (count (guards "(ns t)\n(defn f [{:keys [is-superuser?]} x] (when is-superuser? (act x)))\n"))))
      (is (= 1 (count (guards "(ns t)\n(defn f [{superuser? :is-superuser?} x] (when superuser? (act x)))\n"))))
      (is (= 1 (count (guards "(ns t (:require [metabase.api.macros :as api.macros]))\n(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b {:keys [is-superuser?]}] (when is-superuser? (act 1)))\n")))
          "a defendpoint's request slot"))
    (testing "the flag read off a request parameter"
      (is (= 1 (count (guards "(ns t)\n(defn f [request x] (when (:is-superuser? request) (act x)))\n"))))
      (is (empty? (guards "(ns t)\n(defn f [user x] (when (:is-superuser? user) (act x)))\n"))
          "read off some other map, a User row's flag is that user's"))
    (testing "the dynamic var, qualified or not, alone or under and"
      (is (= 1 (count (guards "(ns t (:require [metabase.api.common :as api]))\n(defn f [x] (when api/*is-superuser?* (act x)))\n"))))
      (is (= 1 (count (guards "(ns t)\n(defn f [x] (if *is-superuser?* (act x) (act 0)))\n"))))
      (is (= 1 (count (guards "(ns t (:require [metabase.api.common :as api]))\n(defn f [x] (when (and x api/*is-superuser?*) (act x)))\n")))))))

(deftest nullary-higher-order-call-test
  (testing "a bare (map) does not crash extraction"
    (is (map? (cg/extract "f.clj" 't (root "(ns t)\n(defn f [] (map))\n(defn g [] (-> 1))\n"))))))

(deftest no-guard-without-a-validator-test
  (testing "an ordinary conditional is not a guard"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn f [x] (when (seq x) (prn x)))\n"))]
      (is (empty? (:guards t))))))

(deftest per-entry-closure-test
  (testing "each endpoint gets its own transitive closure, not the union over all endpoints"
    (let [src    "(ns t (:require [metabase.api.macros :as api.macros]))
(defn- a [] 1)
(defn- b [] (a))
(defn- c [] 2)
(api.macros/defendpoint :get \"/one\" \"doc\" [_r _q _b] (b))
(api.macros/defendpoint :get \"/two\" \"doc\" [_r _q _b] (c))
"
          tables {"f.clj" (cg/extract "f.clj" 't (root src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          entries (cg/entries reach)
          at-row (fn [row] (first (filter #(= row (:row %)) entries)))]
      (is (= 2 (count entries)))
      (is (= '#{t/b t/a} (cg/entry-closure reach (at-row 5))) "/one reaches b, and a through it")
      (is (= '#{t/c}      (cg/entry-closure reach (at-row 6))) "/two reaches only c"))))

(deftest function-values-are-callees-test
  (testing "a function passed to filter, or named as a threading step, is reachable"
    (let [src "(ns t (:require [metabase.api.macros :as api.macros]))
(defn- can-read? [x] x)
(defn- norm [x] x)
(defn- lst [] (filter can-read? []))
(defn- thr [x] (-> x norm))
(api.macros/defendpoint :get \"/a\" \"doc\" [_r _q _b] (lst))
(api.macros/defendpoint :get \"/b\" \"doc\" [_r _q _b] (thr 1))
"
          tables {"f.clj" (cg/extract "f.clj" 't (root src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          at     (fn [row] (cg/entry-closure reach (first (filter #(= row (:row %)) (cg/entries reach)))))]
      (is (contains? (at 6) 't/can-read?) "filter's predicate")
      (is (contains? (at 7) 't/norm) "a bare threading step"))))

(deftest mu-defn-test
  (testing "mu/defn contributes parameter slots and a function region like defn"
    (let [t (cg/extract "f.clj" 't (root "(ns t (:require [metabase.util.malli :as mu]))\n(mu/defn fetch [id :- :int] id)\n"))]
      (is (= ['t/fetch] (map :fn (:fns t))))
      (is (= 1 (count (:params t))) "id -- the `:- :int` annotation is not a parameter")))
  (testing "a return schema between the name and the arglist is skipped, not mistaken for the arglist"
    (let [t (cg/extract "f.clj" 't (root "(ns t (:require [metabase.util.malli :as mu]))\n(mu/defn fetch :- [:map [:id :int]] [id :- :int] id)\n"))]
      (is (= 1 (count (:params t))))
      (is (= 2 (-> t :params first :region :row)) "the slot is `id` on row 2, not the schema")))
  (testing "mu/defmethod and mu/defn- too"
    (let [t (cg/extract "f.clj" 't (root "(ns t (:require [metabase.util.malli :as mu]))\n(mu/defn- h [x] x)\n(mu/defmethod g :k [y] y)\n"))]
      (is (= '#{t/h t/g} (set (map :fn (:fns t)))))))
  (testing "a schema-annotated parameter vector still yields one slot per parameter, at the right index"
    (let [t (cg/extract "f.clj" 't (root "(ns t (:require [metabase.util.malli :as mu]))\n(mu/defn h [a :- :int b :- :string] [a b])\n"))]
      (is (= [0 1] (sort (map :index (:params t))))))))

(def ^:private entries-src
  "(ns t (:require [metabase.api.macros :as api.macros] [clojurewerkz.quartzite.jobs :as jobs] [metabase.mq.core :as mq]))
(defn- shared [] 1)
(defn- only-from-job [] (shared))
(defn- only-from-http [] (shared))
(jobs/defjob Nightly [_ctx] (only-from-job))
(mq/def-listener! :queue/things [messages] (only-from-job))
(defn ^:command migrate [] (shared))
(defn -main [& _] (shared))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] (only-from-http))
")

(deftest entry-kinds-test
  (testing "each kind of entry point is recognized and tagged"
    (let [t (cg/extract "f.clj" 't (root entries-src))]
      (is (= {:job 1 :mq 1 :cli 1 :startup 1 :http 1} (frequencies (map :kind (:entries t))))))))

(deftest reachable-from-kinds-test
  (let [tables {"f.clj" (cg/extract "f.clj" 't (root entries-src))}
        reach  (cg/reachable-regions {:tables tables :resolve {}})
        at     (fn [row] (cg/reachable-from reach {:filename "f.clj" :row row :col 3}))]
    (testing "a function tells apart what reaches it"
      (is (= #{:job :mq} (at 3)) "only-from-job: the Quartz job and the queue consumer")
      (is (= #{:http} (at 4)) "only-from-http: the endpoint")
      (is (= #{:job :mq :cli :startup :http} (at 2)) "shared: everything"))
    (testing "an entry itself is reachable by its own kind"
      (is (= #{:cli} (at 7))))))

(deftest every-implementation-of-a-reached-multimethod-is-reachable-test
  (testing "two defmethods on one multimethod are both reachable when the multimethod is called"
    (let [src "(ns t (:require [metabase.api.macros :as api.macros]))
(defmulti run :kind)
(defmethod run :a [_] 1)
(defmethod run :b [_] 2)
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q body] (run body))
"
          tables {"f.clj" (cg/extract "f.clj" 't (root src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          at     (fn [row] (cg/reachable-from reach {:filename "f.clj" :row row :col 3}))]
      (is (= #{:http} (at 3)) "the :a implementation")
      (is (= #{:http} (at 4)) "the :b implementation -- previously only the last one was marked")
      (testing "and a path into one implementation ends at that implementation, not the first one by that name"
        (is (= 4 (:row (last (get-in (cg/flows-to reach {:filename "f.clj" :row 4 :col 3}) [:http :path])))))
        (is (= 3 (:row (last (get-in (cg/flows-to reach {:filename "f.clj" :row 3 :col 3}) [:http :path])))))))))

(deftest defenterprise-test
  (testing "defenterprise defines a function with parameter slots, skipping the docstring and the EE namespace"
    (let [t (cg/extract "f.clj" 't (root "(ns t (:require [metabase.premium-features.core :refer [defenterprise]]))
(defenterprise hash-input \"doc\" metabase-enterprise.sandbox.impl [user] user)\n"))]
      (is (= ['t/hash-input] (map :fn (:fns t))))
      (is (= 1 (count (:params t))))))
  (testing "and calls its EE implementation by name, so the EE side is reachable when the OSS side is"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defenterprise hash-input \"doc\" ee.impl [user] user)\n"))]
      (is (some #(= 'ee.impl/hash-input (:head %)) (:call-sites t)))))
  (testing "with a return schema between the name and the namespace"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defenterprise-schema f :- :int \"doc\" ee.impl [x :- :int] x)\n"))]
      (is (= 1 (count (:params t))))
      (is (some #(= 'ee.impl/f (:head %)) (:call-sites t))))))

(deftest requiring-resolve-literal-is-an-edge-test
  (testing "a quoted, qualified symbol handed to requiring-resolve is a call by name the graph can see"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn boot [] ((requiring-resolve 'metabase.config.file/initialize!)))\n(defn f [] (resolve 'other.ns/g))\n"))]
      (is (some #(= 'metabase.config.file/initialize! (:head %)) (:call-sites t)))
      (is (some #(= 'other.ns/g (:head %)) (:call-sites t)))))
  (testing "a computed symbol yields nothing rather than a bogus edge"
    (let [t (cg/extract "f.clj" 't (root "(ns t)\n(defn f [s] (requiring-resolve (symbol s)))\n"))]
      (is (not-any? #(= 'symbol (:head %)) (filter #(re-find #"resolve" (str (:head %))) (:call-sites t)))))))

(deftest load-time-and-live-body-entries-test
  (let [t (cg/extract "f.clj" 't (root "(ns t (:require [toucan2.core :as t2] [metabase.settings.core :refer [defsetting]]))
(def config (load-config!))
(def lazy (delay (expensive)))
(def handler (fn [] (never-at-load)))
(register-thing! :x)
(defn helper [] 1)
(t2/define-before-insert :model/X [x] (helper))
(defsetting foo \"doc\" :setter set-foo!)
(defrecord R [] P (m [_] (helper)))
(extend-protocol P String (m [_] (helper)))
"))
        kinds (frequencies (map :kind (:entries t)))
        rows-of (fn [k] (set (map :row (filter #(= k (:kind %)) (:entries t)))))]
    (testing "a top-level def that runs its initializer, and a bare top-level call, run at startup"
      (is (= #{2 5} (rows-of :startup)) "config and register-thing!; not the delay, the fn, or the defn"))
    (testing "lifecycle hooks and settings are entries of their own kind"
      (is (= 1 (:lifecycle kinds)))
      (is (= 1 (:setting kinds))))
    (testing "record and protocol-extension bodies are live code tagged :protocol"
      (is (= #{9 10} (rows-of :protocol))))
    (testing "the ns form is remembered so :refer is not taken for a use"
      (is (= 1 (-> t :ns-region :row))))))

(deftest flows-to-test
  (let [tables {"f.clj" (cg/extract "f.clj" 't (root entries-src))}
        reach  (cg/reachable-regions {:tables tables :resolve {}})
        flows  (cg/flows-to reach {:filename "f.clj" :row 2 :col 3})]
    (testing "one shortest path per entry kind, from a named entry to the function holding the position"
      (is (= #{:job :mq :cli :startup :http} (set (keys flows))))
      (is (= ["GET /x" "t/only-from-http" "t/shared"] (mapv :name (get-in flows [:http :path]))))
      (is (= ["defjob Nightly" "t/only-from-job" "t/shared"] (mapv :name (get-in flows [:job :path]))))
      (is (= ["def-listener! :queue/things" "t/only-from-job" "t/shared"] (mapv :name (get-in flows [:mq :path]))))
      (is (= ["t/migrate" "t/shared"] (mapv :name (get-in flows [:cli :path])))))
    (testing "how many entries of each kind reach it, and which"
      (is (= 1 (get-in flows [:http :count])))
      (is (= ["GET /x"] (get-in flows [:http :entries]))))
    (testing "each step carries a position for the report to link"
      (is (every? #(and (:filename %) (pos-int? (:row %))) (get-in flows [:http :path]))))
    (testing "a position directly inside an entry has a one-step path"
      (is (= ["defjob Nightly"] (mapv :name (get-in (cg/flows-to reach {:filename "f.clj" :row 5 :col 30}) [:job :path])))))
    (testing "nothing reaches a position outside every function"
      (is (= {} (cg/flows-to reach {:filename "f.clj" :row 99 :col 1}))))))

(def ^:private unreached-src
  "(ns t)
(defn- sink [x] x)
(defn- step! [acc x] (sink x) acc)
(defn- run! [xs] (reduce step! nil xs))
(defn- lonely [] (sink 1))
(defn- also-lonely [] (sink 2))
(defn- recursive ([] (recursive 1)) ([n] (sink n)))
(defn- looping-a [] (looping-b))
(defn- looping-b [] (looping-a) (sink 3))
")

(deftest callers-of-test
  (let [tables (-> {"f.clj" (cg/extract "f.clj" 't (root unreached-src))}
                   ;; what clj-kondo reports for the bare `step!` handed to `reduce`: a reference, no arity
                   (cg/add-value-reference-sites [{:filename "f.clj" :row 4 :col 26 :to 't :name 'step!}]))
        reach  (cg/reachable-regions {:tables tables :resolve {}})
        at     (fn [row] (cg/callers-of reach {:filename "f.clj" :row row :col 3}))]
    (testing "when no entry point reaches a position, the chain from the outermost caller -- one nothing calls --
              down to the function holding it; a function handed to `reduce` is called for this purpose"
      (is (= ["t/run!" "t/step!"] (mapv :name (:path (at 3)))))
      (is (= 1 (:count (at 3))) "one uncalled root")
      (is (every? #(and (:filename %) (pos-int? (:row %))) (:path (at 3)))))
    (testing "a function nothing calls is its own outermost caller"
      (is (= ["t/lonely"] (mapv :name (:path (at 5))))))
    (testing "a function that calls itself -- one arity delegating to another -- is still a root: the self-call is
              not what calls it"
      (is (= ["t/recursive"] (mapv :name (:path (at 7)))))
      (is (not (:cyclic? (at 7)))))
    (testing "when every caller loops back, the farthest one is named and the chain says so"
      (is (= ["t/looping-a" "t/looping-b"] (mapv :name (:path (at 9)))))
      (is (:cyclic? (at 9))))
    (testing "the deepest root wins, and how many there are is counted"
      (is (= ["t/run!" "t/step!" "t/sink"] (mapv :name (:path (at 2)))))
      (is (= 4 (:count (at 2))) "run!, lonely, also-lonely, recursive -- not the two that loop"))
    (testing "nothing outside every function"
      (is (nil? (at 99))))))

(deftest ring-handler-is-a-flow-entry-test
  (testing "a function taking a request starts an http path, named by its symbol"
    (let [tables {"f.clj" (cg/extract "f.clj" 't (root src))}
          reach  (cg/reachable-regions {:tables tables :resolve {}})
          flows  (cg/flows-to reach {:filename "f.clj" :row 4 :col 3})]
      (is (= ["t/handle" "t/helper"] (mapv :name (get-in flows [:http :path])))))))

(def ^:private routes-src
  "(ns metabase.api-routes.routes
  (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :as routes.common :refer [+static-apikey]]
            metabase.pulse.api metabase.sync.api))
(defn- +auth [handler] (routes.common/+auth (if (simple-symbol? handler) (api.macros/ns-handler handler) handler)))
(def ^:private route-map
  {\"/card\"   (+auth 'metabase.cards.api)
   \"/alert\"  (+auth metabase.pulse.api/alert-routes)
   \"/pulse\"  metabase.pulse.api/pulse-routes
   \"/notify\" (+static-apikey metabase.sync.api/notify-routes)
   \"/public\" (routes.common/+public-exceptions 'metabase.public.api)
   \"/setup\"  'metabase.setup.api})")

(def ^:private pulse-src
  "(ns metabase.pulse.api (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :as routes.common]))
(def alert-routes (api.macros/ns-handler 'metabase.pulse.api.alert))
(def pulse-routes
  (handlers/routes
   (handlers/route-map-handler {\"/unsubscribe\" (api.macros/ns-handler 'metabase.pulse.api.unsubscribe)})
   (routes.common/+auth metabase.pulse.api.pulse/routes)))")

(def ^:private pulse-pulse-src
  "(ns metabase.pulse.api.pulse (:require [metabase.api.macros :as api.macros]))
(def routes (api.macros/ns-handler *ns*))")

(def ^:private sync-src
  "(ns metabase.sync.api (:require [metabase.api.macros :as api.macros]))
(def notify-routes (api.macros/ns-handler 'metabase.sync.api.notify))")

(def ^:private self-src
  "(ns metabase.slack.api (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :refer [+auth]]))
(def routes (api.macros/ns-handler *ns* +auth))")

(deftest handler-wrappers-test
  (let [tables (into {} (for [[f ns s] [["routes.clj" 'metabase.api-routes.routes routes-src]
                                        ["pulse.clj" 'metabase.pulse.api pulse-src]
                                        ["pulse_pulse.clj" 'metabase.pulse.api.pulse pulse-pulse-src]
                                        ["sync.clj" 'metabase.sync.api sync-src]
                                        ["self.clj" 'metabase.slack.api self-src]]]
                          [f (cg/extract f ns (root s))]))
        wrapped (cg/handler-wrappers tables)]
    (testing "a quoted namespace handed straight to a wrapper"
      (is (= #{"+auth"} (get wrapped 'metabase.cards.api))))
    (testing "a var whose definition names the namespace, one hop away"
      (is (= #{"+auth"} (get wrapped 'metabase.pulse.api.alert)))
      (is (= #{"+static-apikey"} (get wrapped 'metabase.sync.api.notify))))
    (testing "a var that composes handlers: the wrapper inside its definition applies to what it wraps there, and
              the unwrapped mount carries no wrapper to the rest"
      (is (= #{"+auth"} (get wrapped 'metabase.pulse.api.pulse)) "wrapped inside pulse-routes, resolved through *ns*")
      (is (= #{} (get wrapped 'metabase.pulse.api.unsubscribe #{})) "mounted bare inside pulse-routes"))
    (testing "middleware passed to ns-handler wraps that namespace"
      (is (= #{"+auth"} (get wrapped 'metabase.slack.api))))
    (testing "a wrapper that is not authentication is still recorded by name; a bare mount records nothing"
      (is (= #{"+public-exceptions"} (get wrapped 'metabase.public.api)))
      (is (= #{} (get wrapped 'metabase.setup.api #{}))))))

(deftest threaded-handler-wrappers-test
  (let [src "(ns metabase.x.routes (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :refer [+auth]]))
(def routes (->> (api.macros/ns-handler 'metabase.x.api) +auth (+require-premium-feature :x)))"
        wrapped (cg/handler-wrappers {"r.clj" (cg/extract "r.clj" 'metabase.x.routes (root src))})]
    (is (= #{"+auth" "+require-premium-feature"} (get wrapped 'metabase.x.api))
        "each step of a threading form wraps the seed, whether a bare symbol or a call")))

(deftest fn-literal-call-site-is-keyed-where-kondo-keys-it-test
  (testing "the call a `#(f % x)` literal makes is keyed one column past the `#`, where clj-kondo resolves `f`;
            keyed at the `#` it resolves to clojure.core/fn* and the edge is lost"
    (let [src "(ns t (:require [metabase.api.macros :as api.macros] [other.ns :as o]))
(defn- steps [] [(o/step #(o/run! % 1))])
(api.macros/defendpoint :get \"/a\" \"doc\" [_r _q _b] (steps))
"
          tables  {"f.clj" (cg/extract "f.clj" 't (root src))}
          ;; what clj-kondo reports on line 2: the `#` as fn*, the head one column later
          resolve {{:filename "f.clj" :row 2 :col 26} 'clojure.core/fn*
                   {:filename "f.clj" :row 2 :col 27} 'other.ns/run!}
          reach   (cg/reachable-regions {:tables tables :resolve resolve})]
      (is (some #(= {:row 2 :col 27 :filename "f.clj"} (:pos %))
                (filter #(= 'o/run! (:head %)) (:call-sites (get tables "f.clj"))))
          "the site sits on the open paren, not the `#`")
      (is (contains? (get (:edges reach) 't/steps) 'other.ns/run!)
          "steps calls other.ns/run!, not clojure.core/fn*")
      (is (contains? (cg/entry-closure reach (first (cg/entries reach))) 'other.ns/run!)
          "the endpoint reaches it"))))

(deftest taint-crosses-a-fn-literal-test
  (testing "a request value handed to a callee inside a `#(...)` literal reaches the callee's parameter: the
            call is resolved where clj-kondo keys it, one column past the `#`"
    (let [src     "(ns t (:require [other.ns :as o]))
(defn- helper [idp redirect]
  (str idp redirect))
(defn handle [request]
  (let [target (get-in request [:params :redirect])]
    (o/step #(helper % target))))
"
          ;;                        1         2         3
          ;;               123456789012345678901234567890
          ;; line 6:       `    (o/step #(helper % target))))` -- `#` at col 13, `(` at col 14
          locals  [{:id 1 :name 'idp      :filename "f.clj" :row 2 :col 16}
                   {:id 2 :name 'redirect :filename "f.clj" :row 2 :col 20}
                   {:id 3 :name 'request  :filename "f.clj" :row 4 :col 15}
                   {:id 4 :name 'target   :filename "f.clj" :row 5 :col 9}]
          usages  [{:id 3 :filename "f.clj" :row 5 :col 24}
                   {:id 4 :filename "f.clj" :row 6 :col 24}
                   {:id 1 :filename "f.clj" :row 3 :col 8}
                   {:id 2 :filename "f.clj" :row 3 :col 12}]
          tables  {"f.clj" (cg/extract "f.clj" 't (root src))}
          resolve {{:filename "f.clj" :row 6 :col 13} 'clojure.core/fn*
                   {:filename "f.clj" :row 6 :col 14} 't/helper}
          tainted (cg/propagate {:tables tables :resolve resolve :locals locals :local-usages usages :sources #{3}})]
      (is (contains? (get tainted 2) :request) "helper's `redirect` parameter")
      (is (not (contains? (get tainted 1) :request))
          "helper's `idp` parameter receives `%`: a value of unknown shape, not the request's"))))
