import { RefObject, useCallback, useRef, useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { useElementSize } from "@mantine/hooks";

const USER_MSG_SELECTOR = `[data-message-role="user"]`;
const DEFAULT_HEADER_HEIGHT = 64;

const getHeaderHeight = (headerRef: RefObject<HTMLDivElement>) => {
  return headerRef.current?.clientHeight ?? DEFAULT_HEADER_HEIGHT;
};

const getPromptOffsetTop = (containerEl: HTMLDivElement) => {
  const userMessages =
    containerEl.querySelectorAll<HTMLDivElement>(USER_MSG_SELECTOR);
  const lastMessage = _.last(userMessages);
  return lastMessage?.offsetTop ?? 0;
};

const getPromptAndFollowUpNodesHeight = (containerEl: HTMLDivElement) => {
  const userMessages =
    containerEl.querySelectorAll<HTMLDivElement>(USER_MSG_SELECTOR);
  const lastMessage = _.last(userMessages);

  const nodes = [...containerEl.children[0].children];
  const afterPromptNodesStart = nodes.findLastIndex(
    (node) => node !== lastMessage,
  );
  const afterPromptNodes = nodes.slice(afterPromptNodesStart);
  const afterPromptNodesHeight = afterPromptNodes.reduce((sum, node) => {
    if (node.getAttribute("id") === "metabot-message-filler") {
      return sum;
    }
    return node.clientHeight + sum;
  }, 0);

  return (lastMessage?.clientHeight ?? 0) + afterPromptNodesHeight;
};

export function useScrollManager() {
  const headerRef = useRef<HTMLDivElement>(null);
  const messagesEl = useElementSize<HTMLDivElement>();
  const [fillerHeight, setFillerHeight] = useState(0);

  // scroll on mount - useful if there's existing conversation
  // history when the user opens the metabot sidebar
  useMount(function handleScrollOnMount() {
    const scrollContainer = messagesEl.ref.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });

  const scrollToLatestUserMessage = useCallback(() => {
    const scrollContainer = messagesEl.ref.current;
    if (scrollContainer) {
      setTimeout(() => {
        const num = getPromptAndFollowUpNodesHeight(scrollContainer);
        const fillerHeight = messagesEl.height - num;
        console.log({ messageHeight: messagesEl.height, num, fillerHeight });
        setFillerHeight(fillerHeight);

        setTimeout(() => {
          const promptOffsetTop = getPromptOffsetTop(scrollContainer);
          const headerHeight = getHeaderHeight(headerRef);
          const top = promptOffsetTop - headerHeight;
          scrollContainer.scrollTo({ top, behavior: "smooth" });
        }, 100);
      }, 100);
    }
  }, []);

  return {
    headerRef,
    messagesRef: messagesEl.ref,
    fillerHeight,
    scrollToLatestUserMessage,
  };
}
