(ns metabase.channel.impl.slack-row-diff
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.urls :as urls]))

(def ^:private header-text-limit       150)
(def ^:private block-text-length-limit 3000)
(def ^:private slack-field-limit       10)

(defn- truncate [s limit]
  (if (> (count s) limit) (str (subs s 0 (dec limit)) "…") s))

(defn- escape-mkdwn [s]
  (-> (str s)
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")))

(defn- recipient->slack-channel [recipient]
  (when (= (:type recipient) :notification-recipient/raw-value)
    (or (get-in recipient [:details :channel_id])
        (get-in recipient [:details :value]))))

(defn- col-name [col] (or (:display_name col) (:name col) "?"))
(defn- cell-value [v] (if (nil? v) "_nil_" (escape-mkdwn (str v))))

(defn- interpolate-template
  "Replace {{column_name}} placeholders in template with actual row values."
  [template columns row]
  (reduce (fn [s [col val]]
            (str/replace s (str "{{" (:name col) "}}") (str val)))
          template
          (map vector columns row)))

(defn- row->fields [columns row]
  (mapv (fn [col val]
          {:type "mrkdwn"
           :text (truncate (format "*%s*\n%s" (col-name col) (cell-value val))
                           block-text-length-limit)})
        columns row))

(defn- header-block [card-name n-new]
  {:type "header"
   :text {:type "plain_text"
          :text (truncate (format "🆕 %s — %d new row%s"
                                  card-name n-new (if (= 1 n-new) "" "s"))
                          header-text-limit)
          :emoji true}})

(defn- context-block [card]
  {:type "context"
   :elements [{:type "mrkdwn"
               :text (format "<%s|View question in Metabase>" (urls/card-url (:id card)))}]})

(defn- divider [] {:type "divider"})

(defn- per-row-messages [card columns new-rows channel-ids message-template]
  (for [row new-rows ch-id channel-ids]
    (let [body-blocks (if message-template
                        [{:type "section"
                          :text {:type "mrkdwn"
                                 :text (truncate (interpolate-template message-template columns row)
                                                 block-text-length-limit)}}]
                        (let [field-chunks (partition-all slack-field-limit (row->fields columns row))]
                          (mapv (fn [fields] {:type "section" :fields (vec fields)}) field-chunks)))]
      {:channel ch-id
       :blocks  (into [(header-block (:name card) 1)]
                      (conj body-blocks (context-block card)))})))

(defn- digest-row-block [columns row index message-template]
  (if message-template
    {:type "section"
     :text {:type "mrkdwn"
            :text (truncate (interpolate-template message-template columns row)
                            block-text-length-limit)}}
    {:type "section"
     :text {:type "mrkdwn"
            :text (truncate
                   (str (format "*Row %d*\n" (inc index))
                        (str/join "  |  "
                                  (map (fn [col val] (format "*%s:* %s" (col-name col) (cell-value val)))
                                       columns row)))
                   block-text-length-limit)}}))

(defn- digest-message [card columns new-rows channel-id message-template]
  (let [n-new      (count new-rows)
        row-blocks (map-indexed (fn [i row] (digest-row-block columns row i message-template)) new-rows)
        all-blocks (vec (flatten [(header-block (:name card) n-new)
                                  (interpose (divider) row-blocks)
                                  (context-block card)]))]
    {:channel channel-id :blocks all-blocks}))

(defmethod channel/render-notification [:channel/slack :notification/card-row-diff]
  [_channel-type {:keys [payload]} {:keys [recipients]}]
  (let [{:keys [card columns new_rows send_mode message_template]} payload
        channel-ids (keep recipient->slack-channel recipients)]
    (case (keyword send_mode)
      :digest (mapv #(digest-message card columns new_rows % message_template) channel-ids)
      (doall (per-row-messages card columns new_rows channel-ids message_template)))))
