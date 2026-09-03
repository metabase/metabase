(ns metabase.tiles.settings
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :as i18n :refer [tru]])
  (:import
   (java.net URL)))

(set! *warn-on-reflection* true)

(defn- concrete-tile-url
  "`template` with its `{...}` placeholders filled in, so it parses as — and is host-checked as — the URL that
  will actually be requested. `{s}` (the subdomain shard) becomes `a`, matching the static-map renderer."
  [template]
  (-> (str template)
      (str/replace "{s}" "a")
      (str/replace #"\{[^{}]*\}" "0")))

(defn- relative-template?
  "Whether `url` is a same-origin path like `/tiles/{z}/{x}/{y}.png` — resolved by the browser against the
  Metabase host, so it names no outside host to validate. `//host/...` is protocol-relative, not relative."
  [^String url]
  (and (str/starts-with? url "/")
       (not (str/starts-with? url "//"))))

(defsetting map-tile-server-allowed-networks
  "Controls which networks Metabase may connect to for map tile servers.
  Options:
  - allow-private (external + private networks but NOT loopback or link-local)
  - external-only (only globally routable public addresses)
  - allow-all (no restrictions).
  Defaults to external-only on Metabase Cloud and allow-private when self-hosted."
  :type       :keyword
  :visibility :internal
  :export?    false
  :getter     (fn []
                (or (setting/get-value-of-type :keyword :map-tile-server-allowed-networks)
                    (if (premium-features/is-hosted?)
                      :external-only
                      :allow-private)))
  :setter     (fn [new-value]
                (when (some? new-value)
                  (assert (#{:external-only :allow-private :allow-all} (keyword new-value))
                          (tru "Invalid map-tile-server-allowed-networks! Only values of external-only, allow-private, and allow-all are allowed.")))
                (setting/set-value-of-type! :keyword :map-tile-server-allowed-networks new-value)))

(defn- valid-map-tile-server-url?
  "Whether `template` is safe to store. It must be http(s) and its host must be allowed
  by [[map-tile-server-allowed-networks]]. A host that cannot be resolved at all is rejected rather than
  trusted. Self-hosted that policy defaults to `:allow-private`, not `:external-only`, because the browser
  is what fetches these tiles: an on-prem instance with no internet egress can only show maps via a tile
  server on its own network. The server-side fetch in [[metabase.channel.render.maps]] applies the same
  policy, so a tile server that is legal to configure is one subscription renders can actually reach."
  [template]
  (let [url (concrete-tile-url template)]
    (or (relative-template? url)
        (try
          (let [^URL parsed (io/as-url url)
                policy      (map-tile-server-allowed-networks)
                host        (.getHost parsed)]
            (and (contains? #{"http" "https"} (.getProtocol parsed))
                 (or (= policy :allow-all)
                     ;; [[u.http/host-allowed-for-network-policy?]] deliberately allows a host it cannot
                     ;; resolve, so a DNS outage on a real warehouse surfaces as a connection error rather
                     ;; than an accusation. Here the value is only being stored, so we can afford to be
                     ;; stricter -- and need to be: an obfuscated literal like `0xa9fea9fe`
                     ;; (169.254.169.254) presents as an unresolvable host on a modern JDK.
                     (and (seq (u.http/host->inet-addresses host))
                          (u.http/host-allowed-for-network-policy? policy host)))))
          (catch Throwable _ false)))))

(defsetting map-tile-server-url
  (i18n/deferred-tru "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.")
  :encryption :when-encryption-key-set
  :default    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  :visibility :public
  :audit      :getter
  :setter     (fn [new-value]
                (when-not (or (str/blank? new-value)
                              (valid-map-tile-server-url? new-value))
                  (throw (ex-info (tru "Invalid map tile server URL: must be a relative path, or an http:// or https:// URL whose host is resolvable and permitted by map-tile-server-allowed-networks.")
                                  {:status-code 400})))
                (setting/set-value-of-type! :string :map-tile-server-url new-value)))
