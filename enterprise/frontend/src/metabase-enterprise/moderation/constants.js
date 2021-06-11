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
    type: "verification_request",
    icon: "verified",
    color: "brand",
  },
  misleading: {
    type: "misleading",
    icon: "warning_colorized",
    color: "accent5",
  },
  something_wrong: {
    type: "something_wrong",
    icon: "warning_colorized",
    color: "accent5",
  },
  confusing: {
    type: "confusing",
    icon: "clarification",
    color: "accent2",
  },
  confused: {
    type: "confused",
    icon: "clarification",
    color: "accent2",
  },
  pending: {
    type: "pending",
    icon: "arrow_left",
    color: "medium",
  },
  dismiss: {
    type: "dismiss",
    icon: "close",
    color: "medium",
  },
};

export const MODERATION_TEXT = {
  requestStatuses: {
    open: t`Open`,
    resolved: t`Resolved`,
    dismissed: t`Dismissed`,
  },
  user: {
    action: t`Get help`,
    actionHelp: t`How can a moderator help you?`,
  },
  moderator: {
    action: t`Moderate`,
  },
  verification_request: {
    action: t`Request verification`,
    pillLabel: t`Please verify`,
    actionCreationDescription: t`Ask a moderator to take a look at this question and make sure everything’s all correct. `,
    actionCreationLabel: t`Add a note`,
    actionCreationPlaceholder: t`Anything the reviewer should know?`,
    actionCreationButton: t`Request verification`,
    creationEvent: t`requested verification`,
    creationNotification: t`Requested verification`,
  },
  something_wrong: {
    action: t`Something looks wrong`,
    pillLabel: t`Something looks wrong`,
    actionCreationDescription: t`Spotted something that doesn’t look correct, or could be misleading? Let a moderator know.`,
    actionCreationLabel: t`Describe and explain what looks wrong`,
    actionCreationPlaceholder: t`Try to be specific`,
    actionCreationButton: t`Report issue`,
    creationEvent: t`thinks something looks wrong`,
    creationNotification: t`Issue reported`,
  },
  confused: {
    action: t`I'm confused`,
    pillLabel: t`I'm confused`,
    actionCreationDescription: t`Do you need clarification or an explanation about this? Let a moderator know.`,
    actionCreationLabel: t`Describe what it is you’re confused about`,
    actionCreationPlaceholder: t`Try to be specific`,
    actionCreationButton: t`Request clarification`,
    creationEvent: t`is confused about something`,
    creationNotification: t`Clarification requested`,
  },
  verified: {
    action: t`Verify this`,
    actionCreationDescription: t`Everything look correct here? Verify this question to let others know.`,
    actionCreationLabel: t`Add a note if you’d like`,
    actionCreationPlaceholder: t`You can add details if you’d like`,
    actionCreationButton: t`Verify`,
    creationEvent: t`verified this`,
    creationNotification: t`You verified this question`,
  },
  misleading: {
    action: t`This is misleading`,
    actionCreationDescription: t`Add a warning badge to this question and notify its editors that something’s off here.`,
    actionCreationLabel: t`Explain what’s wrong or misleading`,
    actionCreationPlaceholder: t`Try to be specific`,
    actionCreationButton: t`Flag as misleading`,
    creationEvent: t`flagged this`,
    creationNotification: t`Flagged as misleading`,
  },
  confusing: {
    action: t`This is confusing`,
    actionCreationDescription: t`Add a warning badge to this question and notify its editors that something’s off here.`,
    actionCreationLabel: t`Explain what’s wrong or misleading`,
    actionCreationPlaceholder: t`Try to be specific`,
    actionCreationButton: t`Flag as misleading`,
    creationEvent: t`marked this as confusing`,
    creationNotification: t`Flagged as misleading`,
  },
  not_misleading: {},
  pending: {
    creationEvent: t`removed the previous review`,
    action: t`Remove Review`,
    actionCreationDescription: t`actionCreationDescription`,
    actionCreationLabel: t`actionCreationLabel`,
    actionCreationPlaceholder: t`actionCreationPlaceholder`,
    actionCreationButton: t`actionCreationButton`,
  },
  dismiss: {
    action: t`Dismiss`,
    actionCreationDescription: t`You can let the requester know why you're dismissing their request.`,
    actionCreationLabel: t`Add a note if you'd like`,
    actionCreationPlaceholder: t`Explain why you’re dismissing the request`,
    actionCreationButton: t`Dismiss request`,
  },
};

export const USER_TYPES = {
  user: "user",
  moderator: "moderator",
};
