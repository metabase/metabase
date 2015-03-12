(ns metabase.api.common-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.api.org-test :refer [create-org]]
            [metabase.test-data :refer :all]
            [metabase.test-data.create :refer [create-user]]
            metabase.test-utils
            [metabase.test.util :refer :all]
            [metabase.util :refer [regex= regex?]])
  (:import com.metabase.corvus.api.ApiException))

;;; TESTS FOR CURRENT-USER-PERMS-FOR-ORG
;; admins should get :admin
(expect :admin
    (with-current-user (user->id :rasta)
      (current-user-perms-for-org @org-id)))

;; superusers should always get :admin whether they have org perms or not
(expect-let [{org-id :id} (create-org (random-name))]
  :admin
  (with-current-user (user->id :crowberto)
      (current-user-perms-for-org org-id)))

(expect :admin
    (with-current-user (user->id :crowberto)
      (current-user-perms-for-org @org-id)))

;; other users should get :default or nil depending on if they have an Org Perm
(expect :default
    (with-current-user (user->id :lucky)
      (current-user-perms-for-org @org-id)))

(expect nil
    (with-current-user (:id (create-user))
      (current-user-perms-for-org @org-id)))

;; Should get a 404 for an Org that doesn't exist
(expect ApiException
  (with-current-user (user->id :crowberto)
    (current-user-perms-for-org 1000)))


;;; TESTS FOR CHECK (ETC)

(def four-oh-four
  "The expected format of a 404 response."
  {:status 404
   :body "Not found."})

(defn my-mock-api-fn [_]
  (catch-api-exceptions
   (check-404 @*current-user*)
   {:status 200
    :body @*current-user*}))

; check that `check-404` doesn't throw an exception if TEST is true
(expect {:status 200
         :body "Cam Saul"}
  (binding [*current-user* (atom "Cam Saul")]
    (my-mock-api-fn nil)))

; check that 404 is returned otherwise
(expect four-oh-four
  (my-mock-api-fn nil))

;;let-404 should return nil if test fails
(expect four-oh-four
  (catch-api-exceptions
    (let-404 [user nil]
      {:user user})))

;; otherwise let-404 should bind as expected
(expect {:user {:name "Cam"}}
  (catch-api-exceptions
    (let-404 [user {:name "Cam"}]
      {:user user})))

;; test the 404 thread versions

(expect four-oh-four
  (catch-api-exceptions
    (->404 nil
           (- 100))))

(expect -99
  (catch-api-exceptions
    (->404 1
           (- 100))))

(expect four-oh-four
  (catch-api-exceptions
    (->>404 nil
            (- 100))))

(expect 99
  (catch-api-exceptions
    (->>404 1
            (- 100))))


;;; TESTS FOR REQUIRE-PARAMS

(expect :ok
  (catch-api-exceptions
    (let [org 1]
      (require-params org)
      :ok)))

(expect {:status 400 :body "'org' is a required param."}
  (catch-api-exceptions
    (let [org nil]
      (require-params org)
      :ok)))

(expect :ok
  (catch-api-exceptions
    (let [org 100
          fish 2]
      (require-params org fish)
      :ok)))

(expect {:status 400 :body "'fish' is a required param."}
  (catch-api-exceptions
    (let [org 100
          fish nil]
      (require-params org fish))))


(defmacro expect-expansion
  "Helper to test that a macro expands the way we expect;
   Automatically calls `macroexpand-1` on MACRO."
  [expected-expansion macro]
  `(let [actual-expansion# (macroexpand-1 '~macro)]
     (expect '~expected-expansion
       actual-expansion#)))


;;; TESTS FOR AUTO-PARSE
;; TODO - these need to be moved to `metabase.api.common.internal-test`. But first `expect-expansion` needs to be put somewhere central

;; when auto-parse gets an args form where arg is present in *autoparse-types*
;; the appropriate let binding should be generated
(expect-expansion (clojure.core/let [id (clojure.core/when id (Integer/parseInt id))] 'body)
                  (auto-parse [id] 'body))

;; params not in *autoparse-types* should be ignored
(expect-expansion (clojure.core/let [id (clojure.core/when id (Integer/parseInt id))] 'body)
                  (auto-parse [id some-other-param] 'body))

;; make sure multiple autoparse params work correctly
(expect-expansion (clojure.core/let [id (clojure.core/when id (Integer/parseInt id))
                                     org_id (clojure.core/when org_id (Integer/parseInt org_id))] 'body)
                  (auto-parse [id org_id] 'body))

;; make sure it still works if no autoparse params are passed
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [some-other-param] 'body))

;; should work with no params at all
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [] 'body))

;; should work with some wacky binding form
(expect-expansion (clojure.core/let [id (clojure.core/when id (Integer/parseInt id))] 'body)
                  (auto-parse [id :as {body :body}] 'body))

;;; TESTS FOR DEFENDPOINT

;; replace regex `#"[0-9]+"` with str `"#[0-9]+" so expectations doesn't barf
(binding [*auto-parse-types* (update-in *auto-parse-types* [:int :route-param-regex] (partial str "#"))]
  (expect-expansion
   (do
     (def GET_:id
       (GET ["/:id" :id "#[0-9]+"] [id]
         (metabase.api.common.internal/auto-parse [id]
           (metabase.api.common.internal/catch-api-exceptions
             (clojure.core/-> (do (->404 (sel :one Card :id id)))
                              metabase.api.common.internal/wrap-response-if-needed)))))
     (clojure.core/alter-meta! #'GET_:id clojure.core/assoc :is-endpoint? true))
   (defendpoint GET "/:id" [id]
     (->404 (sel :one Card :id id)))))
