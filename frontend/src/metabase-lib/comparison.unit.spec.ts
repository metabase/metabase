import { freeze } from "immer";

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

describe("findColumnIndexesFromLegacyRefs", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  it("works even on frozen columns and refs", () => {
    const card = createMockCard({});
    const question = new Question(card, metadata);

    const columns = question._legacyQuery().columns();

    const frozen = freeze(columns, true /* deep */);
    expect(Object.isFrozen(frozen[6])).toBe(true);
    expect(Object.isFrozen(frozen[6].field_ref)).toBe(true);
    expect(
      Lib.findColumnIndexesFromLegacyRefs(question.query(), -1, frozen, [
        frozen[6].field_ref,
      ]),
    ).toEqual([6]);
  });
});
