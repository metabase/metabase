(ns metabase-enterprise.oauth-server.consent-page
  "Server-side rendered consent page for the OAuth authorization flow."
  (:require
   [clojure.string :as str]
   [hiccup2.core :as h]
   [metabase.appearance.settings :as appearance.settings]
   [metabase.system.core :as system]))

(defn- absolute-url
  "Resolve a potentially relative path to an absolute URL using site-url."
  [path]
  (if (or (str/starts-with? path "http://")
          (str/starts-with? path "https://"))
    path
    (str (str/replace (system/site-url) #"/$" "")
         "/"
         (str/replace path #"^/" ""))))

(defn- css-escape-font-name
  "Escape single quotes in a font name for safe CSS interpolation."
  [font-name]
  (str/replace font-name "'" "\\'"))

(defn- font-face-css
  "Generate @font-face CSS rules for the given font, loading woff2 files from Metabase's
   bundled font directory. Returns an empty string for custom (non-bundled) fonts since
   they are loaded via application-font-files."
  [font-name]
  (let [dir-name      (str/replace font-name " " "_")
        file-stem     (str/replace font-name " " "")
        css-font-name (css-escape-font-name font-name)]
    (if (= font-name "Lato")
      (str "@font-face { font-family: 'Lato'; font-weight: 400; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/Lato/lato-v16-latin-regular.woff2') format('woff2'); }\n"
           "@font-face { font-family: 'Lato'; font-weight: 700; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/Lato/lato-v16-latin-700.woff2') format('woff2'); }\n")
      (str "@font-face { font-family: '" css-font-name "'; font-weight: 400; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/" dir-name "/" file-stem "-Regular.woff2') format('woff2'); }\n"
           "@font-face { font-family: '" css-font-name "'; font-weight: 700; font-style: normal; font-display: swap;"
           " src: url('/app/fonts/" dir-name "/" file-stem "-Bold.woff2') format('woff2'); }\n"))))

(defn- appearance-settings
  "Return a map of appearance settings for the consent page."
  []
  (let [colors (appearance.settings/application-colors)]
    {:font-family  (appearance.settings/application-font)
     :logo-url     (absolute-url (appearance.settings/application-logo-url))
     :brand-color  (get colors "brand" "#509ee3")}))

(defn render-consent-page
  "Render a server-side HTML consent page for the OAuth authorization flow."
  [{:keys [client-name scopes oauth-params nonce csrf-token]}]
  (let [{:keys [font-family logo-url brand-color]} (appearance-settings)
        css-font-family (css-escape-font-name font-family)]
    (str
     "<!DOCTYPE html>"
     (h/html
      [:html {:lang "en"}
       [:head
        [:meta {:charset "UTF-8"}]
        [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
        [:title "Authorize " client-name]
        [:style {:nonce nonce} (h/raw
                                (str
                                 (font-face-css font-family)
                                 "* { box-sizing: border-box; margin: 0; padding: 0; }
                   html { height: 100%; }
                   body { font-family: '" css-font-family "', 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                          display: flex; justify-content: center; align-items: center;
                          min-height: 100%; background: #f9fbfc; color: #4c5773; }
                   .consent { background: #fff; border-radius: 8px;
                              box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05);
                              padding: 2.5rem; max-width: 440px; width: 100%; margin: 1rem; }
                   .logo { display: flex; justify-content: center; margin-bottom: 1.5rem; }
                   h1 { font-size: 1.25rem; font-weight: 700; color: #2e353b; text-align: center; margin-bottom: 0.5rem; }
                   .subtitle { text-align: center; font-size: 0.875rem; line-height: 1.5; color: #696e7b; margin-bottom: 1.5rem; }
                   .scope-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
                                   color: #949aab; margin-bottom: 0.5rem; }
                   .scopes { list-style: none; background: #f9fbfc; border-radius: 6px; border: 1px solid #eeecec;
                              padding: 0; margin-bottom: 1.5rem; }
                   .scopes li { padding: 0.625rem 0.875rem; font-size: 0.875rem; color: #4c5773;
                                 border-bottom: 1px solid #eeecec; }
                   .scopes li:last-child { border-bottom: none; }
                   .actions { display: flex; gap: 0.75rem; }
                   button { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 700;
                            font-family: inherit; cursor: pointer;
                            transition: background-color 0.15s ease, border-color 0.15s ease, filter 0.15s ease; }
                   .allow { background: " brand-color "; color: #fff; border: 1px solid " brand-color "; }
                   .allow:hover { filter: brightness(0.9); }
                   .deny  { background: #fff; color: #4c5773; border: 1px solid #ddd; }
                   .deny:hover  { background: #f9fbfc; border-color: #ccc; }"))]]
       [:body
        [:div.consent
         [:div.logo [:img {:src logo-url :alt "Logo" :height "32"}]]
         [:h1 "Authorize " client-name]
         [:p.subtitle "This application is requesting permission to access your Metabase account."]
         (when (seq scopes)
           [:div
            [:p.scope-label "Permissions requested"]
            [:ul.scopes
             (for [scope scopes]
               [:li scope])]])
         [:form {:method "POST" :action "/oauth/authorize/decision"}
          [:input {:type "hidden" :name "csrf_token" :value csrf-token}]
          (for [[k v] oauth-params
                :when (some? v)
                v (if (sequential? v) v [v])]
            [:input {:type "hidden" :name (name k) :value v}])
          [:div.actions
           [:button.deny {:type "submit" :name "approved" :value "false"} "Deny"]
           [:button.allow {:type "submit" :name "approved" :value "true"} "Allow"]]]]]]))))
