import fetchMock from "fetch-mock";

import { getSandboxedCollectionPermissions } from "../../utils/get-sandboxed-collection-permissions";
import { propagateErrorResponse } from "../../utils/propagate-error-response";

import { grantAccessToModelCollection } from "./setup-permission";

// Mock the utility functions
jest.mock("../../utils/get-sandboxed-collection-permissions", () => ({
  getSandboxedCollectionPermissions: jest.fn(),
}));

jest.mock("../../utils/propagate-error-response", () => ({
  propagateErrorResponse: jest.fn(),
}));

describe("grantAccessToModelCollection", () => {
  const defaultOptions = {
    groupIds: [101, 102],
    collectionIds: [1, 2],
    modelCollectionId: 123,
    instanceUrl: "http://localhost:3000",
    cookie: "test-cookie",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch current revision from collection graph and pass it to permissions update", async () => {
    const mockCurrentGraph = {
      revision: 42,
      groups: {},
    };

    // Mock API calls
    fetchMock
      .get("http://localhost:3000/api/collection/graph", mockCurrentGraph)
      .put("http://localhost:3000/api/collection/graph?skip-graph=true", {});

    // Mock utility functions
    (
      propagateErrorResponse as jest.MockedFunction<
        typeof propagateErrorResponse
      >
    ).mockResolvedValue(undefined);

    (
      getSandboxedCollectionPermissions as jest.MockedFunction<
        typeof getSandboxedCollectionPermissions
      >
    ).mockReturnValue({
      101: { 1: "write" },
      102: { 2: "write" },
    });

    await grantAccessToModelCollection(defaultOptions);

    // Verify that we fetched the current collection graph
    const graphGetCalls = fetchMock.callHistory.calls(
      "http://localhost:3000/api/collection/graph",
      { method: "GET" },
    );
    expect(graphGetCalls).toHaveLength(1);

    // Verify that we passed the current revision to the permissions update
    const collectionUpdateCalls = fetchMock.callHistory.calls(
      "http://localhost:3000/api/collection/graph?skip-graph=true",
      { method: "PUT" },
    );
    expect(collectionUpdateCalls).toHaveLength(1);

    const requestBody = JSON.parse(
      collectionUpdateCalls[0].options?.body as string,
    );
    expect(requestBody.revision).toBe(42); // This is the key assertion
    expect(requestBody.groups[101][123]).toBe("write"); // modelCollectionId access
    expect(requestBody.groups[102][123]).toBe("write"); // modelCollectionId access
  });

  it("should handle missing revision in current graph by defaulting to 0", async () => {
    const mockCurrentGraphWithoutRevision = {
      groups: {},
      // No revision property
    };

    // Mock API calls
    fetchMock
      .get(
        "http://localhost:3000/api/collection/graph",
        mockCurrentGraphWithoutRevision,
      )
      .put("http://localhost:3000/api/collection/graph?skip-graph=true", {});

    // Mock utility functions
    (
      propagateErrorResponse as jest.MockedFunction<
        typeof propagateErrorResponse
      >
    ).mockResolvedValue(undefined);

    (
      getSandboxedCollectionPermissions as jest.MockedFunction<
        typeof getSandboxedCollectionPermissions
      >
    ).mockReturnValue({
      101: { 1: "write" },
      102: { 2: "write" },
    });

    await grantAccessToModelCollection(defaultOptions);

    // Verify that we passed revision 0 when it's missing from the graph
    const collectionUpdateCalls = fetchMock.callHistory.calls(
      "http://localhost:3000/api/collection/graph?skip-graph=true",
      { method: "PUT" },
    );
    expect(collectionUpdateCalls).toHaveLength(1);

    const requestBody = JSON.parse(
      collectionUpdateCalls[0].options?.body as string,
    );
    expect(requestBody.revision).toBe(0); // Should default to 0 when revision is missing
  });

  it("should add modelCollectionId with write permission to all group permissions", async () => {
    const mockCurrentGraph = {
      revision: 10,
      groups: {},
    };

    fetchMock
      .get("http://localhost:3000/api/collection/graph", mockCurrentGraph)
      .put("http://localhost:3000/api/collection/graph?skip-graph=true", {});

    (
      propagateErrorResponse as jest.MockedFunction<
        typeof propagateErrorResponse
      >
    ).mockResolvedValue(undefined);

    // Mock initial permissions without modelCollectionId access
    (
      getSandboxedCollectionPermissions as jest.MockedFunction<
        typeof getSandboxedCollectionPermissions
      >
    ).mockReturnValue({
      101: { 1: "write", 2: "none" },
      102: { 1: "none", 2: "write" },
    });

    await grantAccessToModelCollection(defaultOptions);

    const collectionUpdateCalls = fetchMock.callHistory.calls(
      "http://localhost:3000/api/collection/graph?skip-graph=true",
      { method: "PUT" },
    );
    const requestBody = JSON.parse(
      collectionUpdateCalls[0].options?.body as string,
    );

    // Verify that modelCollectionId (123) was added with "write" permission for all groups
    expect(requestBody.groups[101][123]).toBe("write");
    expect(requestBody.groups[102][123]).toBe("write");

    // Verify that existing permissions were preserved
    expect(requestBody.groups[101][1]).toBe("write");
    expect(requestBody.groups[101][2]).toBe("none");
    expect(requestBody.groups[102][1]).toBe("none");
    expect(requestBody.groups[102][2]).toBe("write");
  });
});
