import { render, screen } from "__support__/ui";

import { createLazyModule, useLazyModule } from "./lazy-module";

describe("createLazyModule", () => {
  it("should load the module once and return it synchronously afterwards", async () => {
    const loader = jest.fn(() => Promise.resolve({ value: 1 }));
    const lazyModule = createLazyModule(loader);

    expect(lazyModule.get()).toBeUndefined();
    await Promise.all([lazyModule.load(), lazyModule.load()]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(lazyModule.get()).toEqual({ value: 1 });
  });

  it("should retry after a failed load", async () => {
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce({ value: 2 });
    const lazyModule = createLazyModule(loader);

    await expect(lazyModule.load()).rejects.toThrow("chunk failed");
    await expect(lazyModule.load()).resolves.toEqual({ value: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("useLazyModule", () => {
  function Value({ lazyModule }: { lazyModule: ReturnType<typeof setup> }) {
    const module = useLazyModule(lazyModule);
    return <div>{module ? module.label : "loading"}</div>;
  }

  function setup() {
    return createLazyModule(() => Promise.resolve({ label: "loaded" }));
  }

  it("should render without the module first and re-render once it loads", async () => {
    render(<Value lazyModule={setup()} />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });

  it("should return an already loaded module on the first render", async () => {
    const lazyModule = setup();
    await lazyModule.load();

    render(<Value lazyModule={lazyModule} />);

    expect(screen.getByText("loaded")).toBeInTheDocument();
  });
});
