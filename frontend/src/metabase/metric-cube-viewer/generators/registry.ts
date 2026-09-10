// The only place that knows which variants exist.
import { everyCombinationGenerator } from "./every-combination";
import { scoreAndPickGenerator } from "./score-and-pick";
import type { CardGenerator, CardGeneratorId } from "./types";

const DEFAULT_CARD_GENERATOR: CardGenerator = scoreAndPickGenerator;

export const CARD_GENERATORS: readonly CardGenerator[] = [
  scoreAndPickGenerator,
  everyCombinationGenerator,
];

export const DEFAULT_CARD_GENERATOR_ID: CardGeneratorId =
  DEFAULT_CARD_GENERATOR.id;

/** Falls back to the default generator for unknown ids. */
export function getCardGenerator(
  id: CardGeneratorId | null | undefined,
): CardGenerator {
  return (
    CARD_GENERATORS.find((generator) => generator.id === id) ??
    DEFAULT_CARD_GENERATOR
  );
}
