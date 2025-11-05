import { createMockDatabase } from "metabase-types/api/mocks";

import { hasMeaningfulUploadableDatabases } from "./utils";

const h2 = createMockDatabase({
  id: 1,
  name: "Db Uno",
  engine: "h2",
});

const postgres = createMockDatabase({
  id: 2,
  name: "Db Dos",
  engine: "postgres",
});

const athena = createMockDatabase({
  id: 3,
  name: "Db Tres",
  engine: "athena",
});

const testCases = [
  {
    description: "there are no uploadable databases",
    result: false,
    data: {
      allDatabases: [],
      allUploadableDatabases: [],
    },
  },
  {
    description: "there is only one uploadable database and it is h2",
    result: true,
    data: {
      allDatabases: [h2],
      allUploadableDatabases: [h2],
    },
  },
  {
    description: "multiple databases but h2 is only uploadable",
    result: false,
    data: {
      allDatabases: [h2, athena],
      allUploadableDatabases: [h2],
    },
  },
  {
    description: "with non-h2 uploadable databases",
    result: true,
    data: {
      allDatabases: [postgres, athena],
      allUploadableDatabases: [postgres],
    },
  },
];

describe("hasMeaningfulUploadableDatabases", () => {
  it.each(testCases)(
    "should return $result when $description",
    ({ result, data }) => {
      expect(hasMeaningfulUploadableDatabases(data)).toBe(result);
    },
  );
});
