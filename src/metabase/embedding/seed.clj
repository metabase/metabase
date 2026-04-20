(ns metabase.embedding.seed
  "Seed default Light and Dark embedding themes on first startup.

  Guarded by the `default-embedding-themes-seeded` setting: once it flips to true, seeding never runs again, so
  admin edits (renames, settings changes) and deletions are all preserved across restarts.

  Color values mirror Metabase's main-app light and dark themes
  (`frontend/src/metabase/ui/colors/constants/themes/{light,dark}.ts`), mapped to the SDK theme shape used by the
  theme editor. Whitelabel colors from the `application-colors` setting are layered on top at seed time."
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private default-chart-colors
  ["#509EE3" "#88BF4D" "#A989C5" "#EF8C8C" "#F9D45C" "#F2A86F" "#98D9D9" "#7172AD"])

(def ^:private light-theme-colors
  {:brand                "hsla(208, 72%, 60%, 1)"
   :background           "hsla(0, 0%, 100%, 1)"
   :text-primary         "hsla(204, 66%, 8%, 0.84)"
   :text-secondary       "hsla(204, 66%, 8%, 0.62)"
   :text-tertiary        "hsla(204, 66%, 8%, 0.44)"
   :border               "hsla(195, 6%, 87%, 1)"
   :background-secondary "hsla(240, 11%, 98%, 1)"
   :filter               "hsla(240, 65%, 69%, 1)"
   :summarize            "hsla(89, 48%, 40%, 1)"
   :positive             "hsla(89, 48%, 40%, 1)"
   :negative             "hsla(358, 71%, 62%, 1)"
   :shadow               "hsla(204, 66%, 8%, 0.17)"})

(def ^:private dark-theme-colors
  {:brand                "hsla(208, 72%, 60%, 1)"
   :background           "hsla(204, 66%, 8%, 1)"
   :text-primary         "hsla(0, 0%, 100%, 0.95)"
   :text-secondary       "hsla(0, 0%, 100%, 0.69)"
   :text-tertiary        "hsla(0, 0%, 100%, 0.46)"
   :border               "hsla(0, 0%, 100%, 0.21)"
   :background-secondary "hsla(205, 63%, 5%, 1)"
   :filter               "hsla(240, 69%, 74%, 1)"
   :summarize            "hsla(89, 47%, 45%, 1)"
   :positive             "hsla(89, 48%, 40%, 1)"
   :negative             "hsla(358, 71%, 62%, 1)"
   :shadow               "color-mix(in srgb, hsla(205, 63%, 5%, 1) 20%, transparent)"})

(def ^:private whitelabel-key->sdk-key
  "Whitelabel `application-colors` keys that override SDK theme colors when present."
  {:brand          :brand
   :filter         :filter
   :summarize      :summarize
   :text-primary   :text-primary
   :text-secondary :text-secondary
   :text-tertiary  :text-tertiary
   :border         :border
   :success        :positive
   :danger         :negative
   :shadow         :shadow})

(defn- apply-whitelabel-colors [base-colors whitelabel-colors]
  (reduce-kv
   (fn [acc wl-key sdk-key]
     (if-let [wl-val (get whitelabel-colors wl-key)]
       (assoc acc sdk-key wl-val)
       acc))
   base-colors
   whitelabel-key->sdk-key))

(defn- whitelabel-chart-colors [whitelabel-colors]
  (mapv (fn [idx]
          (or (get whitelabel-colors (keyword (str "accent" idx)))
              (nth default-chart-colors idx)))
        (range (count default-chart-colors))))

(defn- build-theme-settings [base-colors whitelabel-colors]
  {:colors (assoc (apply-whitelabel-colors base-colors whitelabel-colors)
                  :charts (whitelabel-chart-colors whitelabel-colors))})

(defn seed-default-embedding-themes!
  "Seed default `Light` and `Dark` embedding themes on first run.

  No-op on subsequent runs — guarded by the `default-embedding-themes-seeded` setting."
  []
  (when-not (embedding.settings/default-embedding-themes-seeded)
    (log/info "Seeding default embedding themes")
    (let [whitelabel-colors (or (appearance/application-colors) {})]
      (t2/insert! :model/EmbeddingTheme
                  [{:name     "Light"
                    :settings (build-theme-settings light-theme-colors whitelabel-colors)}
                   {:name     "Dark"
                    :settings (build-theme-settings dark-theme-colors whitelabel-colors)}]))
    (embedding.settings/default-embedding-themes-seeded! true)))
