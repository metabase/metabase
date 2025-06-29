import { useEffect } from "react";
import _ from "underscore";

let observeCount = 0;
let maxObserveCount = 10 * 1000;

const getScrollContainerEl = () =>
  document.getElementById("metabot-chat-content");

const isFillerElement = (node: Node) => {
  return (
    node instanceof Element &&
    node.getAttribute("id") === "metabot-message-filler"
  );
};

const DEFAULT_HEADER_HEIGHT = 64;
const getHeaderHeight = () => {
  return (
    document.getElementById("metabot-chat-header")?.clientHeight ??
    DEFAULT_HEADER_HEIGHT
  );
};

const USER_MSG_SELECTOR = `[data-message-role="user"]`;
const getPromptOffsetTop = (containerEl: HTMLElement) => {
  const userMessages =
    containerEl.querySelectorAll<HTMLElement>(USER_MSG_SELECTOR);
  const lastMessage = _.last(userMessages);
  return lastMessage?.offsetTop ?? 0;
};

function resizeFillerArea(scrollContainerEl: HTMLElement) {
  console.log({ observeCount });
  if (observeCount > maxObserveCount) {
    return;
  }

  const fillerElement = document.getElementById("metabot-message-filler");

  if (!fillerElement) {
    return;
  }

  const scrollContent = Array.from(scrollContainerEl.children[0]?.children);
  const lastUserMessageIndex = scrollContent.findLastIndex(
    (node) => node.getAttribute("data-message-role") === "user",
  );
  const currentPromptNodes = scrollContent.slice(lastUserMessageIndex);
  const validNodes = currentPromptNodes.filter((node) => node);
  const validNodeHeights = validNodes.reduce((sum, node) => {
    return isFillerElement(node) ? sum : sum + node.clientHeight;
  }, 0);

  const isScrollable =
    scrollContainerEl.scrollHeight > scrollContainerEl.clientHeight;
  const paddingAdjustment = isScrollable ? 40 : 24;
  const containerHeight = scrollContainerEl.clientHeight;
  const fillerHeight = Math.max(
    0,
    containerHeight - validNodeHeights - paddingAdjustment,
  );
  fillerElement.style.height = `${fillerHeight}px`;

  observeCount++;
}

// TODO: handle auto-scrolling portion
// TODO: rename
// TODO: refactor to make it more testable
// TODO: can using refs make this cleaner?
export function useScrollManager() {
  // getPromptOffsetTop

  useEffect(function resizeFiller() {
    const scrollContainerEl = getScrollContainerEl();
    if (!scrollContainerEl) {
      return;
    }

    // resize filler + scroll to the absolute bottom on mount
    // - TODO: could I remove this? other ai's don't do this byt the mutation
    // observer is probs going to be too reactive to elements changing? so i want
    // to be careful about that... maybe where the isDoingScience part is handy?
    resizeFillerArea(scrollContainerEl);
    if (scrollContainerEl) {
      scrollContainerEl.scrollTop = scrollContainerEl.scrollHeight;
    }

    // react to text updates
    const mutationObserver = new MutationObserver((mutations) => {
      // ignore events caused from the resize event
      const shoudldResize = mutations.some((m) => !isFillerElement(m.target));
      if (shoudldResize) {
        resizeFillerArea(scrollContainerEl);
      }
    });

    mutationObserver.observe(scrollContainerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // react to resize updates
    const resizeObserver = new ResizeObserver(() => {
      resizeFillerArea(scrollContainerEl);
    });
    resizeObserver.observe(scrollContainerEl);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  // TODO: find a way to schedule this auto-scroll to it happens AFTER
  // the next filler resize event OR if I can detect a user message node
  // was mounted to the dom that might be better...
  const scheduleAutoScroll = () => {
    // TODO: figure out a better way to manage timing
    setTimeout(() => {
      debugger;
      const scrollContainerEl = getScrollContainerEl();
      if (!scrollContainerEl) {
        return;
      }
      const promptOffsetTop = getPromptOffsetTop(scrollContainerEl);
      const headerHeight = getHeaderHeight();
      const top = promptOffsetTop - headerHeight;
      scrollContainerEl.scrollTo({ top, behavior: "smooth" });
    }, 50);
  };

  return { scheduleAutoScroll };
}
