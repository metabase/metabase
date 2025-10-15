(ns metabase.images.api
  (:require
   [buddy.core.codecs :as buddy-codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.images.models.image :as models.image]
   [metabase.channel.render.core :as channel.render]
   [metabase.images.schema :as images.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor :as qp]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/:id"
  "Metadata about an image."
  [{image-id :id, :as _route-params} :- [:map
                                         [:id ::images.schema/id]]]
  (-> (api/check-404 (t2/select-one :model/Image image-id))
      (assoc :url (models.image/image-id->contents-url image-id))))

(api.macros/defendpoint :get "/:id/contents"
  "This is our endpoint for serving the contents of an image that we have stored locally somewhere."
  [{image-id :id, :as _route-params} :- [:map
                                         [:id ::images.schema/id]]]
  (let [{:keys [^String url], content-type :content_type} (api/check-404
                                                           (t2/select-one [:model/Image :url :content_type] image-id))]
    {:status  200
     :body    (io/input-stream (io/as-url url))
     :headers {"Content-Type" content-type}}))

(def imgdir (io/file "/tmp/hack2025"))

(defn name-image [image-content suffix]
  (let [filehash (buddy-hash/sha256 image-content)]
    (format "image-%s-%s" (buddy-codecs/bytes->hex filehash) suffix)))

;; curl -X POST http://localhost:3000/api/images -H "x-metabase-session: $(cat session.txt)" -F "file=@$(pwd)/duck.jpeg"
(api.macros/defendpoint :post "/"
  "Upload an image."
  {:multipart true}
  [_route-params
   {:keys [user-id collection-id]} :- [:and
                                       [:map
                                        [:user-id       {:optional true} [:maybe ::lib.schema.id/user]]
                                        [:collection-id {:optional true} [:maybe ::lib.schema.id/collection]]]
                                       [:fn
                                        {:error/message "Either :user-id or :collection-id is required."}
                                        (some-fn :user-id :collection-id)]
                                       ;; todo not sure why this fails
                                       #_[:fn
                                          {:error/message "You cannot specify both :user-id and :collection-id"}
                                          (not (every-pred :user-id :collection-id))]]
   _body
   {{:strs [file]} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["file" (mu/with ms/File {:description "image data"})]]]]]
  (let [{user-filename :filename :keys [tempfile size]} file]
    (try
      (let [filename  (name-image tempfile user-filename)
            localfile (io/file imgdir filename)]
        (log/infof "Got a cool file with %d bytes with name %s" size filename)
        (io/make-parents localfile)
        (io/copy tempfile localfile)
        (let [url   (str (io/as-url localfile))
              image (t2/insert-returning-instance! :model/Image {:url url, :title user-filename, :content_type (:content-type file)})]
          (when user-id
            (t2/update! :model/User user-id {:profile_image_id (:id image)}))
          (when collection-id
            (t2/insert!
             :model/CollectionImage
             {:image_id            (:id image)
              :collection_id       collection-id
              :collection_position nil}))
          (assoc image :url (models.image/image-id->contents-url (:id image)))))
      (finally
        (io/delete-file tempfile true)))))

;; GET /api/collection/:id/items needs to return collection_image

;; GET /api/user + GET /api/user/:id needs to return profile pic URL

;;; TODO -- not sure bout this =(
(api.macros/defendpoint :post "/add-to-collection"
  "Add an image to a collection (create a new :model/CollectionImage"
  []
  {})

(api.macros/defendpoint :post "/card/:card-id/snapshot"
  "Snapshot a Card. This will create a new CollectionImage."
  [{:keys [card-id]} :- [:map
                         [:card-id ::lib.schema.id/card]]]
  (let [{:keys [dataset_query result_metadata], card-type :type, :as card} (api/check-404 (t2/select-one :model/Card :id card-id))
        query-results (qp/process-query
                       (cond-> dataset_query
                         (= card-type :model)
                         (assoc-in [:info :metadata/model-metadata] result_metadata)))
        png-bytes     (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                               card
                                                               query-results
                                                               1000)
        filename      (name-image png-bytes (format "card_%d.png" card-id))
        localfile     (io/file imgdir filename)
        url           (str (io/as-url localfile))]
    (io/make-parents localfile)
    (io/copy png-bytes localfile)
    (let [image-id            (t2/insert-returning-pk! :model/Image {:url          url
                                                                     :title        (format "%s (%d)" (:name card) card-id)
                                                                     :content_type "image/png"})
          collection-image-id (t2/insert-returning-pk! :model/CollectionImage {:image_id      image-id
                                                                               :collection_id (:collection_id card)})
          card-snapshot       (t2/insert-returning-instance! :model/CardSnapshot {:card_id             card-id
                                                                                  :collection_image_id collection-image-id})]
      {:status 200
       :body   {:card_snapshot card-snapshot}})))

(api.macros/defendpoint :get "/card/:card-id/snapshots"
  "List all snapshots of a Card."
  [{:keys [card-id]} :- [:map
                         [:card-id ::lib.schema.id/card]]]
  {:status 200
   :body   (t2/select :model/CardSnapshot :card_id card-id)})
