(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-route-coverage-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.embedding-rest.api :as embedding-rest.api]
   [metabase.embedding-rest.api.embed]
   [metabase.test.http-client :as client]
   [metabase.util :as u]))

(def ^:private guest-embedding-api-ns
  'metabase.embedding-rest.api.embed)

(def ^:private guest-embedding-api-prefix
  "/api/embed")

(defn- route-table
  []
  (into #{}
        (map (fn [[method path _param-regexes]] [method path]))
        (keys (api.macros/ns-routes guest-embedding-api-ns))))

(defn- body-text
  [body]
  (if (string? body) body (pr-str body)))

(defn- mentions-router-data?
  "True when `body` carries the router database's single row."
  [body]
  (str/includes? (body-text body) "router-data"))

(defn- mentions-destination-data?
  "True when `body` carries a destination database's row"
  [body]
  (str/includes? (body-text body) "destination-data"))

(def ^:private query-executing-routes
  "Every `/api/embed` route that runs a query against the warehouse, with the request that drives it against the
  fixture [[routing.tu/do-with-embed-routing-setup!]] stands up."
  {[:get "/card/:token/query"]
   {:args (fn [urls] [(:card-query urls)])}

   [:get "/card/:token/query/:export-format"]
   {:args (fn [urls] [(:card-csv urls)])}

   [:get "/pivot/card/:token/query"]
   {:args (fn [urls] [(:card-pivot urls)])}

   [:get "/card/:token/params/:param-key/values"]
   {:args (fn [urls] [(:card-param-values urls)])}

   [:get "/card/:token/params/:param-key/search/:prefix"]
   {:args (fn [urls] [(:card-param-search urls)])}

   [:get "/card/:token/params/:param-key/remapping"]
   {:args (fn [urls] [(:card-param-remap urls)])}

   [:get "/tiles/card/:token/:zoom/:x/:y"]
   {:args    (fn [urls] [(:card-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)])
    ;; a map tile is a PNG, and the fixture's latitude and longitude columns exist on the router database only, so a
    ;; tile that rendered at all is a tile the router database answered.
    :served? routing.tu/png?}

   [:get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"]
   {:args (fn [urls] [(:dashcard-query urls)])}

   [:get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"]
   {:args (fn [urls] [(:dashcard-csv urls)])}

   [:get "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"]
   {:args (fn [urls] [(:dashcard-pivot urls)])}

   [:get "/dashboard/:token/params/:param-key/values"]
   {:args (fn [urls] [(:dash-param-values urls)])}

   [:get "/dashboard/:token/params/:param-key/search/:prefix"]
   {:args (fn [urls] [(:dash-param-search urls)])}

   [:get "/dashboard/:token/params/:param-key/remapping"]
   {:args (fn [urls] [(:dash-param-remap urls)])}

   [:get "/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"]
   {:args    (fn [urls] [(:dash-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)])
    :served? routing.tu/png?}})

(def ^:private exempt-routes
  "The `/api/embed` routes the anonymous-access grant has nothing to govern, each with the reason it is exempt and the
  request that demonstrates it: an exempt route still answers normally with the grant withheld, and its answer carries
  no warehouse row."
  {[:get "/card/:token"]
   {:reason (str "Serves the question's own description -- its name, display, visualization settings and parameter "
                 "whitelist -- out of the application database. The query it describes is run by "
                 "GET /card/:token/query, which is where the grant decides.")
    :args   (fn [urls] [(:card-metadata urls)])}

   [:get "/dashboard/:token"]
   {:reason (str "The same for a dashboard: its cards, parameters and layout, out of the application database. Each "
                 "card's query is run by GET /dashboard/:token/dashcard/:dashcard-id/card/:card-id, and each "
                 "parameter's value list by GET /dashboard/:token/params/:param-key/values.")
    :args   (fn [urls] [(:dash-metadata urls)])}})

(defn- unclassified+stale
  [routes]
  (let [classified (into (set (keys exempt-routes)) (keys query-executing-routes))]
    {:unclassified (set/difference routes classified)
     :stale        (set/difference classified routes)}))

(defn- served?
  "Whether `body` is what `route` looks like when the router database answered."
  [route body]
  ((get-in query-executing-routes [route :served?] mentions-router-data?) body))

(defn- request-args
  "The `client/client :get` arguments that drive `route` against `urls`."
  [route urls]
  ((or (get-in query-executing-routes [route :args])
       (get-in exempt-routes [route :args]))
   urls))

(defn- openapi-route
  "`route` as the mounted handler's OpenAPI spec names it: `[method path]` with the path prefixed and its params
  rewritten."
  [[method path]]
  [method (str guest-embedding-api-prefix (str/replace path #"/:([^/]+)" "/{$1}"))])

(defn- mounted-routes
  "Every route the mounted `/api/embed` handler actually serves, as `[method path]` in the same spelling as
  [[openapi-route]]."
  []
  (into #{}
        (mapcat (fn [[path method->item]]
                  (map (fn [method] [method path]) (keys method->item))))
        (:paths (open-api/open-api-spec embedding-rest.api/embedding-routes guest-embedding-api-prefix))))

(defn- describe
  [[method path]]
  (format "%s %s%s" (u/upper-case-en (name method)) guest-embedding-api-prefix path))

;;; ------------------------------------------------- Classification -------------------------------------------------

(deftest ^:parallel every-guest-embedding-route-is-classified-test
  (testing "every /api/embed route is either driven as query-executing or exempt with a stated reason"
    (is (= {:unclassified #{}, :stale #{}}
           (unclassified+stale (route-table)))
        (str "A route under :unclassified is a new /api/embed endpoint nobody has decided about yet. If it runs a "
             "warehouse query, add it to query-executing-routes with a request that drives it. If it cannot, add it "
             "to exempt-routes with the reason and a request that shows the grant does not change its answer."))))

(deftest ^:parallel every-exempt-route-states-its-reason-test
  (testing "an exemption is a claim somebody has to make in words, not a route quietly added to a list"
    (doseq [[route {:keys [reason]}] (sort-by key exempt-routes)]
      (testing (describe route)
        (is (not (str/blank? reason)) (pr-str reason))))))

(deftest ^:parallel route-table-has-no-colliding-entries-test
  (testing "no two /api/embed endpoints share a method and path, so reading the table as [method path] loses none"
    (is (= (count (api.macros/ns-routes guest-embedding-api-ns))
           (count (route-table))))))

(deftest ^:parallel the-enumerated-namespace-is-the-whole-mount-test
  (testing "/api/embed serves exactly the routes this namespace enumerates, so composing a second namespace into the
           mount cannot add an endpoint behind the classification's back"
    (is (= (into #{} (map openapi-route) (route-table))
           (mounted-routes)))))

(deftest ^:parallel an-unclassified-route-is-reported-test
  (testing "adding a query-executing /api/embed endpoint fails the classification test until someone classifies it"
    (let [added [:get "/card/:token/brand-new-way-to-run-a-query"]]
      (is (= {:unclassified #{added}, :stale #{}}
             (unclassified+stale (conj (route-table) added))))))
  (testing "and removing one is reported too, so a table entry cannot outlive its endpoint"
    (let [removed [:get "/card/:token/query"]]
      (is (= {:unclassified #{}, :stale #{removed}}
             (unclassified+stale (disj (route-table) removed)))))))

;;; ------------------------------------------------- Grant in place -------------------------------------------------

(deftest query-executing-routes-answer-from-the-router-database-test
  (testing "with the grant in place every driven route answers from the router database, which is both what a route
           that resolved no routing at all would fail and what makes the refusal below mean something"
    (routing.tu/do-with-embed-routing-setup!
     true
     (fn [urls]
       (doseq [route (sort (keys query-executing-routes))]
         (testing (describe route)
           (let [body (apply client/client :get (request-args route urls))]
             (is (served? route body) (pr-str body)))))))))

;;; ------------------------------------------------- Grant withheld -------------------------------------------------

(deftest nothing-is-served-without-the-grant-test
  (routing.tu/do-with-embed-routing-setup!
   false
   (fn [urls]
     (testing "with the grant withheld, no /api/embed route that runs a query serves anything"
       (doseq [route (sort (keys query-executing-routes))]
         (testing (describe route)
           (let [{body :response, :keys [refused]} (routing.tu/call-recording-grant-refusals
                                                    #(apply client/client :get (request-args route urls)))]
             (is (not (served? route body))
                 (str "answered from the router database anyway: " (pr-str body)))
             (is (not (mentions-destination-data? body))
                 (str "routed to a destination database instead of being refused: " (pr-str body)))
             (is (= #{(:db-id urls)} refused)
                 (str "failed for some reason other than the missing grant: " (pr-str body)))))))
     (testing "while the routes that run no query answer as they always did, which is what makes them exempt"
       (doseq [[route {:keys [reason]}] (sort-by key exempt-routes)]
         (testing (describe route)
           (let [body    (apply client/client :get 200 (request-args route urls))
                 details (str reason "\nbody: " (pr-str body))]
             (is (not (mentions-router-data? body)) details)
             (is (not (mentions-destination-data? body)) details))))))))
