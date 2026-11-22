/** Listen for embed messages from the specified iframe and return listener cleanup. */
export function listenForIframeMessages<Message>({
  iframe,
  expectedOrigin,
  handler,
}: {
  iframe: HTMLIFrameElement;
  expectedOrigin?: string;
  handler: (message: Message) => void;
}) {
  const messageHandler = (event: MessageEvent<Message>) => {
    const iframeWindow = iframe.contentWindow;

    if (!iframeWindow || event.source !== iframeWindow) {
      return;
    }

    if (expectedOrigin && event.origin !== expectedOrigin) {
      return;
    }

    if (event.data) {
      handler(event.data);
    }
  };

  window.addEventListener("message", messageHandler);

  return () => window.removeEventListener("message", messageHandler);
}
