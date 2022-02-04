import { setupEnterpriseTest } from "__support__/enterprise";
import {
  getCollectionIcon,
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS as ALL_PERSONAL_COLLECTIONS_VIRTUAL,
} from "metabase/entities/collections";

describe("getCollectionIcon", () => {
  function collection({
    id = 10,
    personal_owner_id = null,
    authority_level = null,
  } = {}) {
    return {
      id,
      personal_owner_id,
      authority_level,
    };
  }

  const commonTestCases = [
    {
      name: "Our analytics",
      collection: ROOT_COLLECTION,
      expectedIcon: "folder",
    },
    {
      name: "All personal collections",
      collection: ALL_PERSONAL_COLLECTIONS_VIRTUAL,
      expectedIcon: "group",
    },
    {
      name: "Regular collection",
      collection: collection(),
      expectedIcon: "folder",
    },
    {
      name: "Personal collection",
      collection: collection({ personal_owner_id: 4 }),
      expectedIcon: "person",
    },
  ];

  const OFFICIAL_COLLECTION = collection({ authority_level: "official" });

  const testCasesOSS = [
    ...commonTestCases,
    {
      name: "Official collection",
      collection: OFFICIAL_COLLECTION,
      expectedIcon: "folder",
    },
  ];

  const testCasesEE = [
    ...commonTestCases,
    {
      name: "Official collection",
      collection: OFFICIAL_COLLECTION,
      expectedIcon: "badge",
    },
  ];

  describe("OSS", () => {
    testCasesOSS.forEach(testCase => {
      const { name, collection, expectedIcon } = testCase;
      it(`returns '${expectedIcon}' for '${name}'`, () => {
        expect(getCollectionIcon(collection)).toMatchObject({
          name: expectedIcon,
        });
      });
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      setupEnterpriseTest();
    });

    testCasesEE.forEach(testCase => {
      const { name, collection, expectedIcon } = testCase;
      it(`returns '${expectedIcon}' for '${name}'`, () => {
        expect(getCollectionIcon(collection)).toMatchObject({
          name: expectedIcon,
        });
      });
    });
  });
});
