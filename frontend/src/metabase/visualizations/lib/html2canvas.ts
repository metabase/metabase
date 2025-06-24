export function getHtml2CanvasWrapper(rootElement: HTMLElement) {
  const wrapper = document.createElement("div");

  wrapper.style.visibility = "hidden";
  wrapper.style.position = "fixed";

  wrapper.appendChild(rootElement.cloneNode(true));

  // We must append it to document.body even when SDK is rendered as inside a shadow root
  document.body.appendChild(wrapper);

  const cleanupWrapper = () => {
    wrapper.remove();
  };

  return { wrapper, cleanupWrapper };
}
