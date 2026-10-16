import {
  createMockCollection,
  createMockDocument,
} from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  DOCUMENTS_FOLDER,
  LIBRARY_COLLECTION,
} from "../../test-utils";

import { getLibraryItemPageStatus, getParentCollectionId } from "./utils";

const SHARED = createMockCollection({ id: 4, name: "Shared" });

const DOCUMENT = createMockDocument({ id: 10 });

const LOADED = {
  item: DOCUMENT,
  isLoading: false,
  error: undefined,
  path: [LIBRARY_COLLECTION, DOCUMENTS_COLLECTION, DOCUMENTS_FOLDER],
  isLoadingPath: false,
  pathError: undefined,
  sectionType: "library-documents" as const,
};

describe("getLibraryItemPageStatus", () => {
  it("loads while the item loads, and again while its path loads", () => {
    expect(
      getLibraryItemPageStatus({ ...LOADED, item: undefined, isLoading: true }),
    ).toEqual({ type: "loading" });
    expect(
      getLibraryItemPageStatus({
        ...LOADED,
        path: undefined,
        isLoadingPath: true,
      }),
    ).toEqual({ type: "loading" });
    expect(getLibraryItemPageStatus({ ...LOADED, path: undefined })).toEqual({
      type: "loading",
    });
  });

  it("is not found when the API has no such item, or the route named none", () => {
    expect(
      getLibraryItemPageStatus({
        ...LOADED,
        item: undefined,
        error: { status: 404, data: "Not found." },
      }),
    ).toEqual({ type: "not-found" });
    expect(getLibraryItemPageStatus({ ...LOADED, item: undefined })).toEqual({
      type: "not-found",
    });
  });

  it("reports any other error on the item or its path", () => {
    const error = { status: 500 };
    expect(
      getLibraryItemPageStatus({ ...LOADED, item: undefined, error }),
    ).toEqual({ type: "error", error });
    expect(
      getLibraryItemPageStatus({
        ...LOADED,
        path: undefined,
        pathError: error,
      }),
    ).toEqual({ type: "error", error });
  });

  it("is ready with the folders below the section", () => {
    expect(getLibraryItemPageStatus(LOADED)).toEqual({
      type: "ready",
      item: DOCUMENT,
      folders: [DOCUMENTS_FOLDER],
    });
  });

  it("places an item outside the Library by its own collection", () => {
    expect(getLibraryItemPageStatus({ ...LOADED, path: [SHARED] })).toEqual({
      type: "outside-library",
      item: DOCUMENT,
      locationName: "Shared",
    });
  });
});

describe("getParentCollectionId", () => {
  it("reads the last id of a location path", () => {
    expect(getParentCollectionId("/7/11/")).toBe(11);
  });

  it("has no parent at the root", () => {
    expect(getParentCollectionId("/")).toBeUndefined();
    expect(getParentCollectionId(null)).toBeUndefined();
  });
});
