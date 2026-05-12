export const openImageBlobOnStorybook = ({
  canvas,
  blob,
}: {
  canvas: HTMLCanvasElement;
  blob: Blob;
}) => {
  const imgElement = document.createElement("img");
  imgElement.src = URL.createObjectURL(blob);
  // scale to /2 to compensate `scale:2` in html2canvas
  imgElement.width = canvas.width / 2;
  imgElement.height = canvas.height / 2;

  const root: HTMLElement = document.querySelector("#storybook-root")!;
  const imageDownloaded = document.createElement("div");
  imageDownloaded.setAttribute("data-testid", "image-downloaded");
  root.replaceChildren(imgElement);

  // Wait for the image to fully load before signaling readiness,
  // otherwise Loki may capture the screenshot before the image renders.
  // In the storybook you'll need to `await canvas.findByTestId("image-downloaded");`
  // and then call `asyncCallback()` to continue the story.
  const onImageReady = () => {
    root.appendChild(imageDownloaded);
    window.document.body.style.height = "initial";
  };

  // The image may already be loaded if the blob URL resolved synchronously,
  // so check `complete` to avoid a missed `load` event.
  if (imgElement.complete) {
    onImageReady();
  } else {
    imgElement.addEventListener("load", onImageReady);
  }
};
