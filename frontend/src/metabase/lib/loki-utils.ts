export const openImageBlobOnStorybook = ({
  canvas,
  blob,
  scale,
}: {
  canvas: HTMLCanvasElement;
  blob: Blob;
  scale: number;
}) => {
  const imgElement = document.createElement("img");
  imgElement.src = URL.createObjectURL(blob);
  imgElement.width = canvas.width / scale;
  imgElement.height = canvas.height / scale;

  const root: HTMLElement = document.querySelector("#storybook-root")!;
  const imageDownloaded = document.createElement("div");
  imageDownloaded.setAttribute("data-testid", "image-downloaded");
  root.replaceChildren(imgElement);

  // the presence of this element is used to detect when the image is ready
  // in the storybook you'll need to `await canvas.findByTestId("image-downloaded");`
  // and then call `asyncCallback()` to continue the story
  root.appendChild(imageDownloaded);

  window.document.body.style.height = "initial";
};
