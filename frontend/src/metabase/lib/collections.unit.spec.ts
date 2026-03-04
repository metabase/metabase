import type { Crumb } from "metabase/common/components/Breadcrumbs";
import { createMockCollection } from "metabase-types/api/mocks";

import { getCrumbs } from "./collections";

const getCrumbAction = (crumb: Crumb) => {
  if (
    !Array.isArray(crumb) ||
    crumb.length < 2 ||
    typeof crumb[1] !== "function"
  ) {
    throw new Error("Expected crumb callback action");
  }

  return crumb[1];
};

const collectionsById = {
  root: createMockCollection({ id: "root", name: "Our analytics", path: [] }),
  1: createMockCollection({ id: 1, name: "parent", path: ["root"] }),
  2: createMockCollection({ id: 2, name: "child", path: ["root", 1] }),
};

describe("getCrumbs", () => {
  it("returns path starting from root", () => {
    const crumbs = getCrumbs(collectionsById[2], collectionsById, jest.fn());

    expect(crumbs).toMatchObject([
      ["Our analytics", expect.any(Function)],
      ["parent", expect.any(Function)],
      ["child"],
    ]);
  });

  it("makes collection step functions calling the callback with the collection id", () => {
    const callbackMock = jest.fn();
    const crumbs = getCrumbs(collectionsById[2], collectionsById, callbackMock);

    const rootCallback = getCrumbAction(crumbs[0]);
    // Workaround to simulate actual event object passed by React, impossible to construct.
    rootCallback(undefined as never);
    expect(callbackMock).toHaveBeenCalledWith("root");

    const parentCallback = getCrumbAction(crumbs[1]);
    // Workaround to simulate actual event object passed by React, impossible to construct.
    parentCallback(undefined as never);
    expect(callbackMock).toHaveBeenCalledWith(1);
  });
});
