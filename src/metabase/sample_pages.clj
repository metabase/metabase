(ns metabase.sample-pages
  "Some sample pages for playing around with auth.
   These were templated with Hiccup simply for speed of development <3"
  (require [clojure.pprint :refer (pprint)]
           [hiccup.page :refer (html5)]))

(defmacro very-basic-page
  "Bare minimum HTML shim for the sample pages."
  [& body]
  `(html5
    [:body
     [:div {:align "center"}
      ~@body]]))

(defn protected
  "A sample route fn that user should need to authenticate to access."
  [{:keys [session]
    :as request}]
  (let [{:keys [current authentications]} (->> session
                                               :cemerick.friend/identity)
        {:keys [username roles]} (authentications current)]
    (pprint roles)
    (very-basic-page
     [:h1 "Hi, " username "!"]
     "YOU HAVE SUCCESSFULLY LOGGED IN WITH PERMISSIONS:"
     [:br] [:br]
     (->> roles           ; print human-friendly strings for the roles
          (mapv name)
          (interpose ", ")
          (apply str))
     (when (contains? roles :admin)
       [:div [:br] [:br]
        [:a {:href "/admin"} "Visit the admin page"]])
     [:div [:br] [:br]
      [:a {:href "/logout"} "Log back out"]])))

(defn admin
  "A sample admin page."
  [request]
  (very-basic-page
   [:h1 "You've accessed the admin page!"]
   [:a {:href "/logout"} "Logout"]))

(defn json-response
  "A sample JSON response."
  [request]
  {:status 200
   :body {:message "We can serialize JSON <3"}})

(defn sample-404
  "Sample 404 page!"
  [request]
  (very-basic-page
   [:h1 "THIS IS NOT THE PAGE YOU ARE LOOKING FOR"]
   "Maybe go look for a toucan instead!"
   [:br]
   [:a {:href "/"} "back to the home page"]))
