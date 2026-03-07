import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";
import _ from "underscore";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";
import {
  createMockDatabase,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { FixSqlQueryButton } from "../../ai-sql-fixer/components/FixSqlQueryButton/FixSqlQueryButton";
import { Metabot } from "../components/Metabot";
import { METABOT_PROFILE_OVERRIDES } from "../constants";

import {
  enterChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotEnabledEmbeddingAware: () => true,
}));

jest.mock("metabase/query_builder/actions", () => ({
  ...jest.requireActual("metabase/query_builder/actions"),
  setIsNativeEditorOpen: jest.fn(),
}));

describe("metabot > context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(setIsNativeEditorOpen).mockImplementation(
      (isNativeEditorOpen: boolean) =>
        ({
          type: "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN",
          isNativeEditorOpen,
        }) as any,
    );
  });

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

  it("should send SQL profile and SQL error context for SQL fixes", async () => {
    const rawSql = "SELECT * FROM bad_table";
    const queryError = "bad_table";
    const editorOpen = { resolve: undefined as (() => void) | undefined };

    jest.mocked(setIsNativeEditorOpen).mockImplementationOnce(
      () =>
        (() =>
          new Promise<void>((resolve) => {
            editorOpen.resolve = resolve;
          })) as any,
    );

    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    const SqlFixContextRegistration = () => {
      useRegisterMetabotContextProvider(
        () =>
          Promise.resolve({
            user_is_viewing: [
              {
                type: "adhoc",
                query: {
                  type: "native",
                  database: 1,
                  native: {
                    query: rawSql,
                  },
                },
                error: queryError,
              },
            ],
          }),
        [rawSql, queryError],
      );

      return null;
    };

    setup({
      ui: (
        <>
          <SqlFixContextRegistration />
          <FixSqlQueryButton />
        </>
      ),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(setIsNativeEditorOpen).toHaveBeenCalledWith(true);
    expect(agentSpy).not.toHaveBeenCalled();

    expect(editorOpen.resolve).toBeDefined();
    editorOpen.resolve?.();

    const requestBody = await lastReqBody(agentSpy);
    expect(requestBody.profile_id).toBe(METABOT_PROFILE_OVERRIDES.SQL);
    expect(requestBody.context).toEqual(
      expect.objectContaining({
        user_is_viewing: expect.arrayContaining([
          expect.objectContaining({
            type: "adhoc",
            error: queryError,
            query: expect.objectContaining({
              type: "native",
              native: expect.objectContaining({
                query: rawSql,
              }),
            }),
          }),
        ]),
      }),
    );
  });
});
