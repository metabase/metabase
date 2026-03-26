(ns metabase.oauth-server.consent-page
  "Server-side rendered consent page for the OAuth authorization flow."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [hiccup2.core :as h]
   [metabase.appearance.core :as appearance]
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

(def ^:private default-logo-url "app/assets/img/logo.svg")

(def ^:private default-logo-svg
  (delay (some-> (io/resource "frontend_client/app/assets/img/logo.svg") slurp)))

(def ^:private default-brand-color "#509ee3")

(defn- sanitize-css-color
  "Return `color` if it looks like a safe CSS color value (hex or named color),
   otherwise return the default brand color. Prevents CSS injection via `h/raw` interpolation."
  [color]
  (if (and (string? color)
           (or (re-matches #"[a-zA-Z]+" color)
               ;; 3-8 hex chars is permissive (valid lengths are 3,4,6,8) but no injection risk
               (re-matches #"#[0-9a-fA-F]{3,8}" color)))
    color
    default-brand-color))

(defn- branded-logo-svg
  "Return the default Metabase logo SVG with `currentColor` replaced by the brand color."
  [brand-color]
  (some-> @default-logo-svg (str/replace "currentColor" brand-color)))

(defn- appearance-settings
  "Return a map of appearance settings for the consent page."
  []
  (let [colors   (appearance/application-colors)
        logo-url (appearance/application-logo-url)]
    {:font-family    (appearance/application-font)
     :logo-url       (absolute-url logo-url)
     :default-logo?  (= logo-url default-logo-url)
     :brand-color    (sanitize-css-color (get colors "brand"))}))

(defn render-consent-page
  "Render a server-side HTML consent page for the OAuth authorization flow."
  [{:keys [client-name client-id oauth-params nonce csrf-token params-sig]}]
  (let [{:keys [font-family logo-url default-logo? brand-color]} (appearance-settings)
        css-font-family (css-escape-font-name font-family)]
    (str
     "<!DOCTYPE html>"
     (h/html
      [:html {:lang "en"}
       [:head
        [:meta {:charset "UTF-8"}]
        [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
        [:title "Authorize " (or client-name "Unknown Application")]
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
                   h1 { font-size: 1.25rem; font-weight: 700; color: #2e353b; text-align: center; margin-bottom: 0.25rem; }
                   .client-id { text-align: center; font-size: 0.75rem; color: #949aab; margin-bottom: 1rem;
                                font-family: monospace; word-break: break-all; }
                   .subtitle { text-align: center; font-size: 0.875rem; line-height: 1.5; color: #696e7b; margin-bottom: 1.5rem; }
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
         [:div.logo
          (if-let [svg (when default-logo? (branded-logo-svg brand-color))]
            (h/raw svg)
            [:img {:src logo-url :alt "Logo" :height "32"}])]
         [:h1 "Authorize " (or client-name "Unknown Application") "?"]
         (when client-id [:p.client-id client-id])
         [:p.subtitle "This MCP client is requesting to be authorized. If you approve, it will be able to access resources from "
          [:strong (appearance/application-name)] " on your behalf."]
         [:form {:method "POST" :action "/oauth/authorize/decision"}
          [:input {:type "hidden" :name "csrf_token" :value csrf-token}]
          [:input {:type "hidden" :name "params_sig" :value params-sig}]
          (for [[k v] oauth-params
                :when (some? v)
                v (if (sequential? v) v [v])]
            [:input {:type "hidden" :name (name k) :value v}])
          [:div.actions
           [:button.deny {:type "submit" :name "approved" :value "false"} "Cancel"]
           [:button.allow {:type "submit" :name "approved" :value "true"} "Authorize"]]]]]]))))
