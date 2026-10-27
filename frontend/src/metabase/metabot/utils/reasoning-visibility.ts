import { useEffect } from "react";

// A count, not a set. Two views of one conversation can show its reasoning at
// once. The cleanup of one view must not clear the other.
const visibleStepCounts = new Map<string, number>();

/**
 * Returns true while at least one open, active reasoning step of the
 * conversation is on the screen.
 */
export function isReasoningVisible(conversationId: string): boolean {
  return (visibleStepCounts.get(conversationId) ?? 0) > 0;
}

function addVisibleStep(conversationId: string) {
  visibleStepCounts.set(
    conversationId,
    (visibleStepCounts.get(conversationId) ?? 0) + 1,
  );
}

function removeVisibleStep(conversationId: string) {
  const count = (visibleStepCounts.get(conversationId) ?? 0) - 1;
  if (count > 0) {
    visibleStepCounts.set(conversationId, count);
  } else {
    visibleStepCounts.delete(conversationId);
  }
}

/**
 * Marks the reasoning of the conversation as visible while `visible` is true
 * and the calling component is mounted.
 */
export function useReasoningVisibility(
  conversationId: string,
  visible: boolean,
) {
  useEffect(() => {
    if (!visible) {
      return;
    }
    addVisibleStep(conversationId);
    return () => removeVisibleStep(conversationId);
  }, [conversationId, visible]);
}
