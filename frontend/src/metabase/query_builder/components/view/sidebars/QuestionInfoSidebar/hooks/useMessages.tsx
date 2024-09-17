import { useCallback, useEffect, useMemo, useState } from "react";
import { type Message, isMessage } from "../types";

export const useMessages = () => {
  const savedMessages = useMemo(() => {
    const messagesJson = localStorage.getItem("messages");
    if (!messagesJson) {
      return [];
    }
    try {
      const messages = JSON.parse(messagesJson);
      if (!Array.isArray(messages)) {
        throw "Saved messages are not an array";
      }
      if (!messages.every(m => isMessage(m))) {
        throw "Saved messages do not all conform to the Message type";
      }
      return messages as Message[];
    } catch (e) {
      console.error(e, messagesJson);
      return [];
    }
  }, []);

  const [messages, setMessages] = useState<Message[]>(savedMessages);

  useEffect(() => {
    localStorage.setItem("messages", JSON.stringify(messages));
  }, [messages]);

  const addMessage = useCallback(
    (message: Message) => {
      setMessages(messages => [...messages, message]);
    },
    [setMessages],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("messages");
  }, []);

  return { messages, setMessages, clearMessages, addMessage };
};
