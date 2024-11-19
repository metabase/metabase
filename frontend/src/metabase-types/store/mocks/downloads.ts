import type { Download } from "../downloads";

export const createMockDownload = (props: Partial<Download> = {}): Download => {
  return {
    id: Date.now(),
    title: "file.csv",
    status: "in-progress",
    ...props,
  };
};
