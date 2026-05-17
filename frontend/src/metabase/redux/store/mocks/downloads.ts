import type { Download, DownloadsState } from "../downloads";

export const createMockDownloadsState = (
  opts: Partial<DownloadsState> = {},
): DownloadsState => ({
  isDownloadingToImage: false,
  datasetRequests: [],
  ...opts,
});

export const createMockDownload = (props: Partial<Download> = {}): Download => {
  return {
    id: Date.now(),
    title: "file.csv",
    status: "in-progress",
    ...props,
  };
};
