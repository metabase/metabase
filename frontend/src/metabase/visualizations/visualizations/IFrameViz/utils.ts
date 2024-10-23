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

const splitPortAndRest = (url: string): [string, string] | [string, null] => {
  const portPattern = /:(\d+|\*)$/;
  const match = url.match(portPattern);

  return [match ? url.slice(0, match.index) : url, match ? match[1] : ""];
};

export const isAllowedIframeUrl = (url: string, allowedIframesSetting = "") => {
  if (allowedIframesSetting === "*") {
    return true;
  }

  try {
    const rawAllowedDomains = allowedIframesSetting
      .replaceAll(",", "")
      .split("\n")
      .map(host => host.trim());

    const parsedUrl = new URL(normalizeUrl(url));
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port;

    return rawAllowedDomains.some(rawAllowedDomain => {
      try {
        const [rawAllowedDomainWithoutPort, allowedPort] =
          splitPortAndRest(rawAllowedDomain);

        const allowedDomain = new URL(
          normalizeUrl(rawAllowedDomainWithoutPort),
        );

        const arePortsMatching = allowedPort === "*" || port === allowedPort;

        if (!arePortsMatching) {
          return false;
        }

        if (allowedDomain.hostname.startsWith("*.")) {
          const baseDomain = allowedDomain.hostname.slice(2);
          return hostname.endsWith("." + baseDomain);
        }

        return hostname.endsWith(allowedDomain.hostname);
      } catch (e) {
        console.warn(
          `Error while checking against allowed iframe domain ${rawAllowedDomain}`,
        );
        return false;
      }
    });
  } catch {
    return false;
  }
};
