import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";
import { useRouter } from "metabase/router";

import { MetabotQueryBuilder } from "./MetabotQueryBuilder";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useGetSuggestedMetabotPromptsQuery: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  useRouter: jest.fn(),
}));

function setup({ showIllustrations }: { showIllustrations: boolean }) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    canUseNlq: true,
    canUseMetabot: true,
    canUseSqlGeneration: true,
    canUseOtherTools: true,
    isLoading: false,
    isError: false,
  });
  jest.mocked(useMetabotAgent).mockReturnValue({
    setVisible: jest.fn(),
    resetConversation: jest.fn(),
    submitInput: jest.fn(),
    cancelRequest: jest.fn(),
    setPrompt: jest.fn(),
    metabotId: "default",
    isDoingScience: false,
    prompt: "",
    promptInputRef: { current: null },
  } as any);
  jest.mocked(useGetSuggestedMetabotPromptsQuery).mockReturnValue({
    currentData: { prompts: [] },
  } as any);
  jest.mocked(useRouter).mockReturnValue({
    router: { setRouteLeaveHook: jest.fn(() => () => {}) } as any,
    routes: [],
    location: {} as any,
    params: {},
  });

  const settings = mockSettings({
    "metabot-show-illustrations": showIllustrations,
  });

  return renderWithProviders(<MetabotQueryBuilder {...({} as any)} />, {
    storeInitialState: createMockState({ settings }),
  });
}

describe("MetabotQueryBuilder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Metabot illustration when metabot-show-illustrations is true", () => {
    setup({ showIllustrations: true });
    expect(screen.getByRole("img", { name: "Metabot" })).toBeInTheDocument();
  });

  it("hides the Metabot illustration when metabot-show-illustrations is false", () => {
    setup({ showIllustrations: false });
    expect(
      screen.queryByRole("img", { name: "Metabot" }),
    ).not.toBeInTheDocument();
  });
});
