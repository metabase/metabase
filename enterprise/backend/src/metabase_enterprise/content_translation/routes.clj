(ns metabase-enterprise.content-translation.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.content-translation.models :as ct]
   [metabase.embedding.jwt :as embedding.jwt]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private http-status-content-too-large 413)

;; The maximum size of a content translation dictionary is 1.5MiB
;; This should equal the maxContentDictionarySizeInMiB variable in the frontend
(def ^:private max-content-translation-dictionary-size-mib 1.5)
(def ^:private max-content-translation-dictionary-size-bytes (* max-content-translation-dictionary-size-mib 1024 1024))

(def ^:private sample-translations [{:locale "de" :msgid "Sample translation" :msgstr "Musterübersetzung"}
                                    {:locale "pt_BR" :msgid "Sample translation" :msgstr "Tradução de exemplo"}
                                    {:locale "ja" :msgid "Sample translation" :msgstr "サンプル翻訳"}
                                    {:locale "ko" :msgid "Sample translation" :msgstr "샘플 번역"}])

(api.macros/defendpoint :get "/csv"
  "Provides content translation dictionary in CSV"
  []
  (api/check-superuser)
  (let [translations (ct/get-translations)
        translations (if (empty? translations)
                       sample-translations
                       translations)
        csv-data (cons ["Language" "String" "Translation"]
                       (map (fn [{:keys [locale msgid msgstr]}]
                              [locale msgid msgstr])
                            translations))]
    {:status 200
     :headers {"Content-Type" "text/csv; charset=utf-8"
               "Content-Disposition" "attachment; filename=\"metabase-content-translations.csv\""}
     :body (with-out-str
             (csv/write-csv *out* csv-data))}))

(api.macros/defendpoint :post
  "/upload-dictionary"
  "Upload a CSV of content translations"
  {:multipart true}
  [_route_params
   _query-params
   _body
   {:keys [multipart-params], :as _request} :- [:map
                                                [:multipart-params
                                                 [:map
                                                  ["file"
                                                   [:map
                                                    [:filename :string]
                                                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]

  (api/check-superuser)
  (let [file (get-in multipart-params ["file" :tempfile])]
    (when (> (get-in multipart-params ["file" :size]) max-content-translation-dictionary-size-bytes)
      (throw (ex-info (tru "The dictionary should be less than {0}MB." max-content-translation-dictionary-size-mib)
                      {:status-code http-status-content-too-large})))
    (when-not (instance? java.io.File file)
      (throw (ex-info (tru "No file provided") {:status-code 400})))
    (let [[_header & rows] (dictionary/read-csv file)]
      (dictionary/import-translations! rows))
    {:success true}))

(api.macros/defendpoint :get "/dictionary/:token"
  "Fetch the content translation dictionary via a JSON Web Token signed with the `embedding-secret-key`."
  [{:keys [token]} :- [:map
                       [:token string?]]
   {:keys [locale]}]
  ;; this will error if bad
  (embedding.jwt/unsign token)
  (if locale
    {:data (ct/get-translations (i18n/normalized-locale-string (str/trim locale)))}
    (throw (ex-info (str (tru "Locale is required.")) {:status-code 400}))))

(defn- +require-content-translation [handler]
  (ee.api.common/+require-premium-feature :content-translation (deferred-tru "Content translation") handler))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (->> (api.macros/ns-handler *ns*)
       +require-content-translation))
