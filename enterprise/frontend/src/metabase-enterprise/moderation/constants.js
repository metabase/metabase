import { t } from "ttag";

export const ACTIONS = {
  verified: {
    type: "verified",
    icon: "verified",
    color: "brand",
  },
  misleading: {
    type: "misleading",
    icon: "warning_colorized",
    color: "accent5",
  },
  confusing: {
    type: "confusing",
    icon: "clarification",
    color: "accent2",
    moderationReviewStatus: "confusing",
  },
  dismiss: {
    type: "dismiss",
    icon: "close",
    color: "medium",
  },
};

export const MODERATION_TEXT = {
  cancel: t`Cancel`,
  actionCreationPlaceholder: t`You can add details if you'd like`,
  user: {
    verified: {
      action: t`Verify this`,
    },
    misleading: {
      action: t`Something's wrong`,
    },
    confusing: {
      action: t`I'm confused`,
    },
  },
  moderator: {
    action: t`Moderate`,
    verified: {
      action: t`Verify this`,
      actionCreationDescription: t`Everything look correct here? Verify this question to let others know.`,
      actionCreationLabel: t`Add a note if you’d like`,
      actionCreationButton: t`Verify`,
    },
    misleading: {
      action: t`This is misleading`,
      actionCreationDescription: t`Add a warning badge to this question and notify its editors that something’s off here.`,
      actionCreationLabel: t`Explain what’s wrong or misleading`,
      actionCreationButton: t`Flag as misleading`,
    },
    confusing: {
      action: t`This is confusing`,
      actionCreationDescription: "need text 1",
      actionCreationLabel: "need text 2",
      actionCreationButton: "need text 3",
    },
    dismiss: {
      action: t`Dismiss`,
    },
  },
};
