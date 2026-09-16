import { renderWithProviders, screen } from "__support__/ui";
import { metricUrls } from "metabase/metrics/urls";
import { createMockCard } from "metabase-types/api/mocks";

import { MetricHeader } from "./MetricHeader";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <button>Switch apps</button>,
}));

jest.mock("./MetricTabs", () => ({ MetricTabs: () => null }));
jest.mock("./MetricToolbar", () => ({ MetricToolbar: () => null }));

function setup(showAppSwitcher?: boolean) {
  renderWithProviders(
    <MetricHeader
      card={createMockCard({ name: "Revenue", can_write: false })}
      urls={metricUrls}
      showAppSwitcher={showAppSwitcher}
      showDataStudioLink={false}
    />,
  );
}

describe("MetricHeader", () => {
  it("omits the app switcher on standalone metric pages by default", () => {
    setup();

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch apps" }),
    ).not.toBeInTheDocument();
  });

  it("supplies the app switcher when requested by Data Studio", () => {
    setup(true);

    expect(
      screen.getByRole("button", { name: "Switch apps" }),
    ).toBeInTheDocument();
  });

  it("respects explicitly hiding the app switcher", () => {
    setup(false);

    expect(
      screen.queryByRole("button", { name: "Switch apps" }),
    ).not.toBeInTheDocument();
  });
});
