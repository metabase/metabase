import type { Location } from "history";

import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { push } from "metabase/router";
import { getUser } from "metabase/selectors/user";

import AccountLayout from "../../components/AccountLayout";

interface OwnProps {
  location: Location;
}

const mapStateToProps = (state: State, props: OwnProps) => ({
  user: getUser(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(AccountLayout);
