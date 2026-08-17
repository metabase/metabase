import { useEffect, useRef, useState } from "react";

/**
 * Throttles a growing streamed string to one update per animation frame.
 * Returns the exact source during the same render that streaming ends.
 */
export const useCoalescedSource = (source: string, isStreaming: boolean) => {
  const [frameValue, setFrameValue] = useState(source);
  const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming);
  const latest = useRef(source);
  const frameId = useRef<number | null>(null);

  if (prevIsStreaming !== isStreaming) {
    setPrevIsStreaming(isStreaming);
    setFrameValue(source);
  }

  useEffect(() => {
    latest.current = source;

    if (!isStreaming || source === frameValue || frameId.current !== null) {
      return;
    }

    frameId.current = requestAnimationFrame(() => {
      frameId.current = null;
      setFrameValue(latest.current);
    });
  }, [source, isStreaming, frameValue]);

  useEffect(() => {
    if (!isStreaming && frameId.current !== null) {
      cancelAnimationFrame(frameId.current);
      frameId.current = null;
    }
  }, [isStreaming]);

  useEffect(
    () => () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current);
      }
    },
    [],
  );

  return isStreaming ? frameValue : source;
};
