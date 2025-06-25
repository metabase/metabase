import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";

import { setupSdkDashboard } from "../tests/setup";

import {
  EditableDashboard,
  type EditableDashboardProps,
} from "./EditableDashboard";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const setup = async (
  options: {
    props?: Partial<EditableDashboardProps>;
    providerProps?: Partial<MetabaseProviderProps>;
    isLocaleLoading?: boolean;
  } = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: EditableDashboard,
  });
};

describe("EditableDashboard", () => {
  it("should support dashboard editing", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const editButton = within(
      screen.getByTestId("dashboard-header"),
    ).getByLabelText(`pencil icon`);

    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);

    expect(
      screen.getByText("You're editing this dashboard."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
