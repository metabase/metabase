import { t } from "ttag";

export const REQUEST_STATUSES = {
  open: "open",
  resolved: "resolved",
  dismissed: "dismissed",
};

export const REQUEST_TYPES = {
  verification_request: "verification_request",
  something_wrong: "something_wrong",
  confused: "confused",
};

export const REVIEW_STATUSES = {
  verified: "verified",
  misleading: "misleading",
  confusing: "confusing",
  not_misleading: "not_misleading",
  pending: "pending",
};

export const ACTIONS = {
  verified: {
    type: "verified",
    icon: "verified",
    color: "brand",
  },
  verification_request: {
    type: "verified",
    icon: "verified",
    color: "brand",
  },
  misleading: {
    type: "misleading",
    icon: "warning_colorized",
    color: "accent5",
  },
  something_wrong: {
    type: "misleading",
    icon: "warning_colorized",
    color: "accent5",
  },
  confusing: {
    type: "confusing",
    icon: "clarification",
    color: "accent2",
  },
  confused: {
    type: "confusing",
    icon: "clarification",
    color: "accent2",
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
    action: t`user action`,
    verification_request: {
      action: t`Verify this`,
      actionCreationDescription: t`verified actionCreationDescription`,
      actionCreationLabel: t`verified actionCreationLabel`,
      actionCreationButton: t`verified actionCreationButton`,
    },
    something_wrong: {
      action: t`Something's wrong`,
      actionCreationDescription: t` misleading actionCreationDescription`,
      actionCreationLabel: t`misleading actionCreationLabel`,
      actionCreationButton: t`misleading actionCreationButton`,
    },
    confused: {
      action: t`I'm confused`,
      actionCreationDescription: t`confusing actionCreationDescription`,
      actionCreationLabel: t`confusing actionCreationLabel`,
      actionCreationButton: t`confusing actionCreationButton`,
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
      actionCreationDescription:
        "You can let the requester know why you're dismissing their request.",
      actionCreationLabel: "Add a note if you'd like",
      actionCreationButton: "Dismiss request",
    },
  },
};
