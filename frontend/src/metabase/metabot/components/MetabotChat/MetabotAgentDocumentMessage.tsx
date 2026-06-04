import type { MetabotAgentId } from "metabase/metabot/state";

import { DocumentCanvasEmbed } from "./DocumentCanvas";

export const AgentDocumentMessage = ({
  documentId,
  agentId,
}: {
  documentId: number;
  agentId: MetabotAgentId;
}) => <DocumentCanvasEmbed documentId={documentId} agentId={agentId} />;
