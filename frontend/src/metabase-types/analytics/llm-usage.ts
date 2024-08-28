export type LlmUsageEvent = {
  id: string;
  object: string;
  created: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  system_fingerprint: string;
};
