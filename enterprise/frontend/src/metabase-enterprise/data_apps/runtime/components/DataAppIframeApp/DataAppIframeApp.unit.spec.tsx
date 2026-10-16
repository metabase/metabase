import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { readNameFromUrl } from "../../lib/read-name-from-url";
import { reportErrorToParent } from "../../lib/report-error-to-parent";
import { useDataAppBundle } from "../../lib/use-data-app-bundle";

import { DataAppIframeApp } from "./DataAppIframeApp";

jest.mock("../../lib/read-name-from-url", () => ({
  readNameFromUrl: jest.fn(),
}));
jest.mock("../../lib/use-data-app-bundle", () => ({
  useDataAppBundle: jest.fn(),
}));
jest.mock("../../lib/report-error-to-parent", () => ({
  reportErrorToParent: jest.fn(),
}));
jest.mock("../DataAppProvider/DataAppProvider", () => ({
  DataAppProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="data-app-provider">{children}</div>
  ),
}));

const mockedReadName = jest.mocked(readNameFromUrl);
const mockedUseBundle = jest.mocked(useDataAppBundle);
const mockedReport = jest.mocked(reportErrorToParent);

// A stand-in parent window, identity-distinct from `window` so the app reads as
// framed; a bare object covers the only member the code touches (`postMessage`).
const framedParent = { postMessage: jest.fn() } as unknown as Window;

function setFramed(framed: boolean) {
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: framed ? framedParent : window,
  });
}

type SetupOpts = {
  name?: string | null;
  bundle?: ReturnType<typeof useDataAppBundle>;
};

const setup = ({
  name = "sales",
  bundle = { data: null, failed: false },
}: SetupOpts = {}) => {
  mockedReadName.mockReturnValue(name);
  mockedUseBundle.mockReturnValue(bundle);
  renderWithProviders(<DataAppIframeApp />);

  return { report: mockedReport };
};

describe("DataAppIframeApp", () => {
  beforeEach(() => setFramed(true));
  afterEach(() => {
    setFramed(false);
    jest.clearAllMocks();
  });

  it("shows an error when opened directly as a top-level page (no parent frame)", () => {
    setFramed(false);
    setup();

    expect(
      screen.getByText("This data app can’t be opened directly."),
    ).toBeInTheDocument();
  });

  it("shows an error when the URL has no data-app name", () => {
    setup({ name: null });

    expect(
      screen.getByText("Missing data-app name in URL"),
    ).toBeInTheDocument();
  });

  it("renders the loaded bundle component inside DataAppProvider", () => {
    setup({
      bundle: {
        data: { component: () => <div>bundle content</div>, providerProps: {} },
        failed: false,
      },
    });

    expect(screen.getByTestId("data-app-provider")).toBeInTheDocument();
    expect(screen.getByText("bundle content")).toBeInTheDocument();
  });

  it("renders a neutral loader (no bundle content) until the bundle resolves", () => {
    setup({ bundle: { data: null, failed: false } });

    expect(screen.getByTestId("data-app-provider")).toBeInTheDocument();
    expect(screen.queryByText("bundle content")).not.toBeInTheDocument();
  });

  it("reports a render-time bundle crash up to the host and shows a loader", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const Boom = () => {
      throw new Error("render boom");
    };

    const { report } = setup({
      bundle: { data: { component: Boom, providerProps: {} }, failed: false },
    });

    expect(report).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ message: "render boom" }),
    );
    consoleError.mockRestore();
  });
});
