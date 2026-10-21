import { render, screen } from "@testing-library/react";
import { Component, type ReactNode, Suspense } from "react";

import {
  isChunkLoadError,
  lazyChunk,
  setChunkErrorFallback,
} from "metabase/utils/lazy-chunk";

class Boundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  // The cast gives the initial null a nullable type rather than `null`.
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    return this.state.message ?? this.props.children;
  }
}

type SetupOpts = {
  load: () => Promise<{ default: () => ReactNode }>;
};

const setup = ({ load }: SetupOpts) => {
  const Lazy = lazyChunk(load);

  const view = render(
    <Boundary>
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>
    </Boundary>,
  );

  return { Lazy, view };
};

const chunkError = () => new Error("Loading CSS chunk 5600 failed.\n(/a.css)");

describe("isChunkLoadError", () => {
  it("matches a bundler chunk failure", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("matches a native module fetch failure", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: /app/dist/x.js",
        ),
      ),
    ).toBe(true);
  });

  // A module that throws on evaluation throws again just as reliably, so
  // reloading the page for it would loop rather than recover.
  it("does not match an error thrown by the module itself", () => {
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
  });
});

describe("lazyChunk", () => {
  beforeEach(() => {
    setChunkErrorFallback(() => <div>could not load</div>);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setChunkErrorFallback(() => null);
  });

  it("renders the component once its chunk arrives", async () => {
    setup({
      load: () => Promise.resolve({ default: () => <div>loaded</div> }),
    });

    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });

  it("renders the component when a retry reaches an instance that has the chunk", async () => {
    let attempts = 0;
    setup({
      load: () => {
        attempts += 1;
        return attempts < 3
          ? Promise.reject(chunkError())
          : Promise.resolve({ default: () => <div>loaded</div> });
      },
    });

    expect(
      await screen.findByText("loaded", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(attempts).toBe(3);
  });

  it("renders the fallback once the chunk is gone for good, keeping the error boundary intact", async () => {
    let attempts = 0;
    setup({
      load: () => {
        attempts += 1;
        return Promise.reject(chunkError());
      },
    });

    expect(
      await screen.findByText("could not load", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    // The initial attempt plus four retries.
    expect(attempts).toBe(5);
  });

  it("keeps rendering the fallback on a later render", async () => {
    const { Lazy, view } = setup({
      load: () => Promise.reject(chunkError()),
    });

    expect(
      await screen.findByText("could not load", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();

    // A rejected `React.lazy` throws again here, which the boundary would catch
    // and keep. Resolved, the same slot renders the fallback as it is.
    view.rerender(
      <Boundary>
        <Suspense fallback={<div>loading</div>}>
          <Lazy />
        </Suspense>
      </Boundary>,
    );

    expect(screen.getByText("could not load")).toBeInTheDocument();
  });

  it("reports a module that throws once loaded rather than retrying it", async () => {
    let attempts = 0;
    setup({
      load: () => {
        attempts += 1;
        return Promise.reject(new Error("the module itself is broken"));
      },
    });

    expect(
      await screen.findByText("the module itself is broken"),
    ).toBeInTheDocument();
    expect(attempts).toBe(1);
  });
});
