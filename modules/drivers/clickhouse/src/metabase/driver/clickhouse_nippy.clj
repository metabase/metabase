(ns metabase.driver.clickhouse-nippy
  (:require
   [taoensso.nippy :as nippy])
  (:import
   [java.io DataInput DataOutput]))

(set! *warn-on-reflection* false)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; com.clickhouse.data.value.UnsignedByte
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(nippy/extend-freeze com.clickhouse.data.value.UnsignedByte :clickhouse/UnsignedByte
  [^com.clickhouse.data.value.UnsignedByte x ^DataOutput data-output]
                     ;; can't enable *warn-on-reflection* because of this call
  (nippy/freeze-to-out! data-output (.toString x)))

(nippy/extend-thaw :clickhouse/UnsignedByte
  [^DataInput data-input]
  (com.clickhouse.data.value.UnsignedByte/valueOf ^String (nippy/thaw-from-in! data-input))) ;; TODO: confirm ^String is the correct type hint here and below

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; com.clickhouse.data.value.UnsignedShort
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(nippy/extend-freeze com.clickhouse.data.value.UnsignedShort :clickhouse/UnsignedShort
  [^com.clickhouse.data.value.UnsignedShort x ^DataOutput data-output]
  (nippy/freeze-to-out! data-output (.toString x)))

(nippy/extend-thaw :clickhouse/UnsignedShort
  [^DataInput data-input]
  (com.clickhouse.data.value.UnsignedShort/valueOf ^String (nippy/thaw-from-in! data-input)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; com.clickhouse.data.value.UnsignedInteger
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(nippy/extend-freeze com.clickhouse.data.value.UnsignedInteger :clickhouse/UnsignedInteger
  [^com.clickhouse.data.value.UnsignedInteger x ^DataOutput data-output]
  (nippy/freeze-to-out! data-output (.toString x)))

(nippy/extend-thaw :clickhouse/UnsignedInteger
  [^DataInput data-input]
  (com.clickhouse.data.value.UnsignedInteger/valueOf ^String (nippy/thaw-from-in! data-input)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; com.clickhouse.data.value.UnsignedLong
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(nippy/extend-freeze com.clickhouse.data.value.UnsignedLong :clickhouse/UnsignedLong
  [^com.clickhouse.data.value.UnsignedLong x ^DataOutput data-output]
  (nippy/freeze-to-out! data-output (.toString x)))

(nippy/extend-thaw :clickhouse/UnsignedLong
  [^DataInput data-input]
  (com.clickhouse.data.value.UnsignedLong/valueOf ^String (nippy/thaw-from-in! data-input)))
