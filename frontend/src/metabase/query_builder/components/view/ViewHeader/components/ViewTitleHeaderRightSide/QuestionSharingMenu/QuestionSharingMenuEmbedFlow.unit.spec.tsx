import { createMockMetadata } from "__support__/metadata";
import {
  type RenderSharingMenu,
  describeEmbedFlowFromSharingMenu,
} from "__support__/sharing-menu-embed-flow";
import Question from "metabase-lib/v1/Question";

import { QuestionSharingMenu } from "./QuestionSharingMenu";

// Usage analytics of the embed.js host page, reported a second after an embed
// mounts, when the preview may already be gone.
jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

const renderSharingMenu: RenderSharingMenu = ({ card }) => (
  <QuestionSharingMenu question={new Question(card, createMockMetadata({}))} />
);

describeEmbedFlowFromSharingMenu("question", renderSharingMenu);
