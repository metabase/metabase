import { type RefObject, useCallback, useEffect, useRef } from "react";

function calculateFillerHeight(
  scrollContainerEl: HTMLElement,
  fillerEl: HTMLElement,
): number {
  const scrollContent = Array.from(
    scrollContainerEl.children?.[0]?.children ?? [],
  );
  const lastUserMessageIndex = scrollContent.findLastIndex(
    (el) => el.getAttribute("data-message-role") === "user",
  );
  const currentPromptEls = scrollContent.slice(lastUserMessageIndex);
  const validEls = currentPromptEls.filter((node) => node);
  const nonFillerElsHeight = validEls.reduce((sum, node) => {
    return node === fillerEl ? sum : sum + node.clientHeight;
  }, 0);

  // when the container is scrollable, we need to factor in the top padding as well
  const containerHeight = scrollContainerEl.clientHeight;
  const style = getComputedStyle(scrollContainerEl);
  const paddingAdjustment =
    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const contentHeight = containerHeight - paddingAdjustment;

  // subtract 1px to prevent a scrollbar appearing due to rounding issues
  return Math.max(0, Math.floor(contentHeight - nonFillerElsHeight - 1));
}

function resizeFillerArea(
  scrollContainerRef: RefObject<HTMLElement>,
  fillerRef: RefObject<HTMLElement>,
) {
  const scrollContainerEl = scrollContainerRef.current;
  const fillerEl = fillerRef.current;
  if (!scrollContainerEl || !fillerEl) {
    return;
  }

  const nextFillerHeight = calculateFillerHeight(scrollContainerEl, fillerEl);
  const nextFillerHeightPx = `${nextFillerHeight}px`;

  // prevent the DOM reflowing/repainting for updates that change nothing
  const currentFillerHeightPx = fillerEl.style.height;
  if (currentFillerHeightPx !== nextFillerHeightPx) {
    fillerEl.style.height = nextFillerHeightPx;
  }
}

export function useScrollManager(hasMessages: boolean) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const fillerRef = useRef<HTMLDivElement>(null);

  const scrollToBottomRafRef = useRef<number>();
  const resizeRafRef = useRef<number>();
  const scrollToPromptRafRef = useRef<number>();

  // clean animations on clean up if needed
  useEffect(function cancelAnimations() {
    return () => {
      if (scrollToBottomRafRef.current) {
        cancelAnimationFrame(scrollToBottomRafRef.current);
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      if (scrollToPromptRafRef.current) {
        cancelAnimationFrame(scrollToPromptRafRef.current);
      }
    };
  }, []);

  const scheduleFillerResize = useCallback(() => {
    // only schedule if nothing has been for this frame
    if (!resizeRafRef.current) {
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeFillerArea(scrollContainerRef, fillerRef);
        resizeRafRef.current = undefined;
      });
    }
  }, []);

  useEffect(
    function resizeFiller() {
      const scrollContainerEl = scrollContainerRef.current;
      const fillerEl = fillerRef.current;
      if (!hasMessages || !scrollContainerEl || !fillerEl) {
        return;
      }

      // resize filler + scroll to the absolute bottom on mount
      scheduleFillerResize();
      if (scrollContainerEl) {
        scrollToBottomRafRef.current = requestAnimationFrame(() => {
          // put in a RAF so it happens after filler resize
          scrollContainerEl.scrollTop = scrollContainerEl.scrollHeight;
          scrollToBottomRafRef.current = undefined;
        });
      }

      // react to content updates
      const mutationObserver = new MutationObserver((mutations) => {
        // mutations to the filler area will cause another execution of this observer
        // so filter out events related to this element to avoid an infinite loop
        const shouldResizeFillerArea = mutations.some(
          (m) => m.target !== fillerEl,
        );
        if (shouldResizeFillerArea) {
          scheduleFillerResize();
        }

        // check for new user messages and auto-scroll to them
        const hasNewUserMessage = mutations.some((mutation) => {
          return (
            mutation.type === "childList" &&
            mutation.addedNodes.length > 0 &&
            Array.from(mutation.addedNodes).some(
              (node) =>
                node instanceof Element &&
                node.getAttribute("data-message-role") === "user",
            )
          );
        });
        if (hasNewUserMessage) {
          const userMessages = scrollContainerEl.querySelectorAll<HTMLElement>(
            '[data-message-role="user"]',
          );
          const latestPrompt = userMessages[userMessages.length - 1];

          const promptOffsetTop = latestPrompt?.offsetTop ?? 0;
          const headerHeight = headerRef.current?.clientHeight ?? 64;
          const top = promptOffsetTop - headerHeight;

          // put in a RAF so it happens after filler resize
          scrollToPromptRafRef.current = requestAnimationFrame(() => {
            scrollContainerEl.scrollTo({ top, behavior: "smooth" });
            scrollToPromptRafRef.current = undefined;
          });
        }
      });
      mutationObserver.observe(scrollContainerEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // react to resize updates
      const resizeObserver = new ResizeObserver(scheduleFillerResize);
      resizeObserver.observe(scrollContainerEl);

      return () => {
        mutationObserver.disconnect();
        resizeObserver.disconnect();
      };
    },
    [hasMessages, scheduleFillerResize],
  );

  return {
    scrollContainerRef,
    headerRef,
    fillerRef,
  };
}
