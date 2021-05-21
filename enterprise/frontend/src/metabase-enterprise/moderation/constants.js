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
  pending: {
    type: "pending",
    icon: "arrow_left",
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
      creationEvent: t`requested verification`,
    },
    something_wrong: {
      action: t`Something's wrong`,
      actionCreationDescription: t` misleading actionCreationDescription`,
      actionCreationLabel: t`misleading actionCreationLabel`,
      actionCreationButton: t`misleading actionCreationButton`,
      creationEvent: t`thinks something looks wrong`,
    },
    confused: {
      action: t`I'm confused`,
      actionCreationDescription: t`confusing actionCreationDescription`,
      actionCreationLabel: t`confusing actionCreationLabel`,
      actionCreationButton: t`confusing actionCreationButton`,
      creationEvent: t`is confused about something`,
    },
  },
  moderator: {
    action: t`Moderate`,
    dismissAction: t`dismissed`,
    requestActions: {
      resolved: t`resolved`,
      dismissed: t`dismissed`,
    },
    verified: {
      action: t`Verify this`,
      actionCreationDescription: t`Everything look correct here? Verify this question to let others know.`,
      actionCreationLabel: t`Add a note if you’d like`,
      actionCreationButton: t`Verify`,
      creationEvent: t`verified this`,
    },
    misleading: {
      action: t`This is misleading`,
      actionCreationDescription: t`Add a warning badge to this question and notify its editors that something’s off here.`,
      actionCreationLabel: t`Explain what’s wrong or misleading`,
      actionCreationButton: t`Flag as misleading`,
      creationEvent: t`flagged this`,
    },
    confusing: {
      action: t`This is confusing`,
      actionCreationDescription: t`need text 1`,
      actionCreationLabel: t`need text 2`,
      actionCreationButton: t`need text 3`,
      creationEvent: t`marked this as confusing`,
    },
    not_misleading: {},
    pending: {
      creationEvent: t`removed the previous review`,
    },
    dismiss: {
      action: t`Dismiss`,
      actionCreationDescription: t`You can let the requester know why you're dismissing their request.`,
      actionCreationLabel: t`Add a note if you'd like`,
      actionCreationButton: t`Dismiss request`,
    },
  },
};
