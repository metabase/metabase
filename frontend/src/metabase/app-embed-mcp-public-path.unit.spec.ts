describe("app-embed-mcp-public-path", () => {
  const setRuntimePublicPath = (value: string) => {
    (globalThis as any).__webpack_public_path__ = value;
  };

  const getRuntimePublicPath = () =>
    (globalThis as any).__webpack_public_path__;

  const setInstanceUrl = (instanceUrl: string | undefined) => {
    (window as any).metabaseConfig =
      instanceUrl === undefined ? undefined : { instanceUrl };
  };

  const loadModule = () => import("./app-embed-mcp-public-path");

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete (window as any).metabaseConfig;
    delete (globalThis as any).__webpack_public_path__;
  });

  it("rewrites the relative production publicPath to an absolute instance URL", async () => {
    setRuntimePublicPath("app/dist/");
    setInstanceUrl("https://mb.example.com");

    await loadModule();

    expect(getRuntimePublicPath()).toBe("https://mb.example.com/app/dist/");
  });

  it("does not double the slash when the instance URL already ends with one", async () => {
    setRuntimePublicPath("app/dist/");
    setInstanceUrl("https://mb.example.com/");

    await loadModule();

    expect(getRuntimePublicPath()).toBe("https://mb.example.com/app/dist/");
  });

  it("leaves an already-absolute (hot/dev) publicPath untouched", async () => {
    setRuntimePublicPath("http://localhost:8080/app/dist/");
    setInstanceUrl("https://mb.example.com");

    await loadModule();

    expect(getRuntimePublicPath()).toBe("http://localhost:8080/app/dist/");
  });

  it("does nothing when no instance URL is available", async () => {
    setRuntimePublicPath("app/dist/");
    setInstanceUrl(undefined);

    await loadModule();

    expect(getRuntimePublicPath()).toBe("app/dist/");
  });
});
