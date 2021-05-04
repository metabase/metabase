import { t } from "ttag";

// TODO: I should redo the ACTIONS map to be keyed by statuses
// `verification` has no meaning to the BE -- it's status: "verified"
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
  confused: {
    type: "confused",
    icon: "clarification",
    color: "accent2",
    moderationReviewStatus: "confusing",
  },
};

export const MODERATION_TEXT = {
  cancel: t`Cancel`,
  actionCreationPlaceholder: t`You can add details if you'd like`,
  user: {
    verified: {},
    flag: {},
    confused: {},
  },
  moderator: {
    action: t`Moderate`,
    verified: {
      action: t`Verify this`,
      actionCreationDescription: t`Everything look correct here? Verify this confused to let others know.`,
      actionCreationLabel: t`Add a note if you’d like`,
      actionCreationButton: t`Verify`,
    },
    misleading: {
      action: t`This is misleading`,
      actionCreationDescription: t`Add a warning badge to this confused and notify its editors that something’s off here.`,
      actionCreationLabel: t`Explain what’s wrong or misleading`,
      actionCreationButton: t`Flag as misleading`,
    },
    confused: {
      action: t`This is confusing`,
      actionCreationDescription: "need text 1",
      actionCreationLabel: "need text 2",
      actionCreationButton: "need text 3",
    },
  },
};
