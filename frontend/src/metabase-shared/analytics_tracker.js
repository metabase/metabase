// copied from https://github.com/umami-software/umami/blob/master/src/tracker/index.js

((window) => {
  const {
    screen: { width, height },
    navigator: { language, doNotTrack: ndnt, msDoNotTrack: msdnt },
    location,
    document,
    history,
    top,
    doNotTrack,
  } = window;
  const { currentScript, referrer } = document;
  if (!currentScript) {
    return;
  }

  const { hostname, href, origin } = location;
  const localStorage = href.startsWith("data:")
    ? undefined
    : window.localStorage;

  const _data = "data-";
  const _false = "false";
  const _true = "true";
  const attr = currentScript.getAttribute.bind(currentScript);

  const website = attr(`${_data}website-id`);
  const hostUrl = attr(`${_data}host-url`);
  const beforeSend = attr(`${_data}before-send`);
  const tag = attr(`${_data}tag`) || undefined;
  const autoTrack = attr(`${_data}auto-track`) !== _false;
  const dnt = attr(`${_data}do-not-track`) === _true;
  const excludeSearch = attr(`${_data}exclude-search`) === _true;
  const excludeHash = attr(`${_data}exclude-hash`) === _true;
  const domain = attr(`${_data}domains`) || "";
  const credentials = attr(`${_data}fetch-credentials`) || "omit";

  const domains = domain.split(",").map((n) => n.trim());
  const host = hostUrl || currentScript.src.split("/").slice(0, -1).join("/");
  const endpoint = `${host.replace(/\/$/, "")}/send`;
  const screen = `${width}x${height}`;
  const eventRegex = /data-umami-event-([\w-_]+)/;
  const eventNameAttribute = `${_data}umami-event`;
  const delayDuration = 300;

  /* Helper functions */

  const normalize = (raw) => {
    if (!raw) {
      return raw;
    }
    try {
      const u = new URL(raw, location.href);
      if (excludeSearch) {
        u.search = "";
      }
      if (excludeHash) {
        u.hash = "";
      }
      return u.toString();
    } catch {
      return raw;
    }
  };

  const getPayload = () => ({
    website,
    screen,
    language,
    title: document.title,
    hostname,
    url: currentUrl,
    referrer: currentRef,
    tag,
    id: identity ? identity : undefined,
  });

  const hasDoNotTrack = () => {
    const dnt = doNotTrack || ndnt || msdnt;
    return dnt === 1 || dnt === "1" || dnt === "yes";
  };

  /* Event handlers */

  const handlePush = (_state, _title, url) => {
    if (!url) {
      return;
    }

    currentRef = currentUrl;
    currentUrl = normalize(new URL(url, location.href).toString());

    if (currentUrl !== currentRef) {
      setTimeout(track, delayDuration);
    }
  };

  const handlePathChanges = () => {
    const hook = (_this, method, callback) => {
      const orig = _this[method];
      return (...args) => {
        callback.apply(null, args);
        return orig.apply(_this, args);
      };
    };

    history.pushState = hook(history, "pushState", handlePush);
    history.replaceState = hook(history, "replaceState", handlePush);
  };

  const handleClicks = () => {
    const trackElement = async (el) => {
      const eventName = el.getAttribute(eventNameAttribute);
      if (eventName) {
        const eventData = {};

        el.getAttributeNames().forEach((name) => {
          const match = name.match(eventRegex);
          if (match) {
            eventData[match[1]] = el.getAttribute(name);
          }
        });

        return track(eventName, eventData);
      }
    };
    const onClick = async (e) => {
      const el = e.target;
      const parentElement = el.closest("a,button");
      if (!parentElement) {
        return trackElement(el);
      }

      const { href, target } = parentElement;
      if (!parentElement.getAttribute(eventNameAttribute)) {
        return;
      }

      if (parentElement.tagName === "BUTTON") {
        return trackElement(parentElement);
      }
      if (parentElement.tagName === "A" && href) {
        const external =
          target === "_blank" ||
          e.ctrlKey ||
          e.shiftKey ||
          e.metaKey ||
          (e.button && e.button === 1);
        if (!external) {
          e.preventDefault();
        }
        return trackElement(parentElement).then(() => {
          if (!external) {
            (target === "_top" ? top.location : location).href = href;
          }
        });
      }
    };
    document.addEventListener("click", onClick, true);
  };

  /* Tracking functions */

  const trackingDisabled = () =>
    disabled ||
    !website ||
    localStorage?.getItem("umami.disabled") ||
    (domain && !domains.includes(hostname)) ||
    (dnt && hasDoNotTrack());

  const send = async (payload, type = "event") => {
    if (trackingDisabled()) {
      return;
    }

    const callback = window[beforeSend];

    if (typeof callback === "function") {
      payload = await Promise.resolve(callback(type, payload));
    }

    if (!payload) {
      return;
    }

    try {
      const res = await fetch(endpoint, {
        keepalive: true,
        method: "POST",
        body: JSON.stringify({ type, payload }),
        headers: {
          "Content-Type": "application/json",
          ...(typeof cache !== "undefined" && { "x-umami-cache": cache }),
        },
        credentials,
      });

      const data = await res.json();
      if (data) {
        disabled = !!data.disabled;
        cache = data.cache;
      }
    } catch (_e) {
      /* no-op */
    }
  };

  const init = () => {
    if (!initialized) {
      initialized = true;
      track();
      handlePathChanges();
      handleClicks();
    }
  };

  const track = (name, data) => {
    if (typeof name === "string") {
      return send({ ...getPayload(), name, data });
    }
    if (typeof name === "object") {
      return send({ ...name });
    }
    if (typeof name === "function") {
      return send(name(getPayload()));
    }
    return send(getPayload());
  };

  const identify = (id, data) => {
    if (typeof id === "string") {
      identity = id;
    }

    cache = "";
    return send(
      {
        ...getPayload(),
        data: typeof id === "object" ? id : data,
      },
      "identify",
    );
  };

  /* Start */

  if (!window.umami) {
    window.umami = {
      track,
      identify,
    };
  }

  let currentUrl = normalize(href);
  let currentRef = normalize(referrer.startsWith(origin) ? "" : referrer);

  let initialized = false;
  let disabled = false;
  let cache;
  let identity;

  if (autoTrack && !trackingDisabled()) {
    if (document.readyState === "complete") {
      init();
    } else {
      document.addEventListener("readystatechange", init, true);
    }
  }
})(window);
