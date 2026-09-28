// Every function here runs in the story page through page.evaluate or page.addInitScript,
// so each one must be self-contained: no references to imports or other module-level values.

export type ProfileEvent = {
  name: string;
  time: number;
  detail?: unknown;
};

export type ModuleTiming = {
  id: string;
  start: number;
  selfMs: number;
  totalMs: number;
};

export type PageProfile = {
  timeOrigin: number;
  events: ProfileEvent[];
  longTasks: { start: number; duration: number }[];
  modules: ModuleTiming[];
  moduleStartAndSelfMs: [number, number][];
  navigation: unknown;
  resources: {
    name: string;
    start: number;
    end: number;
    transferSize: number;
    initiatorType: string;
  }[];
};

type ProfileState = {
  events: ProfileEvent[];
  longTasks: { start: number; duration: number }[];
  modules: Map<string, Omit<ModuleTiming, "id">>;
};

type ProfiledWindow = Window & {
  __visualProfile?: ProfileState;
  webpackChunkmetabase?: unknown[];
  __STORYBOOK_ADDONS_CHANNEL__?: unknown;
  __STORYBOOK_PREVIEW__?: unknown;
};

type ModuleFactory = (this: unknown, ...args: unknown[]) => unknown;

type WebpackChunk = [unknown, Record<string, ModuleFactory>, unknown?];

type StoryStoreLike = {
  importFn?: (path: string) => Promise<unknown>;
  projectAnnotations?: { loaders?: unknown[] };
};

