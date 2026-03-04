import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";
import _ from "underscore";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  createMockDatabase,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { Metabot } from "../components/Metabot";

import {
  enterChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > context", () => {
  it("should send along default context", async () => {
    setup();
    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    await enterChatMessage("Who is your favorite?");

    expect(
      isMatching(
        { current_time_with_timezone: P.string },
        (await lastReqBody(agentSpy))?.context,
      ),
    ).toEqual(true);
  });

  it("should send along available actions in context", async () => {
    setup({
      currentUser: createMockUser({
        permissions: createMockUserPermissions({ can_create_queries: true }),
      }),
    });
    fetchMock.removeRoutes({ names: ["database-list"] });
    setupDatabaseListEndpoint([
      createMockDatabase({
        is_saved_questions: false,
        native_permissions: "none",
      }),
    ]);

    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    await enterChatMessage("Who is your favorite?");

    expect(
      _.pick((await lastReqBody(agentSpy))?.context, "capabilities"),
    ).toEqual({
      capabilities: ["frontend:navigate_user_v1", "permission:save_questions"],
    });
  });

  it("should allow components to register additional context", async () => {
    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    const TestComponent = () => {
      useRegisterMetabotContextProvider(
        () =>
          Promise.resolve({
            user_is_viewing: [{ type: "dashboard", id: 1 }],
          }),
        [],
      );
      return null;
    };

    setup({
      ui: (
        <>
          <Metabot />
          <TestComponent />
        </>
      ),
    });

    await enterChatMessage("Who is your favorite?");

    expect(
      isMatching(
        {
          current_time_with_timezone: P.string,
          user_is_viewing: [{ type: "dashboard", id: 1 }],
        },
        (await lastReqBody(agentSpy))?.context,
      ),
    ).toBe(true);
  });
});
