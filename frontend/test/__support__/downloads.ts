type CapturedDownload = {
  fileName: string | null;
  href: string;
  blob: Blob | undefined;
};

/**
 * Lets the real download helpers (e.g. `openSaveDialog`) run, and records what
 * they hand to the browser: the clicked anchor's file name and URL, and the
 * Blob behind that URL. jsdom implements neither object URLs nor downloads, so
 * only those two browser APIs are stubbed.
 *
 * Call `restore` in `afterEach`.
 */
export function setupDownloadCapture() {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const blobsByUrl = new Map<string, Blob>();
  const downloads: CapturedDownload[] = [];

  URL.createObjectURL = jest.fn((blob: Blob) => {
    const url = `blob:download-${blobsByUrl.size + 1}`;
    blobsByUrl.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = jest.fn();

  const clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      const href = this.getAttribute("href") ?? "";
      downloads.push({
        fileName: this.getAttribute("download"),
        href,
        blob: blobsByUrl.get(href),
      });
    });

  return {
    downloads,
    restore: () => {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    },
  };
}

export const readBlobText = (blob: Blob | undefined): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error("No Blob was downloaded"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
