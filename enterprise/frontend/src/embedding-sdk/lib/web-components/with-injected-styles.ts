import type { WebComponentElementConstructor } from "embedding-sdk/types/web-components";

export function withInjectedStyles(
  Constructor: WebComponentElementConstructor,
): WebComponentElementConstructor {
  return class extends Constructor {
    private stylesInjected = false;

    connectedCallback() {
      super.connectedCallback?.();

      if (this.stylesInjected) {
        return;
      }

      this.stylesInjected = true;

      const sheets: CSSStyleSheet[] = [];

      document
        .querySelectorAll<HTMLStyleElement>(
          `
              style[data-mb-styles="true"]
            `,
        )
        .forEach((element) => {
          const css = element.textContent || "";
          const sheet = new CSSStyleSheet();

          sheet.replaceSync(css);
          sheets.push(sheet);
        });

      if (this.container) {
        this.container.adoptedStyleSheets = [
          ...this.container.adoptedStyleSheets,
          ...sheets,
        ];
      }
    }
  };
}
