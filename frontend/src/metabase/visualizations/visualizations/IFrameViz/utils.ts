import { isSafeUrl } from "metabase/lib/formatting/link";

const embedLinkTransformers: {
  test: (url: URL) => boolean;
  transform: (url: URL) => string;
}[] = [
  {
    test: url => ["loom.com", "www.loom.com"].includes(url.hostname),
    transform: url => {
      const newUrl = new URL(url);
      newUrl.pathname = newUrl.pathname.replace("/share/", "/embed/");
      return newUrl.toString();
    },
  },
  {
    test: url =>
      ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname),
    transform: url => {
      let videoId: string | null;
      let playlistId: string | null;

      if (url.hostname.includes("youtu.be")) {
        videoId = url.pathname.split("/").pop() ?? null;
        playlistId = url.searchParams.get("list");
      } else {
        videoId = url.searchParams.get("v");
        playlistId = url.searchParams.get("list");
      }

      if (videoId) {
        let embedUrl = `https://www.youtube.com/embed/${videoId}`;
        if (playlistId) {
          embedUrl += `?list=${playlistId}`;
        }
        return embedUrl;
      } else if (playlistId) {
        return `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
      } else {
        return url.toString();
      }
    },
  },
  {
    test: url =>
      ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname),
    transform: url => {
      const videoId = url.pathname.split("/").pop();
      return videoId
        ? `https://player.vimeo.com/video/${videoId}`
        : url.toString();
    },
  },
];

const replaceSharingLinkWithEmbedLink = (url: string) => {
  let urlObject: URL;

  try {
    urlObject = new URL(url);
  } catch {
    // Invalid URL, just ignore
    return null;
  }

  for (const transformer of embedLinkTransformers) {
    if (transformer.test(urlObject)) {
      return transformer.transform(urlObject);
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

const DEFAULT_PROTOCOL = "https://";

const normalizeUrl = (trimmedUrl: string) => {
  const hasProtocol = /^[a-zA-Z]+:\/\//.test(trimmedUrl);
  if (!hasProtocol) {
    trimmedUrl = trimmedUrl.replace(/^\/\//, "");
    trimmedUrl = DEFAULT_PROTOCOL + trimmedUrl;
  }

  return trimmedUrl;
};

const isIframeString = (iframeOrUrl: string) =>
  iframeOrUrl.startsWith("<iframe");

export const getIframeDomainName = (
  iframeOrUrl: string | undefined,
): string | null => {
  if (!iframeOrUrl) {
    return null;
  }
  const trimmedInput = iframeOrUrl.trim();

  try {
    const url = isIframeString(trimmedInput)
      ? parseUrlFromIframe(trimmedInput)
      : normalizeUrl(trimmedInput);

    if (!url) {
      return null;
    }

    const urlObject = new URL(url);
    return urlObject.hostname;
  } catch {
    return null;
  }
};

export const getIframeUrl = (
  iframeOrUrl: string | undefined,
): string | null => {
  if (!iframeOrUrl) {
    return null;
  }

  const trimmedInput = iframeOrUrl.trim();

  if (isIframeString(trimmedInput)) {
    return parseUrlFromIframe(trimmedInput);
  }

  const normalizedUrl = normalizeUrl(trimmedInput);
  if (isSafeUrl(normalizedUrl)) {
    return replaceSharingLinkWithEmbedLink(normalizedUrl);
  }

  return null;
};

const matchesAllowedFrame = (hostname: string, allowedFrame: string) => {
  const allowedUrl = new URL(allowedFrame);

  // `new URL` encodes "*.", so we need to decode it
  const allowedHostname = decodeURIComponent(allowedUrl.hostname);

  if (allowedHostname.startsWith("*.")) {
    const baseDomain = allowedHostname.slice(2);
    return hostname === baseDomain || hostname.endsWith("." + baseDomain);
  }

  return hostname === allowedHostname;
};

export const isAllowedIframeUrl = (url: string, allowedIframesSetting = "") => {
  if (allowedIframesSetting === "*") {
    return true;
  }
  try {
    const allowedIframes = allowedIframesSetting
      ?.split(",")
      .map(host => host.trim());

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    for (const frame of allowedIframes) {
      if (matchesAllowedFrame(hostname, frame)) {
        return true;
      }
    }
  } catch (e) {
    console.error(`Invalid URL: ${e}`);
  }

  return false;
};