// Records timestamps for the points of a story's boot that the page can observe:
// webpack module evaluation, Storybook's channel events, its loaders, the story import,
// MSW's service worker, and font loads.
export function installProfiler() {
  const profiledWindow: ProfiledWindow = window;
  const state: ProfileState = {
    events: [],
    longTasks: [],
    modules: new Map(),
  };
  profiledWindow.__visualProfile = state;
  const record = (name: string, detail?: unknown) => {
    state.events.push({ name, time: performance.now(), detail });
  };

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.longTasks.push({
        start: entry.startTime,
        duration: entry.duration,
      });
    }
  }).observe({ type: "longtask", buffered: true });

  const moduleStack: { childMs: number }[] = [];
  const wrapFactories = (chunk: WebpackChunk) => {
    const factories = chunk[1];
    for (const id of Object.keys(factories)) {
      const factory = factories[id];
      factories[id] = function (this: unknown, ...args: unknown[]) {
        const frame = { childMs: 0 };
        moduleStack.push(frame);
        const start = performance.now();
        try {
          return factory.apply(this, args);
        } finally {
          const totalMs = performance.now() - start;
          moduleStack.pop();
          const parent = moduleStack[moduleStack.length - 1];
          if (parent) {
            parent.childMs += totalMs;
          }
          const timing = state.modules.get(id) ?? {
            start,
            selfMs: 0,
            totalMs: 0,
          };
          timing.selfMs += totalMs - frame.childMs;
          timing.totalMs += totalMs;
          state.modules.set(id, timing);
        }
      };
    }
  };

  // Webpack's runtime replaces the chunk array's push with its own loader,
  // which ends by calling the push it replaced, so that inner call goes to the native push.
  const wrappedChunks = new WeakSet<WebpackChunk>();
  const chunksInProgress = new WeakSet<WebpackChunk>();
  let chunkArray: unknown[] | undefined;
  Object.defineProperty(profiledWindow, "webpackChunkmetabase", {
    configurable: true,
    get: () => chunkArray,
    set: (array: unknown[]) => {
      if (array === chunkArray) {
        return;
      }
      chunkArray = array;
      const nativePush = Array.prototype.push.bind(array);
      let runtimePush: ((chunk: WebpackChunk) => unknown) | undefined;
      Object.defineProperty(array, "push", {
        configurable: true,
        get: () => (chunk: WebpackChunk) => {
          if (!wrappedChunks.has(chunk)) {
            wrappedChunks.add(chunk);
            record("webpack.chunk", chunk[0]);
            wrapFactories(chunk);
          }
          if (!runtimePush || chunksInProgress.has(chunk)) {
            return nativePush(chunk);
          }
          chunksInProgress.add(chunk);
          try {
            return runtimePush(chunk);
          } finally {
            chunksInProgress.delete(chunk);
          }
        },
        set: (push: (chunk: WebpackChunk) => unknown) => {
          runtimePush = push;
        },
      });
    },
  });

  const wrapStore = (store: StoryStoreLike) => {
    const importFn = store.importFn;
    if (importFn) {
      store.importFn = async (path: string) => {
        record("story.import.start", path);
        try {
          return await importFn(path);
        } finally {
          record("story.import.end", path);
        }
      };
    }
    const loaders = store.projectAnnotations?.loaders;
    loaders?.forEach((loader, index) => {
      if (typeof loader !== "function") {
        return;
      }
      const label = `${index}: ${loader.toString().slice(0, 80)}`;
      loaders[index] = async (...args: unknown[]) => {
        record("loader.start", label);
        try {
          return await loader(...args);
        } finally {
          record("loader.end", label);
        }
      };
    });
  };

  let preview: Record<string, unknown> | undefined;
  Object.defineProperty(profiledWindow, "__STORYBOOK_PREVIEW__", {
    configurable: true,
    get: () => preview,
    set: (value: Record<string, unknown>) => {
      record("storybook.preview");
      preview = value;
      let store: unknown = value.storyStoreValue;
      Object.defineProperty(value, "storyStoreValue", {
        configurable: true,
        get: () => store,
        set: (next: StoryStoreLike) => {
          record("storybook.store");
          wrapStore(next);
          store = next;
        },
      });
    },
  });

  let channel: { emit: (...args: unknown[]) => unknown } | undefined;
  Object.defineProperty(profiledWindow, "__STORYBOOK_ADDONS_CHANNEL__", {
    configurable: true,
    get: () => channel,
    set: (value: { emit: (...args: unknown[]) => unknown }) => {
      record("storybook.channel");
      const emit = value.emit.bind(value);
      value.emit = (event: unknown, ...args: unknown[]) => {
        const payload = args[0];
        const phase =
          typeof payload === "object" &&
          payload !== null &&
          "newPhase" in payload
            ? payload.newPhase
            : undefined;
        record(`channel.${String(event)}`, phase);
        return emit(event, ...args);
      };
      channel = value;
    },
  });

  const serviceWorker = navigator.serviceWorker;
  if (serviceWorker) {
    record("sw.initial", { controlled: serviceWorker.controller !== null });
    const register = serviceWorker.register.bind(serviceWorker);
    serviceWorker.register = async (...args) => {
      record("sw.register.start");
      const registration = await register(...args);
      record("sw.register.end", {
        active: registration.active?.state,
        installing: registration.installing?.state,
        waiting: registration.waiting?.state,
      });
      return registration;
    };
    serviceWorker.addEventListener("message", (event: MessageEvent) => {
      const data: unknown = event.data;
      record(
        "sw.message",
        typeof data === "object" && data !== null && "type" in data
          ? data.type
          : undefined,
      );
    });
    serviceWorker.addEventListener("controllerchange", () =>
      record("sw.controllerchange"),
    );
  }

  const loadFont = FontFace.prototype.load;
  FontFace.prototype.load = function (this: FontFace) {
    const label = `${this.family} ${this.weight} ${this.style} (${this.status})`;
    record("font.load.start", label);
    return loadFont.call(this).finally(() => record("font.load.end", label));
  };
}

export function collectProfile(): PageProfile | null {
  const profiledWindow: ProfiledWindow = window;
  const state = profiledWindow.__visualProfile;
  if (!state) {
    return null;
  }
  const [navigation] = performance.getEntriesByType("navigation");
  const resources = performance
    .getEntriesByType("resource")
    .filter(
      (entry): entry is PerformanceResourceTiming =>
        entry instanceof PerformanceResourceTiming,
    )
    .map((entry) => ({
      name: entry.name,
      start: entry.startTime,
      end: entry.responseEnd,
      transferSize: entry.transferSize,
      initiatorType: entry.initiatorType,
    }));
  return {
    timeOrigin: performance.timeOrigin,
    events: state.events,
    longTasks: state.longTasks,
    modules: Array.from(state.modules, ([id, timing]) => ({
      id,
      ...timing,
    })).filter((timing) => timing.selfMs >= 0.5 || timing.totalMs >= 5),
    moduleStartAndSelfMs: Array.from(state.modules.values(), (timing) => [
      Math.round(timing.start * 10) / 10,
      Math.round(timing.selfMs * 100) / 100,
    ]),
    navigation: navigation?.toJSON(),
    resources,
  };
}
