import { act } from "@testing-library/react";
import { Route } from "react-router";

import { renderWithProviders } from "__support__/ui";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";

import { MetabotAdminLayout } from "./MetabotAdminLayout";

const originalScrollTo = HTMLElement.prototype.scrollTo;
const scrollToMock = jest.fn();

const TestMetabotAdminLayout = () => (
  <MetabotAdminLayout>
    <div>content</div>
  </MetabotAdminLayout>
);

describe("MetabotAdminLayout", () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    HTMLElement.prototype.scrollTo = scrollToMock;
  });

  afterAll(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
  });

  it("preserves scroll when switching between internal and embedded metabot tabs", () => {
    const { history } = renderWithProviders(
      <Route path="/admin/metabot*" component={TestMetabotAdminLayout} />,
      {
        initialRoute: `/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`,
        withRouter: true,
      },
    );

    scrollToMock.mockClear();

    act(() => {
      history?.push(`/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`);
    });

    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("still scrolls to top for other metabot admin pathname changes", () => {
    const { history } = renderWithProviders(
      <Route path="/admin/metabot*" component={TestMetabotAdminLayout} />,
      {
        initialRoute: `/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`,
        withRouter: true,
      },
    );

    scrollToMock.mockClear();

    act(() => {
      history?.push("/admin/metabot/usage-limits");
    });

    expect(scrollToMock).toHaveBeenCalledWith(0, 0);
  });
});
