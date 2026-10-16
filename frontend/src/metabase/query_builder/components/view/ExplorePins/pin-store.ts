import { useSyncExternalStore } from "react";
import _ from "underscore";

import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

/** A view someone pinned while exploring, to put on a dashboard later. */
export type ExplorePin = {
  id: string;
  name: string;
  dataset_query: Card["dataset_query"];
  display: Card["display"];
  visualization_settings: Card["visualization_settings"];
};

// pins stay for the session, across questions and tables, so a dashboard can mix them
let pins: readonly ExplorePin[] = [];
const listeners = new Set<() => void>();

function setPins(nextPins: readonly ExplorePin[]) {
  pins = nextPins;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExplorePins(): readonly ExplorePin[] {
  return useSyncExternalStore(subscribe, () => pins);
}

export function getPinFromQuestion(
  question: Question,
  name: string,
): ExplorePin {
  const card = question.card();
  return {
    id: _.uniqueId("explore-pin-"),
    name,
    dataset_query: card.dataset_query,
    display: card.display,
    visualization_settings: card.visualization_settings,
  };
}

export function addPin(pin: ExplorePin) {
  setPins([...pins, pin]);
}

export function removePin(id: string) {
  setPins(pins.filter((pin) => pin.id !== id));
}

export function clearPins() {
  setPins([]);
}
