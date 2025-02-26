console.log("--- [Metabase Embed] embed.js active ---");

const error = message => {
  console.error(`[Metabase Embed] ${message}`);
};

class MetabaseEmbed {
  constructor(options) {
    this.url = options.url;
    this.target = options.target;
    this.iframeClassName = options.iframeClassName;
    this.apiKey = options.apiKey;

    this.setup();
  }

  setup() {
    this.iframe = document.createElement("iframe");
    this.iframe.src = this.url;
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";

    if (!this.apiKey) {
      error("Please provide an API key to authenticate with Metabase");
      return;
    }

    if (this.iframeClassName) {
      this.iframe.classList.add(this.iframeClassName);
    }

    this.iframe.addEventListener(
      "message",
      event => {
        console.log("[Embed] embed.js received message", event.data);

        if (!event.data) {
          return;
        }

        if (event.data.type === "metabase.embed.waitingForAuth") {
          const payload = {
            type: "metabase.embed.authenticate",
            payload: { apiKey: this.apiKey },
          };

          this.iframe.contentWindow.postMessage(payload, "*");
        }
      },
      false,
    );

    let parentContainer = null;

    if (typeof this.target === "string") {
      parentContainer = document.querySelector(this.target);
    } else if (this.target instanceof HTMLElement) {
      parentContainer = this.target;
    }

    if (!parentContainer) {
      console.error(
        `Cannot find parent container "${this.parentSelector}" to embed Metabase`,
      );

      return;
    }

    parentContainer.appendChild(this.iframe);
  }

  destroy() {
    if (this.iframe) {
      this.iframe.remove();
    }
  }
}

window["metabase.embed"] = {
  MetabaseEmbed,
};
