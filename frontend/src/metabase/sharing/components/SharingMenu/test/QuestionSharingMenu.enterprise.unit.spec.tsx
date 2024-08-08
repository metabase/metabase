import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { setupQuestionSharingMenu } from "./setup";

describe("QuestionSharingMenu > Enterprise", () => {
  it("should not allow sharing instance analytics question", async () => {
    setupQuestionSharingMenu({
      isAdmin: true,
      isPublicSharingEnabled: true,
      isEmbeddingEnabled: true,
      isEnterprise: true,
      question: {
        name: "analysis",
        collection: createMockCollection({
          id: 198,
          name: "Analytics",
          type: "instance-analytics",
        }),
      },
    });
    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });
});
