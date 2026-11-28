import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { handleLoadedByEntityId } from "./lifecycle";

type Snippet = {
  id: number;
  name: string;
};

const SNIPPET: Snippet = { id: 7, name: "Active customers filter" };

describe("handleLoadedByEntityId", () => {
  it("passes on the result of a query made by entity ID", async () => {
    const handleEntity = jest.fn<void, [Snippet]>();
    const entityId = createMockEntityId("SxK3Lg37DTANoAntMdKwi");

    await handleLoadedByEntityId(
      entityId,
      Promise.resolve({ data: SNIPPET }),
      handleEntity,
    );

    expect(handleEntity).toHaveBeenCalledTimes(1);
    expect(handleEntity).toHaveBeenCalledWith(SNIPPET);
  });

  it.each([
    { name: "a numeric ID", id: 7 },
    { name: "a numeric ID written as text", id: "7" },
    { name: "a named collection", id: "root" },
  ])("ignores a query made by $name", async ({ id }) => {
    const handleEntity = jest.fn<void, [Snippet]>();

    await handleLoadedByEntityId(
      id,
      Promise.resolve({ data: SNIPPET }),
      handleEntity,
    );

    expect(handleEntity).not.toHaveBeenCalled();
  });

  it("ignores a query that failed", async () => {
    const handleEntity = jest.fn<void, [Snippet]>();
    const entityId = createMockEntityId("SxK3Lg37DTANoAntMdKwi");

    await handleLoadedByEntityId(
      entityId,
      Promise.reject<{ data: Snippet }>(new Error("Not found.")),
      handleEntity,
    );

    expect(handleEntity).not.toHaveBeenCalled();
  });
});
