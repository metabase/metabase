(ns metabase.mq.impl
  "Shared protocol for buffering messages before publishing to queues or topics.")

(defprotocol MessageBuffer
  "Protocol for buffering messages before publishing."
  (put [this msg]
    "Put a message on the buffer."))
