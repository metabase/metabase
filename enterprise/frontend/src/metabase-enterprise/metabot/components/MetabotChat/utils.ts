import type { MetabotChatMessage } from "metabase-enterprise/metabot/state";

export const isLastAgentReply = (
  message: MetabotChatMessage,
  nextMessage: MetabotChatMessage | undefined,
) => {
  return (
    message.role === "agent" &&
    message.type === "reply" &&
    (!nextMessage ||
      nextMessage.role !== "agent" ||
      (nextMessage.role === "agent" && nextMessage.type !== message.type))
  );
};
