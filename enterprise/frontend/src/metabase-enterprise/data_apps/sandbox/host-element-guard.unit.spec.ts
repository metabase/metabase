import { hostRealmElementGuard } from "./host-element-guard";

// The guard patches the realm's shared prototypes/document, so install it once
// against jsdom's globals and exercise the two host-side materialization paths.
describe("HostRealmElementGuard", () => {
  beforeAll(() => {
    hostRealmElementGuard.install(window);
  });

  describe("createElement", () => {
    it.each(["iframe", "frame", "object", "embed"])(
      "blocks a realm-creating <%s>",
      (tag) => {
        expect(() => document.createElement(tag)).toThrow(
          /blocked host createElement/,
        );
      },
    );

    it.each(["div", "span", "canvas", "table", "input", "a", "form"])(
      "allows the inert <%s> the SDK may need",
      (tag) => {
        expect(() => document.createElement(tag)).not.toThrow();
      },
    );

    // Not a realm; script EXECUTION is gated by CSP `script-src`, and the SDK +
    // webpack/rspack create script elements host-side for bundle/chunk loading.
    it("allows <script>", () => {
      expect(() => document.createElement("script")).not.toThrow();
    });

    it("is case-insensitive", () => {
      expect(() => document.createElement("IFRAME")).toThrow(
        /blocked host createElement/,
      );
    });

    it("blocks a namespaced realm tag via createElementNS", () => {
      expect(() =>
        document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"),
      ).toThrow(/blocked host createElementNS/);
    });

    it("allows an SVG element via createElementNS", () => {
      expect(() =>
        document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      ).not.toThrow();
    });
  });

  describe("innerHTML", () => {
    it("strips an iframe smuggled through innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML = '<iframe src="x"></iframe><b>ok</b>';

      expect(host.querySelector("iframe")).toBeNull();
      expect(host.querySelector("b")?.textContent).toBe("ok");
    });

    // Any markup containing a tag is routed through DOMPurify rather than
    // pattern-matched, so a <script> is stripped along with anything else DOMPurify
    // removes. (Inert scripts don't execute via innerHTML anyway.)
    it("sanitizes any markup containing a tag", () => {
      const host = document.createElement("div");
      host.innerHTML = "<script>window.__x = 1;</script><span>hi</span>";

      expect(host.querySelector("script")).toBeNull();
      expect(host.querySelector("span")?.textContent).toBe("hi");
    });

    it("keeps ordinary markup intact", () => {
      const host = document.createElement("div");
      host.innerHTML = '<p class="c">text <em>emphasis</em></p>';

      expect(host.querySelector("p.c em")?.textContent).toBe("emphasis");
    });

    // Inline handlers execute in the host realm; without this the guard's realm-
    // tag fast-path would let `<img onerror>` through (CSP is the only other line
    // of defense, and it can be stripped/misconfigured).
    it("strips an inline event handler from innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML =
        '<img src="x" onerror="fetch(\'/api/user\')" /><b>ok</b>';

      expect(host.querySelector("img")?.hasAttribute("onerror")).toBe(false);
      expect(host.querySelector("b")?.textContent).toBe("ok");
    });

    // `/` is a valid attribute-name separator, so `<img/onerror>` reaches the
    // handler with no whitespace in front of `on` — the gate must catch it too.
    it("strips a slash-separated inline handler from innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML = "<img/onerror=\"fetch('/api/user')\" src=x><b>ok</b>";

      expect(host.querySelector("img")?.hasAttribute("onerror")).toBe(false);
      expect(host.querySelector("b")?.textContent).toBe("ok");
    });

    // A handler placed directly after a quoted attribute value has no separator
    // before `on`, but the browser still parses it as a live handler.
    it("strips a quote-adjacent inline handler from innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML = '<img src="x"onerror="fetch(\'/api/user\')"><b>ok</b>';

      expect(host.querySelector("img")?.hasAttribute("onerror")).toBe(false);
      expect(host.querySelector("b")?.textContent).toBe("ok");
    });

    it("strips a javascript: URL from innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML = '<a href="javascript:fetch(1)">x</a>';

      expect(host.innerHTML).not.toContain("javascript:");
      expect(host.querySelector("a")?.textContent).toBe("x");
    });

    // The `javascript:` scheme can be entity-encoded (`java&#115;cript:`) and still
    // decode to a live URL once parsed — a substring match would miss it.
    it("strips an entity-encoded javascript: URL from innerHTML", () => {
      const host = document.createElement("div");
      host.innerHTML = '<a href="java&#115;cript:fetch(1)">x</a>';

      expect(host.querySelector("a")?.hasAttribute("href")).toBe(false);
      expect(host.querySelector("a")?.textContent).toBe("x");
    });

    it("strips an iframe smuggled through insertAdjacentHTML", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      host.insertAdjacentHTML("beforeend", "<iframe></iframe><i>x</i>");

      expect(host.querySelector("iframe")).toBeNull();
      expect(host.querySelector("i")?.textContent).toBe("x");
      host.remove();
    });
  });
});
