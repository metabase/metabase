import { useEffect, useRef, useState } from "react";

import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

type Snapshot = Pick<
  Card,
  "dataset_query" | "display" | "visualization_settings"
> & { displayIsLocked: boolean };

function getSnapshot(question: Question): Snapshot {
  const card = question.card();
  return {
    dataset_query: card.dataset_query,
    display: card.display,
    visualization_settings: card.visualization_settings,
    displayIsLocked: question.displayIsLocked(),
  };
}

// settings sync after every run, so only the query and the shape count as a step
function getSnapshotKey(question: Question): string {
  const card = question.card();
  return JSON.stringify([card.dataset_query, card.display]);
}

function toQuestion(question: Question, snapshot: Snapshot): Question {
  return question
    .setCard({ ...question.card(), ...snapshot })
    .setDisplayIsLocked(snapshot.displayIsLocked);
}

export type ExploreHistory = {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
};

/**
 * Back and forward through the slices and cuts visited while exploring, so trying a cut is
 * always cheap to undo. Every change of the query or its shape is a step, wherever it came from.
 */
export function useExploreHistory(
  question: Question,
  onRestore: (question: Question) => void,
): ExploreHistory {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const current = useRef({
    key: getSnapshotKey(question),
    snapshot: getSnapshot(question),
  });
  const isRestoring = useRef(false);
  const [, setVersion] = useState(0);

  const key = getSnapshotKey(question);
  useEffect(() => {
    if (key === current.current.key) {
      current.current.snapshot = getSnapshot(question);
      return;
    }
    if (!isRestoring.current) {
      past.current.push(current.current.snapshot);
      future.current = [];
    }
    isRestoring.current = false;
    current.current = { key, snapshot: getSnapshot(question) };
    setVersion((version) => version + 1);
  }, [key, question]);

  const restore = (from: Snapshot[], to: Snapshot[]) => {
    const snapshot = from.pop();
    if (snapshot == null) {
      return;
    }
    to.push(current.current.snapshot);
    isRestoring.current = true;
    onRestore(toQuestion(question, snapshot));
  };

  return {
    canGoBack: past.current.length > 0,
    canGoForward: future.current.length > 0,
    goBack: () => restore(past.current, future.current),
    goForward: () => restore(future.current, past.current),
  };
}
