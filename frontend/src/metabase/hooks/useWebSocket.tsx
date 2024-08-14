import { useState, useEffect } from "react";

const useWebSocket = (
  url: any,
  onMessage: any,
  onError: any,
  onClose: any,
  onOpen: any,
) => {
  const [ws, setWs] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<any>(false);

  const connectWebSocket = () => {
    const websocket = new WebSocket(url);
    setWs(websocket);

    websocket.onopen = () => {
      onOpen && onOpen();
      setIsConnected(true);
      console.log("WebSocket connection opened.");
    };

    websocket.onclose = () => {
      onClose && onClose();
      console.log("WebSocket connection closed.");
      setIsConnected(false);
    };

    websocket.onmessage = e => {
      onMessage && onMessage(e);
    };

    websocket.onerror = error => {
      onError && onError();
      console.error("WebSocket Error: ", error);
      setIsConnected(false);
    };

    return websocket;
  };

  useEffect(() => {
    const websocket = connectWebSocket();
    return () => websocket && websocket.close();
  }, [url]);

  return { ws, isConnected, connectWebSocket };
};

export default useWebSocket;
