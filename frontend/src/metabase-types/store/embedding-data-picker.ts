export interface EmbeddingDataPickerState {
  entityTypes: EmbeddingEntityType[];
}

/**
 * `question` only works on multi-stage data picker, not the simple data picker.
 * The reason being that we want to streamline user experience for simple embedding
 * use cases, but `question` was later added to support users who are used to
 * selecting Saved questions in interactive embedding, so this is special case.
 */
export type EmbeddingEntityType = "model" | "table" | "question";

export type EmbeddingDataPicker = "staged" | "flat";
