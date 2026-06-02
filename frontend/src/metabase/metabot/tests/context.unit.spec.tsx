import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";
import { P, isMatching } from "ts-pattern";
import _ from "underscore";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { FixSqlQueryButton } from "metabase/metabot/components/FixSqlQueryButton";
import { setIsNativeEditorOpen } from "metabase/redux/query-builder";
import {
  createMockDashboard,
  createMockDatabase,
  createMockUser,
  createMockUserMetabotPermissions,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { MetabotChat } from "../components/MetabotChat";
import { METABOT_PROFILE_OVERRIDES } from "../constants";

import {
  enterChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

jest.mock("metabase/redux/query-builder", () => ({
  ...jest.requireActual("metabase/redux/query-builder"),
  setIsNativeEditorOpen: jest.fn(),
}));

describe("metabot > context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
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
      capabilities: ["permission:save_questions"],
    });
  });

  it("should allow components to register additional context", async () => {
    fetchMock.get(
      "path:/api/dashboard/1",
      createMockDashboard({ id: 1, name: "Sales Dashboard" }),
    );

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
          <MetabotChat agentId="omnibot" />
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

  it("should show attached context from what the user is viewing", async () => {
    fetchMock.get("path:/api/document/1", { id: 1, name: "Company Plan" });

    const TestComponent = () => {
      useRegisterMetabotContextProvider(
        () =>
          Promise.resolve({
            user_is_viewing: [{ type: "document", id: 1 }],
          }),
        [],
      );
      return null;
    };

    setup({
      ui: (
        <>
          <MetabotChat agentId="omnibot" />
          <TestComponent />
        </>
      ),
    });

    await screen.findByText("Company Plan");
    const attachedContext = screen.getByTestId("metabot-attached-context");

    expect(attachedContext).toHaveTextContent("Company Plan");
    expect(attachedContext).toHaveAttribute("href", "/document/1");
  });

  it("should update attached context while the chat is open", async () => {
    fetchMock.get("path:/api/document/1", { id: 1, name: "Company Plan" });
    fetchMock.get("path:/api/document/2", { id: 2, name: "Roadmap" });

    const TestComponent = () => {
      const [documentId, setDocumentId] = useState(1);

      useRegisterMetabotContextProvider(
        () =>
          Promise.resolve({
            user_is_viewing: [{ type: "document", id: documentId }],
          }),
        [documentId],
      );

      return (
        <button onClick={() => setDocumentId(2)}>View another document</button>
      );
    };

    setup({
      ui: (
        <>
          <MetabotChat agentId="omnibot" />
          <TestComponent />
        </>
      ),
    });

    expect(await screen.findByText("Company Plan")).toBeInTheDocument();

    await userEvent.click(screen.getByText("View another document"));

    await screen.findByText("Roadmap");
    const attachedContext = screen.getByTestId("metabot-attached-context");

    expect(attachedContext).toHaveTextContent("Roadmap");
    expect(attachedContext).toHaveAttribute("href", "/document/2");
  });

  it("should show attached context without an entity id", async () => {
    const TestComponent = () => {
      useRegisterMetabotContextProvider(
        () =>
          Promise.resolve({
            user_is_viewing: [{ type: "adhoc" }],
          }),
        [],
      );
      return null;
    };

    setup({
      ui: (
        <>
          <MetabotChat agentId="omnibot" />
          <TestComponent />
        </>
      ),
    });

    const attachedContext = await screen.findByTestId(
      "metabot-attached-context",
    );

    expect(attachedContext).toHaveTextContent("Unsaved question");
    expect(attachedContext).not.toHaveAttribute("href");
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
      useRegisterMetabotContextProvider(() =>
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
