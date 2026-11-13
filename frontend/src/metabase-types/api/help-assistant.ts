export type HelpAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HelpAssistantSource = {
  title: string;
  url: string;
};

export type HelpAssistantFeedback = {
  positive: boolean;
  comment?: string | null;
};

/** What a `check` step looked at on this instance. */
export type HelpAssistantCheck =
  | "logs"
  | "databases"
  | "email_sso"
  | "subscriptions";

/**
 * One thing the assistant did to get an answer: load a skill, search the docs,
 * read a page, check this instance, or run out of steps. `earlier` marks a
 * skill it loaded earlier in the conversation. For a `check` step, `label` is
 * the keyword or database it checked, or empty.
 */
export type HelpAssistantStep = {
  type: "skill" | "search" | "read" | "check" | "limit";
  label: string;
  skill_id?: string;
  url?: string;
  check?: HelpAssistantCheck;
  earlier?: boolean;
};

export type HelpAssistantChatEntry = HelpAssistantMessage & {
  sources?: HelpAssistantSource[];
  steps?: HelpAssistantStep[];
  feedback?: HelpAssistantFeedback;
};

export type HelpAssistantConversationId = string;

/** A saved conversation, stored in the `help_assistant` user key-value namespace. */
export type HelpAssistantConversation = {
  title: string;
  updated_at: string;
  messages: HelpAssistantChatEntry[];
};

export type HelpAssistantChatRequest = {
  messages: HelpAssistantMessage[];
  diagnostic_info?: string;
  /** Ids of the skills loaded earlier in the conversation. */
  loaded_skills?: string[];
  /** Lets the assistant check this instance's logs, databases and email and sign-in settings. */
  instance_access?: boolean;
};

export type HelpAssistantChatResponse = {
  reply: string;
  sources: HelpAssistantSource[];
  steps: HelpAssistantStep[];
};

/**
 * One Server-Sent Event from `POST /api/help-assistant/chat/stream`: each step
 * as it happens, then the answer or an error.
 */
export type HelpAssistantStreamEvent =
  | { type: "step"; step: HelpAssistantStep }
  | ({ type: "answer" } & HelpAssistantChatResponse)
  | { type: "error"; message: string; status_code: number };

/** Optional features, set on the server. */
export type HelpAssistantSettings = {
  /** Whether admins can flag answers for review (`MB_HELP_ASSISTANT_FLAGS_DIR` is set). */
  flags_enabled: boolean;
};

/** A chat saved for review. It ends with the flagged answer. */
export type HelpAssistantFlagRequest = {
  note: string;
  messages: (HelpAssistantMessage & { steps?: HelpAssistantStep[] })[];
};

export type HelpAssistantFlagResponse = {
  file: string;
};

export type HelpAssistantFeedbackRequest = HelpAssistantFeedback & {
  question: string;
  answer: string;
  sources?: HelpAssistantSource[];
};
