import { isSafeUrl } from "metabase/lib/formatting/link";

const embedLinkTransformers: {
  test: (url: string) => boolean;
  transform: (url: string) => string;
}[] = [
  {
    test: url => url.includes("loom.com/share"),
    transform: url => url.replace("/share/", "/embed/"),
  },
  {
    test: url => url.includes("youtube.com/watch") || url.includes("youtu.be/"),
    transform: url => {
      const videoId = url.includes("youtu.be/")
        ? url.split("/").pop()
        : new URL(url).searchParams.get("v");
      return `https://www.youtube.com/embed/${videoId}`;
    },
  },
  {
    test: url => url.includes("vimeo.com"),
    transform: url => {
      const videoId = url.split("/").pop();
      return `https://player.vimeo.com/video/${videoId}`;
    },
  },
];

const replaceSharingLinkWithEmbedLink = (url: string) => {
  for (const transformer of embedLinkTransformers) {
    if (transformer.test(url)) {
      return transformer.transform(url);
    }
  }

  return url;
};

const parseUrlFromIframe = (iframeHtml: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(iframeHtml, "text/html");
  const iframeEl = doc.querySelector("iframe");

  if (iframeEl) {
    return iframeEl.getAttribute("src");
  }

  return "";
};

export const getIframeUrl = (
  iframeOrUrl: string | undefined,
): string | null => {
  if (!iframeOrUrl) {
    return null;
  }

  const trimmedInput = iframeOrUrl.trim();

  if (trimmedInput.startsWith("<iframe")) {
    return parseUrlFromIframe(trimmedInput);
  }

  const isRelativeUrl =
    !trimmedInput.startsWith("http://") &&
    !trimmedInput.startsWith("https://") &&
    !trimmedInput.startsWith("//");

  if (!isRelativeUrl && isSafeUrl(trimmedInput)) {
    return replaceSharingLinkWithEmbedLink(trimmedInput);
  }

  return null;
};
