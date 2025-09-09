import { push } from "react-router-redux";

import { connect } from "metabase/lib/redux";

import AccountLayout from "../../components/AccountLayout";

const mapStateToProps = (state, props) => ({
  path: props.location.pathname,
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountLayout);
