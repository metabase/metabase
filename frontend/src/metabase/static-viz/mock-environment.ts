import ResizeObserver from "resize-observer-polyfill";

class MockEventTarget {
  listeners: Record<string, unknown[]> = {};
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}

class MockElement extends MockEventTarget {
  tagName: string;
  children: unknown[] = [];
  style: Record<string, unknown> = {};
  attributes: Record<string, unknown> = {};

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: unknown): unknown {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: unknown): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): unknown {
    return this.attributes[name];
  }
}

const mockWindow = new MockEventTarget();

// Mirrors the old mock-environment.js, where `Object.assign(global.window, global)`
// surfaced every polyfilled global on `window`. Code paths that read `window.X`
// (e.g. metabase/utils/resize-observer reads `window.ResizeObserver`) get bundled
// into the static-viz bundle and would otherwise see `undefined` under GraalVM.
const defineGlobal = (name: PropertyKey, value: unknown): void => {
  const descriptor: PropertyDescriptor = {
    value,
    writable: true,
    configurable: true,
  };
  Object.defineProperty(globalThis, name, descriptor);
  Object.defineProperty(mockWindow, name, descriptor);
};

defineGlobal("ResizeObserver", ResizeObserver);
defineGlobal("EventTarget", MockEventTarget);
defineGlobal("Element", MockElement);
defineGlobal("window", mockWindow);

const createMockDocument = () => {
  const document = new MockEventTarget();
  const documentElement = new MockElement("html");
  const head = new MockElement("head");
  const body = new MockElement("body");
  let cookie = "";
  Object.assign(document, {
    createElement: (tagName: string) => new MockElement(tagName),
    createTextNode: (text: string) => ({ textContent: text }),
    getElementById: (): null => null,
    getElementsByTagName: (): unknown[] => [],
    querySelector: (): null => null,
    querySelectorAll: (): unknown[] => [],
    documentElement,
    head,
    body,
    readyState: "complete",
  });
  Object.defineProperty(document, "cookie", {
    get: () => cookie,
    set: (value: string) => {
      cookie = value;
    },
    configurable: true,
  });
  return document;
};

const mockDocument = createMockDocument();
defineGlobal("document", mockDocument);

const mockNavigator = {
  userAgent: "GraalJS",
  language: "en-US",
  languages: ["en-US", "en"],
  platform: "GraalJS",
  appName: "StaticViz",
  appVersion: "1.0",
  cookieEnabled: false,
  geolocation: {
    getCurrentPosition: () => {},
    watchPosition: () => {},
    clearWatch: () => {},
  },
  onLine: true,
  mediaDevices: {
    getUserMedia: () => {},
  },
};
defineGlobal("navigator", mockNavigator);

defineGlobal("location", {
  href: "",
  protocol: "",
  host: "",
  hostname: "",
  port: "",
  pathname: "",
  search: "",
  hash: "",
  origin: "",
  reload: () => {},
  replace: () => {},
  assign: () => {},
});

defineGlobal("history", {
  length: 0,
  state: null,
  back: () => {},
  forward: () => {},
  go: () => {},
  pushState: () => {},
  replaceState: () => {},
});

defineGlobal("screen", {
  width: 0,
  height: 0,
  availWidth: 0,
  availHeight: 0,
  colorDepth: 24,
  pixelDepth: 24,
});

defineGlobal("setTimeout", () => 0);
defineGlobal("clearTimeout", () => {});
defineGlobal("setInterval", () => 0);
defineGlobal("clearInterval", () => {});
defineGlobal("requestAnimationFrame", () => {});
defineGlobal("cancelAnimationFrame", () => {});

const createMockEvent = (type: string) => ({
  type,
  bubbles: false,
  cancelable: false,
  composed: false,
  target: null,
  currentTarget: null,
  eventPhase: 0,
  stopPropagation: () => {},
  stopImmediatePropagation: () => {},
  preventDefault: () => {},
  isTrusted: false,
  timeStamp: Date.now(),
});
defineGlobal("Event", createMockEvent);
defineGlobal("CustomEvent", createMockEvent);

const createMockStorage = () => {
  const data: Record<string, string> = {};
  return {
    setItem(key: string, value: unknown): void {
      data[key] = String(value);
    },
    getItem(key: string): string | null {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    removeItem(key: string): void {
      delete data[key];
    },
    clear(): void {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
    key(index: number): string | null {
      return Object.keys(data)[index] ?? null;
    },
    get length(): number {
      return Object.keys(data).length;
    },
  };
};
defineGlobal("localStorage", createMockStorage());
defineGlobal("sessionStorage", createMockStorage());

defineGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addListener: () => {},
  removeListener: () => {},
}));

class MockURL {
  href: string;
  origin = "";
  protocol = "";
  username = "";
  password = "";
  host = "";
  hostname = "";
  port = "";
  pathname = "";
  search = "";
  searchParams: Record<string, unknown> = {};
  hash = "";

  constructor(url: string) {
    this.href = url;
  }

  toString(): string {
    return this.href;
  }
}
defineGlobal("URL", MockURL);

class MockMutationObserver {
  observe(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
defineGlobal("MutationObserver", MockMutationObserver);

class MockIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
defineGlobal("IntersectionObserver", MockIntersectionObserver);

class MockFileReader {
  result: unknown = null;
  error: unknown = null;
  onloadstart: unknown = null;
  onprogress: unknown = null;
  onload: unknown = null;
  onabort: unknown = null;
  onerror: unknown = null;
  onloadend: unknown = null;
  readyState = 0;
  readAsArrayBuffer(): void {}
  readAsBinaryString(): void {}
  readAsDataURL(): void {}
  readAsText(): void {}
  abort(): void {}
}
defineGlobal("FileReader", MockFileReader);

class MockBlob {
  size = 0;
  type = "";
  slice(): MockBlob {
    return new MockBlob();
  }
}
defineGlobal("Blob", MockBlob);

defineGlobal("File", function MockFile() {
  return new MockBlob();
});

defineGlobal("crypto", {
  getRandomValues: () => {},
  subtle: {},
});

class MockWebAPICollection {
  append(): void {}
  delete(): void {}
  get(): null {
    return null;
  }
  has(): boolean {
    return false;
  }
  set(): void {}
  forEach(): void {}
}
defineGlobal("Headers", class MockHeaders extends MockWebAPICollection {});
defineGlobal(
  "FormData",
  class MockFormData extends MockWebAPICollection {
    getAll(): unknown[] {
      return [];
    }
  },
);

class MockTextEncoder {
  encode(): void {}
}
defineGlobal("TextEncoder", MockTextEncoder);
