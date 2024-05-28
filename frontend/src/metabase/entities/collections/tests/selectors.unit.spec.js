import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";

describe("Collection selectors", () => {
  const CANONICAL_ROOT_COLLECTION_ID = null;

  const PERSONAL_COLLECTION = {
    id: 1,
    name: "My personal collection",
    can_write: true,
  };

  const TEST_COLLECTION = {
    id: 2,
    name: "Writable Collection",
    can_write: true,
  };

  const TEST_COLLECTION_2 = {
    id: 3,
    name: "One More Writable Collection",
    can_write: true,
  };

  const TEST_READ_ONLY_COLLECTION = {
    id: 4,
    name: "Read-only Collection",
    can_write: false,
  };

  const DEFAULT_COLLECTIONS = {
    [TEST_COLLECTION.id]: TEST_COLLECTION,
    [TEST_COLLECTION_2.id]: TEST_COLLECTION_2,
    [TEST_READ_ONLY_COLLECTION.id]: TEST_READ_ONLY_COLLECTION,
  };

  function getReduxState({
    isAdmin = false,
    collections = DEFAULT_COLLECTIONS,
  } = {}) {
    return {
      currentUser: {
        personal_collection_id: PERSONAL_COLLECTION.id,
      },
      entities: {
        collections: {
          root: {
            id: "root",
            name: "Our analytics",
            can_write: isAdmin,
          },
          [PERSONAL_COLLECTION.id]: PERSONAL_COLLECTION,
          ...collections,
        },
      },
    };
  }

  describe("getInitialCollectionId", () => {
    const { getInitialCollectionId } = Collections.selectors;
    const state = getReduxState();

    it("suggests direct collectionId prop", () => {
      const props = { collectionId: TEST_COLLECTION.id };
      expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
    });

    it("suggests collectionId navigation parameter", () => {
      const props = {
        params: {
          collectionId: TEST_COLLECTION.id,
        },
      };
      expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
    });

    it("suggests id from collection URL slug", () => {
      const slug = `${TEST_COLLECTION.id}-writable-collection`;
      const props = {
        params: {
          slug,
        },
        location: {
          pathname: `/collection/${slug}`,
        },
      };
      expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
    });

    it("suggests collectionId query parameter", () => {
      const props = {
        location: {
          query: {
            collectionId: TEST_COLLECTION.id,
          },
        },
      };
      expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
    });

    it("fallbacks to root collection for admin users if can't suggest an id from props", () => {
      const adminState = getReduxState({ isAdmin: true });
      const props = {};
      expect(getInitialCollectionId(adminState, props)).toBe(
        CANONICAL_ROOT_COLLECTION_ID,
      );
    });

    it("fallbacks to personal collection for non-admin users if can't suggest an id from props", () => {
      const props = {};
      expect(getInitialCollectionId(state, props)).toBe(PERSONAL_COLLECTION.id);
    });

    it("does not use URL slug if it's not collection URL", () => {
      const slug = `5-dashboard`;
      const props = {
        params: {
          slug,
        },
        location: {
          pathname: `/dashboard/${slug}`,
        },
      };
      expect(getInitialCollectionId(state, props)).toBe(PERSONAL_COLLECTION.id);
    });

    describe("order priority", () => {
      it("prioritizes direct collectionId prop", () => {
        const props = {
          collectionId: TEST_COLLECTION.id,
          params: {
            collectionId: TEST_COLLECTION_2.id,
            slug: `${TEST_COLLECTION_2.id}-slug`,
          },
          location: {
            pathname: `/collection/${TEST_COLLECTION_2.id}-slug`,
            query: {
              collectionId: TEST_COLLECTION_2.id,
            },
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
      });

      it("prioritizes collectionId navigation param", () => {
        const props = {
          params: {
            collectionId: TEST_COLLECTION.id,
            slug: `${TEST_COLLECTION_2.id}-slug`,
          },
          location: {
            pathname: `/collection/${TEST_COLLECTION_2.id}-slug`,
            query: {
              collectionId: TEST_COLLECTION_2.id,
            },
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
      });

      it("prioritizes id from a URL slug", () => {
        const props = {
          params: {
            slug: `${TEST_COLLECTION.id}-slug`,
          },
          location: {
            pathname: `/collection/${TEST_COLLECTION.id}-slug`,
            query: {
              collectionId: TEST_COLLECTION_2.id,
            },
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
      });
    });

    describe("permissions", () => {
      it("does not suggest a read-only collection", () => {
        const props = {
          collectionId: TEST_READ_ONLY_COLLECTION.id,
          params: {
            collectionId: TEST_READ_ONLY_COLLECTION.id,
            slug: `${TEST_READ_ONLY_COLLECTION.id}-slug`,
          },
          location: {
            pathname: `/collection/${TEST_READ_ONLY_COLLECTION.id}-slug`,
            query: {
              collectionId: TEST_READ_ONLY_COLLECTION.id,
            },
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(
          PERSONAL_COLLECTION.id,
        );
      });

      it("does not suggest a read-only root collection when others collections permissions had not been loaded yet", () => {
        const { can_write, ...personalCollectionWithoutPermissionsLoaded } =
          PERSONAL_COLLECTION;

        const state = getReduxState({
          collections: {
            [PERSONAL_COLLECTION.id]:
              personalCollectionWithoutPermissionsLoaded,
          },
        });
        const props = {
          collectionId: ROOT_COLLECTION.id,
          params: {
            collectionId: CANONICAL_ROOT_COLLECTION_ID,
            slug: ROOT_COLLECTION.id,
          },
          location: {
            pathname: `/collection/${ROOT_COLLECTION.id}`,
            query: {
              collectionId: ROOT_COLLECTION.id,
            },
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(
          PERSONAL_COLLECTION.id,
        );
      });

      it("picks writable collection even if read-only is prior", () => {
        const props = {
          collectionId: TEST_READ_ONLY_COLLECTION.id,
          params: {
            collectionId: TEST_COLLECTION.id,
          },
        };
        expect(getInitialCollectionId(state, props)).toBe(TEST_COLLECTION.id);
      });
    });
  });
});
