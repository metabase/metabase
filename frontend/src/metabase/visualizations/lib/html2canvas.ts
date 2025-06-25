export function getHtml2CanvasWrapper(rootElement: HTMLElement) {
  const wrapper = document.createElement("div");

  wrapper.style.opacity = "0";
  wrapper.style.position = "fixed";
  wrapper.style.width = "100vw";
  wrapper.style.height = "100vh";

  wrapper.appendChild(rootElement.cloneNode(true));

  // We must append it to document.body even when SDK is rendered as inside a shadow root
  // eslint-disable-next-line no-direct-document-references
  document.body.appendChild(wrapper);

  const cleanupWrapper = () => {
    wrapper.remove();
  };

  return { wrapper, cleanupWrapper };
}
