(ns metabase.api.session)
(metabase.require/api)

(def session-login
  (POST "/login" [:as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def session-logout
  (GET "/logout" []
       ;; TODO - implementation
       {:status 200
        :body {}}))


(defroutes routes
           ;; TODO - this feels bleh.  is it better to put the actual route data here
           ;;        and just have the endpoints be plain functions?
           ;;        best way to automate building this list?
           session-login
           session-logout)
