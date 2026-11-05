import type { Download } from "metabase/redux/store";

export const createMockDownload = (props: Partial<Download> = {}): Download => {
  return {
    id: Date.now(),
    title: "file.csv",
    status: "in-progress",
    ...props,
  };
};
