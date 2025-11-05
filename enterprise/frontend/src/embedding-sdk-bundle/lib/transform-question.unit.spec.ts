import { createMockMetadata } from "__support__/metadata";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

describe("transform internal to public sdk question", () => {
  it("transforms question properties", () => {
    const entityId = createMockEntityId();

    const card = createMockCard({
      name: "My Question",
      description: "My description",
      entity_id: entityId,
    });

    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });

    const internalQuestion = new Question(card, metadata);

    const publicQuestion = transformSdkQuestion(internalQuestion);

    expect(publicQuestion).toStrictEqual({
      id: 1,
      name: "My Question",
      description: "My description",
      entityId: String(entityId),
      isSavedQuestion: true,
    });
  });
});
