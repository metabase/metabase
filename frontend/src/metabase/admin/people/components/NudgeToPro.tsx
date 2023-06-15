import { connect } from "react-redux";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { State } from "metabase-types/store";

interface NudgeProps {
  upgradeUrl: string;
}

const NudgeToPro = (props: NudgeProps) => {
  return (
    <div>
      TODO: Nudge to <ExternalLink href={props.upgradeUrl}>Pro</ExternalLink>
    </div>
  );
};

const mapStateToProps = (state: State) => ({
  upgradeUrl: getUpgradeUrl(state, { utm_media: "admin_people" }),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(connect(mapStateToProps))(NudgeToPro);
