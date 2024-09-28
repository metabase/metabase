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

const applyIframeStyles = (
  iframe: HTMLIFrameElement,
  width: number,
  height: number,
) => {
  if (!iframe.width) {
    iframe.width = width.toString();
  }
  if (!iframe.height) {
    iframe.height = height.toString();
  }
  iframe.setAttribute("frameborder", "0");
};

const createIframeElement = (src: string, width: number, height: number) => {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  applyIframeStyles(iframe, width, height);
  return iframe;
};

const parseAndAdjustIframe = (
  iframeHtml: string,
  width: number,
  height: number,
) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(iframeHtml, "text/html");
  const iframeEl = doc.querySelector("iframe");

  if (iframeEl) {
    applyIframeStyles(iframeEl, width, height);
    return iframeEl.outerHTML;
  }

  return "";
};

export const prepareIFrameOrUrl = (
  iframeOrUrl: string | undefined,
  width: number,
  height: number,
): string => {
  if (!iframeOrUrl) {
    return "";
  }

  const trimmedInput = iframeOrUrl.trim();

  if (trimmedInput.startsWith("<iframe")) {
    return parseAndAdjustIframe(trimmedInput, width, height);
  }

  const isRelativeUrl =
    !trimmedInput.startsWith("http://") &&
    !trimmedInput.startsWith("https://") &&
    !trimmedInput.startsWith("//");

  if (!isRelativeUrl && isSafeUrl(trimmedInput)) {
    const embedUrl = replaceSharingLinkWithEmbedLink(trimmedInput);
    const iframe = createIframeElement(embedUrl, width, height);
    return iframe.outerHTML;
  }

  return "";
};
