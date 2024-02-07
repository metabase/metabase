import type { SetupStep } from "./types";

export const LOCALE_TIMEOUT = 300;

export const WELCOME_STEP: SetupStep = "welcome";
export const LANGUAGE_STEP: SetupStep = "language";
export const USER_STEP: SetupStep = "user_info";
export const USAGE_STEP: SetupStep = "usage_question";
export const DATABASE_STEP: SetupStep = "db_connection";
export const PREFERENCES_STEP: SetupStep = "data_usage";
export const COMPLETED_STEP: SetupStep = "completed";

export const STEPS: Record<SetupStep, SetupStep> = {
  [WELCOME_STEP]: "welcome",
  [LANGUAGE_STEP]: "language",
  [USER_STEP]: "user_info",
  [USAGE_STEP]: "usage_question",
  [DATABASE_STEP]: "db_connection",
  [PREFERENCES_STEP]: "data_usage",
  [COMPLETED_STEP]: "completed",
};

export const SUBSCRIBE_URL =
  "https://metabase.us10.list-manage.com/subscribe/post?u=869fec0e4689e8fd1db91e795&id=b9664113a8";
export const SUBSCRIBE_TOKEN = "b_869fec0e4689e8fd1db91e795_b9664113a8";
