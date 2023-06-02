/* istanbul ignore file */

export const createHeading = (textContent: string) => {
  const h1 = document.createElement("h1");
  h1.textContent = textContent;
  return h1;
};

export const createParagraph = (textContent: string) => {
  const p = document.createElement("p");
  p.textContent = textContent;
  return p;
};

export const createImage = () => {
  const img = document.createElement("img");
  img.src = "https://example.com/img.jpg";
  return img;
};
