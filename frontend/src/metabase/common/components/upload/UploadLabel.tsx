import type { PropsWithChildren } from "react";

import { DEFAULT_UPLOAD_INPUT_ID } from "./constants";

export const UploadLabel = ({
  id = DEFAULT_UPLOAD_INPUT_ID,
  children,
}: PropsWithChildren<{ id?: string }>) => {
  return <label htmlFor={id}>{children}</label>;
};
