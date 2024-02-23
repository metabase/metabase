/* eslint "react/prop-types": "warn" */
import { Component } from "react";
import { connect } from "react-redux";
import { push, goBack } from "react-router-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import Pulses from "metabase/entities/pulses";
import title from "metabase/hoc/Title";
import { getUser } from "metabase/selectors/user";
import { UserApi } from "metabase/services";

import {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  testPulse,
} from "../actions";
import PulseEdit from "../components/PulseEdit";
import {
  getPulseId,
  getEditingPulse,
  getPulseCardPreviews,
  getPulseFormInput,
} from "../selectors";

const mapStateToProps = (state, props) => ({
  pulseId: getPulseId(state, props),
  pulse: getEditingPulse(state, props),
  cardPreviews: getPulseCardPreviews(state, props),
  formInput: getPulseFormInput(state, props),
  user: getUser(state),
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
  onChangeLocation: push,
  goBack,
};

class PulseEditApp extends Component {
  state = {
    users: undefined,
  };

  componentDidMount() {
    this.fetchUsers();
  }

  fetchUsers = async () => {
    this.setState({ users: (await UserApi.list()).data });
  };

  render() {
    return <PulseEdit {...this.props} users={this.state.users} />;
  }
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ pulse }) => pulse && pulse.name),
)(PulseEditApp);
