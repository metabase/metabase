import { getIn } from "icepick";
import {
  PLUGIN_MODERATION_COMPONENTS,
  PLUGIN_MODERATION_SERVICE,
} from "metabase/plugins";
import { ACTIONS } from "metabase-enterprise/moderation/constants";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import CreateModerationIssuePanel from "metabase-enterprise/moderation/components/CreateModerationIssuePanel";
import { OpenModerationIssuesButton } from "metabase-enterprise/moderation/components/OpenModerationIssuesButton";
import { OpenModerationIssuesPanel } from "metabase-enterprise/moderation/components/OpenModerationIssuesPanel";

Object.assign(PLUGIN_MODERATION_COMPONENTS, {
  ModerationIssueActionMenu,
  CreateModerationIssuePanel,
  OpenModerationIssuesButton,
  OpenModerationIssuesPanel,
});

Object.assign(PLUGIN_MODERATION_SERVICE, {
  getStatusIconForReview,
  getColorForReview,
});

export function getModerationIssueTypes() {
  return ["verified", "misleading", "confusing"];
}

export function getModerationRequestActionTypes() {
  return [...getModerationIssueTypes(), "dismiss"];
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

export function getOpenIssues() {
  return [
    {
      id: 1,
      type: "verified",
      title: "User 2",
      text: "1\n2\n3\n4\n5\n6",
      timestamp: Date.now(),
      comments: [],
    },
    {
      id: 2,
      type: "misleading",
      title: "User 2",
      text:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sit amet sagittis dui. Morbi in odio laoreet, finibus erat vitae, sagittis dui. Ut at mauris eget ligula volutpat pellentesque. Integer non faucibus urna. Maecenas faucibus ornare gravida. Aliquam orci tortor, ullamcorper et vehicula accumsan, malesuada in ipsum. Nullam auctor, justo et mattis fringilla, enim ipsum aliquet nunc, quis posuere odio erat in nulla. Suspendisse elementum, est et rutrum volutpat, purus mi placerat odio, sit amet blandit nulla diam at lectus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Ut ultricies placerat mollis.",
      timestamp: Date.now(),
      comments: [
        {
          id: 1,
          title: "Moderator",
          isModerator: true,
          text: "Nulla nec est eu est condimentum facilisis sit amet et ex.",
          timestamp: Date.now(),
        },
      ],
    },
  ];
}
