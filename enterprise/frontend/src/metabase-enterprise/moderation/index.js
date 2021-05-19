import { getIn } from "icepick";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import {
  ACTIONS,
  REQUEST_TYPES,
  REVIEW_STATUSES,
} from "metabase-enterprise/moderation/constants";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import CreateModerationIssuePanel from "metabase-enterprise/moderation/components/CreateModerationIssuePanel";
import { OpenModerationIssuesButton } from "metabase-enterprise/moderation/components/OpenModerationIssuesButton";
import OpenModerationIssuesPanel from "metabase-enterprise/moderation/components/OpenModerationIssuesPanel";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  ModerationIssueActionMenu,
  CreateModerationIssuePanel,
  OpenModerationIssuesButton,
  OpenModerationIssuesPanel,
});

Object.assign(PLUGIN_MODERATION_SERVICE, {
  getStatusIconForReview,
  getColorForReview,
  getOpenRequests,
  isRequestDismissal,
});

// todo -- update this to pass in the `issue` and filter out the action with the same "type"
// ("type" may now mean "status"...)
// because the primary action of the button will be the given issue type (see updated mocks).
// second TODO -- I'm not sure how to reconcile the fact that "dismissed" is not really a review TYPE
export function getModerationReviewActionTypes(moderationRequest) {
  return [
    REVIEW_STATUSES.verified,
    REVIEW_STATUSES.misleading,
    REVIEW_STATUSES.confusing,
    ...(moderationRequest ? ["dismiss"] : []),
  ];
}

export function getModerationRequestActionTypes() {
  return [
    REQUEST_TYPES.verification_request,
    REQUEST_TYPES.something_wrong,
    REQUEST_TYPES.confused,
  ];
}

export function getStatusIconForReview(review) {
  return getModerationStatusIcon(review && review.status);
}

export function getColorForReview(review) {
  return getColor(review && review.status);
}

export function getModerationStatusIcon(type) {
  return getIn(ACTIONS, [type, "icon"]);
}

export function getColor(type) {
  return getIn(ACTIONS, [type, "color"]);
}

export function getOpenRequests(question) {
  const moderationRequests = question.getModerationRequests();
  return moderationRequests.filter(request => {
    return request.status === "open";
  });

  // return [
  //   {
  //     id: 1,
  //     type: "verified",
  //     title: "User 2",
  //     text: "1\n2\n3\n4\n5\n6",
  //     timestamp: Date.now(),
  //     comments: [],
  //   },
  //   {
  //     id: 2,
  //     type: "misleading",
  //     title: "User 2",
  //     text:
  //       "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sit amet sagittis dui. Morbi in odio laoreet, finibus erat vitae, sagittis dui. Ut at mauris eget ligula volutpat pellentesque. Integer non faucibus urna. Maecenas faucibus ornare gravida. Aliquam orci tortor, ullamcorper et vehicula accumsan, malesuada in ipsum. Nullam auctor, justo et mattis fringilla, enim ipsum aliquet nunc, quis posuere odio erat in nulla. Suspendisse elementum, est et rutrum volutpat, purus mi placerat odio, sit amet blandit nulla diam at lectus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Ut ultricies placerat mollis.",
  //     timestamp: Date.now(),
  //     comments: [
  //       {
  //         id: 1,
  //         title: "Moderator",
  //         isModerator: true,
  //         text: "Nulla nec est eu est condimentum facilisis sit amet et ex.",
  //         timestamp: Date.now(),
  //       },
  //     ],
  //   },
  // ];

  // closed_by_id: null
  // created_at: "2021-05-17T14:38:38.87-07:00"
  // id: 1
  // moderated_item_id: 1
  // moderated_item_type: "card"
  // requester_id: 1
  // status: "open"
  // text: "asdasdasdasdsadsd"
  // type: "verification_request"
  // updated_at: "2021-05-17T14:38:38.87-07:00"
}

export function isRequestDismissal(type) {
  return type === "dismiss";
}
