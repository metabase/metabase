import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useGetMyExplorationsQuery } from "metabase/api";
import {
  createExplorationSummary,
  makeMockSelection,
} from "metabase/explorations/test-utils";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";
import type { GetMyExplorationsResponse } from "metabase-types/api";

import { NewExplorationEntry } from "./NewExplorationEntry";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useGetMyExplorationsQuery: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

jest.mock("metabase/metabot/components/MetabotPromptInput", () => ({
  MetabotPromptInput: () => null,
}));

function mockMyExplorationsQuery({
  isSuccess = true,
  data,
}: {
  isSuccess?: boolean;
  data?: GetMyExplorationsResponse;
} = {}) {
  jest.mocked(useGetMyExplorationsQuery).mockReturnValue({
    isSuccess,
    data,
  } as any);
}

function setup({
  isSuccess = true,
  myExplorations = { total: 0, limit: 25, offset: 0, data: [] },
  dismissedBanner = false,
}: {
  isSuccess?: boolean;
  myExplorations?: GetMyExplorationsResponse;
  dismissedBanner?: boolean;
} = {}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    hasNlqAccess: true,
    canUseNlq: true,
  } as any);

  jest.mocked(useMetabotAgent).mockReturnValue({
    prompt: "",
    setPrompt: jest.fn(),
    submitInput: jest.fn(),
  } as any);

  mockMyExplorationsQuery({ isSuccess, data: myExplorations });

  const selection = makeMockSelection({});
  const setMode = jest.fn();

  renderWithProviders(
    <NewExplorationEntry selection={selection} setMode={setMode} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "dismissed-research-mode-banner": dismissedBanner,
        }),
      }),
    },
  );
}

describe("NewExplorationEntry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("banner and past projects list", () => {
    it("shows neither while my explorations are loading", () => {
      setup({ isSuccess: false, myExplorations: undefined as any });

      expect(
        screen.queryByTestId("research-mode-banner"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("past-research-projects"),
      ).not.toBeInTheDocument();
    });

    it("shows the banner when the user has no past explorations", () => {
      setup();

      expect(screen.getByTestId("research-mode-banner")).toBeInTheDocument();
      expect(
        screen.queryByTestId("past-research-projects"),
      ).not.toBeInTheDocument();
    });

    it("shows the past projects list when the user has explorations", () => {
      setup({
        myExplorations: {
          total: 1,
          limit: 25,
          offset: 0,
          data: [createExplorationSummary()],
        },
      });

      expect(screen.getByTestId("past-research-projects")).toBeInTheDocument();
      expect(screen.getByText("Revenue investigation")).toBeInTheDocument();
      expect(
        screen.queryByTestId("research-mode-banner"),
      ).not.toBeInTheDocument();
    });

    it("shows neither when the user has no explorations but dismissed the banner", () => {
      setup({ dismissedBanner: true });

      expect(
        screen.queryByTestId("research-mode-banner"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("past-research-projects"),
      ).not.toBeInTheDocument();
    });
  });
});
