import { type RefObject, useEffect } from "react";
import { useFirstMountState } from "react-use";
import _ from "underscore";

import type { getMessages } from "metabase-enterprise/metabot/state";

const USER_MSG_SELECTOR = '[data-message-actor="user"]';
const DEFAULT_HEADER_HEIGHT = 81;

export function useAutoscrollMessages(
  headerRef: RefObject<HTMLDivElement>,
  messagesRef: RefObject<HTMLDivElement>,
  messages: ReturnType<typeof getMessages>,
) {
  const isFirstMount = useFirstMountState();

  useEffect(
    function handleAutoscroll() {
      const scrollContainerEl = messagesRef.current;

      if (!scrollContainerEl) {
        return;
      }

      // scroll to the bottom of the container on mount
      if (isFirstMount) {
        scrollContainerEl.scrollTop = scrollContainerEl.scrollHeight;
        return;
      }

      // auto-scroll to the latest user submitted message when
      // - user submits a message
      // - metabot responds for the first time (it can add multiple messages, we only care about the first)
      const [prevMessage, lastMessage] = messages.slice(-2);
      const isLastMessageUser = lastMessage?.actor === "user";
      const isLastMessageFirstMetabotReply =
        prevMessage?.actor !== "agent" && lastMessage?.actor === "agent";

      const shouldAutoScroll =
        isLastMessageUser || isLastMessageFirstMetabotReply;

      if (shouldAutoScroll) {
        const userMessages =
          scrollContainerEl.querySelectorAll<HTMLDivElement>(USER_MSG_SELECTOR);
        const lastUserMessage = _.last(userMessages);

        const distanceFromTop = lastUserMessage?.offsetTop ?? 0;
        const headerHeight =
          headerRef.current?.clientHeight ?? DEFAULT_HEADER_HEIGHT;

        scrollContainerEl.scrollTo({
          top: distanceFromTop - headerHeight,
          behavior: "smooth",
        });
      }
    },
    [messages, headerRef, messagesRef, isFirstMount],
  );
}
