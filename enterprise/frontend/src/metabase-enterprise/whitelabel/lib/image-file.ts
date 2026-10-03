import { t } from "ttag";

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/svg+xml";

export type ImageFileReadResult =
  | { status: "success"; dataUri: string }
  | { status: "error"; message: string };

export async function readImageFile(file: File): Promise<ImageFileReadResult> {
  if (file.size > IMAGE_SIZE_LIMIT) {
    return {
      status: "error",
      message: t`The image you chose is larger than 2MB. Please choose another one.`,
    };
  }

  const dataUri = await readAsDataUri(file);
  if (dataUri == null || !(await isImageIntact(dataUri))) {
    return {
      status: "error",
      message: t`The image you chose is corrupted. Please choose another one.`,
    };
  }

  return { status: "success", dataUri };
}

function readAsDataUri(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function isImageIntact(dataUri: string) {
  return new Promise<boolean>((resolve) => {
    const image = document.createElement("img");
    image.onerror = () => resolve(false);
    image.onload = () => resolve(true);
    image.src = dataUri;
  });
}
