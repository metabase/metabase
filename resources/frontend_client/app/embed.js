console.log("--- embed.js active ---");

class MetabaseEmbed {
  constructor(options) {
    this.url = options.url;
    this.target = options.target;
    this.iframeClassName = options.iframeClassName;

    this.setup();
  }

  setup() {
    this.iframe = document.createElement("iframe");
    this.iframe.src = this.url;
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";

    if (this.iframeClassName) {
      this.iframe.classList.add(this.iframeClassName);
    }

    this.iframe.onload = () => {
      this.iframe.contentWindow.postMessage(
        JSON.stringify({
          type: "metabase.embed.loaded",
        }),
        "*",
      );
    };

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
