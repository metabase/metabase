import { RefObject, useCallback, useRef } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { useElementSize } from "@mantine/hooks";

const USER_MSG_SELECTOR = `[data-message-role="user"]`;
const DEFAULT_HEADER_HEIGHT = 64;

const getHeaderHeight = (headerRef: RefObject<HTMLDivElement>) => {
  return headerRef.current?.clientHeight ?? DEFAULT_HEADER_HEIGHT;
};

const getPromptOffsetTop = (el: HTMLDivElement) => {
  const userMessages = el.querySelectorAll<HTMLDivElement>(USER_MSG_SELECTOR);
  const lastMessage = _.last(userMessages);
  return lastMessage?.offsetTop ?? 0;
};

export function useScrollManager() {
  const headerRef = useRef<HTMLDivElement>(null);
  const messagesEl = useElementSize<HTMLDivElement>();

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
      // TODO: remove and pass the scrollToLatestUserMessage
      // fn as a callback to submitInput

      setTimeout(() => {
        const promptOffsetTop = getPromptOffsetTop(scrollContainer);
        const headerHeight = getHeaderHeight(headerRef);

        scrollContainer.scrollTo({
          top: promptOffsetTop - headerHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, []);

  return {
    headerRef,
    messagesRef: messagesEl.ref,
    messagesHeight: messagesEl.height,
    scrollToLatestUserMessage,
  };
}

// // TODO: need to do a check for has scrolled for message id
// // that way we only do it once if the last message is the currently scrolled to item

// // auto-scroll to the latest user submitted message when
// // - user submits a message
// // - metabot responds for the first time (it can add multiple messages, we only care about the first)
// const isLastMessageUser = lastMessage?.role === "user";

// const shouldAutoScroll = isLastMessageUser;

// if (shouldAutoScroll) {
//   const userMessages =
//     scrollContainerEl.querySelectorAll<HTMLDivElement>(USER_MSG_SELECTOR);
//   const lastUserMessage = _.last(userMessages);

//   const distanceFromTop = lastUserMessage?.offsetTop ?? 0;
//   const headerHeight =
//     headerRef.current?.clientHeight ?? DEFAULT_HEADER_HEIGHT;

//   scrollContainerEl.scrollTo({
//     top: distanceFromTop - headerHeight,
//     behavior: "smooth",
//   });
