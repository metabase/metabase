import { t } from "ttag";

export const MODERATION_ACTIONS = {
  verification: {
    type: "verification",
    icon: "verified",
    color: "brand",
  },
  flag: {
    type: "flag",
    icon: "warning_colorized",
    color: "accent5",
  },
  question: {
    type: "question",
    icon: "clarification",
    color: "accent2",
  },
};

export const MODERATION_TEXT = {
  user: {},
  moderator: {
    verification: {
      action: t`Verify this`,
    },
    flag: {
      action: t`This is misleading`,
    },
    question: {
      action: t`This is confusing`,
    },
  },
};

export function getModerationActionsList() {
  return [
    MODERATION_ACTIONS.verification,
    MODERATION_ACTIONS.flag,
    MODERATION_ACTIONS.question,
  ];
}

export function getModerationStatusIcon(type) {
  const { icon } = MODERATION_ACTIONS[type] || {};
  return icon;
}
