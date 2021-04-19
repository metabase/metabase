/* eslint "react/prop-types": "error" */

import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import NewPulseSidebar from "metabase/sharing/components/NewPulseSidebar";
import PulsesListSidebar from "metabase/sharing/components/PulsesListSidebar";
import {
  AddEditSlackSidebar,
  AddEditEmailSidebar,
} from "metabase/sharing/components/AddEditSidebar";
import Sidebar from "metabase/dashboard/components/Sidebar";
import Collections from "metabase/entities/collections";
import Pulses from "metabase/entities/pulses";
import User from "metabase/entities/users";
import { normalizeParameterValue } from "metabase/meta/Parameter";

import { connect } from "react-redux";

import {
  cleanPulse,
  createChannel,
  getPulseParameters,
} from "metabase/lib/pulse";

import {
  getPulseId,
  getEditingPulse,
  getPulseFormInput,
} from "metabase/pulse/selectors";

import { getUser } from "metabase/selectors/user";

import {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  testPulse,
} from "metabase/pulse/actions";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const cardsFromDashboard = dashboard => {
  if (dashboard === undefined) {
    return [];
  }

  return dashboard.ordered_cards.map(card => ({
    id: card.card.id,
    collection_id: card.card.collection_id,
    description: card.card.description,
    display: card.card.display,
    name: card.card.name,
    include_csv: false,
    include_xls: false,
    dashboard_card_id: card.id,
    dashboard_id: dashboard.id,
    parameter_mappings: [], // card.parameter_mappings, //TODO: this ended up as "[]" ?
  }));
};

const nonTextCardsFromDashboard = dashboard => {
  return cardsFromDashboard(dashboard).filter(card => card.display !== "text");
};

const cardsToPulseCards = (cards, pulseCards) => {
  return cards.map(card => {
    const pulseCard = pulseCards.find(pc => pc.id === card.id) || card;
    return {
      ...card,
      include_csv: pulseCard.include_csv,
      include_xls: pulseCard.include_xls,
    };
  });
};

const getEditingPulseWithDefaults = (state, props) => {
  const pulse = getEditingPulse(state, props);
  const dashboardWrapper = state.dashboard;
  if (!pulse.name) {
    pulse.name = dashboardWrapper.dashboards[dashboardWrapper.dashboardId].name;
  }
  if (!pulse.dashboard_id) {
    pulse.dashboard_id =
      dashboardWrapper.dashboards[dashboardWrapper.dashboardId].id;
  }
  pulse.cards = cardsToPulseCards(
    nonTextCardsFromDashboard(props.dashboard),
    pulse.cards,
  );

  return pulse;
};

const mapStateToProps = (state, props) => ({
  pulseId: getPulseId(state, props),
  pulse: getEditingPulseWithDefaults(state, props),
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
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
};

@Pulses.loadList({
  query: (state, { dashboard }) => ({ dashboard_id: dashboard.id }),
})
@User.loadList({ loadingAndErrorWrapper: false })
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
class SharingSidebar extends React.Component {
  state = {
    editingMode: "list-pulses",
    // use this to know where to go "back" to
    returnMode: [],
  };

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    formInput: PropTypes.object.isRequired,
    initialCollectionId: PropTypes.number,
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    saveEditingPulse: PropTypes.func.isRequired,
    setEditingPulse: PropTypes.func.isRequired,
    testPulse: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
    pulses: PropTypes.array.isRequired,
    onCancel: PropTypes.func.isRequired,
    setPulseArchived: PropTypes.func.isRequired,
    users: PropTypes.array,
    params: PropTypes.object,
  };

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  addChannel = type => {
    const { dashboard, pulse, formInput } = this.props;

    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    const newPulse = {
      ...pulse,
      channels: pulse.channels.concat(channel),
      cards: nonTextCardsFromDashboard(dashboard),
    };
    this.setPulse(newPulse);
  };

  componentDidMount = async () => {
    await this.props.fetchPulseFormInput();

    this.props.setEditingPulse(
      this.props.pulseId,
      this.props.initialCollectionId,
    );
  };

  onChannelPropertyChange = (index, name, value) => {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], [name]: value };

    this.setPulse({ ...pulse, channels });
  };

  // changedProp contains the schedule property that user just changed
  // newSchedule may contain also other changed properties as some property changes reset other properties
  onChannelScheduleChange = (index, newSchedule, changedProp) => {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], ...newSchedule };
    this.setPulse({ ...pulse, channels });
  };

  toggleSkipIfEmpty = () => {
    const { pulse } = this.props;
    this.setPulse({ ...pulse, skip_if_empty: !pulse.skip_if_empty });
  };

  setPulseParameters = parameters => {
    const { pulse } = this.props;

    this.setPulse({
      ...pulse,
      parameters,
    });
  };

  handleSave = async () => {
    const { pulse, dashboard, formInput } = this.props;

    const cleanedPulse = cleanPulse(pulse, formInput.channels);
    cleanedPulse.name = dashboard.name;
    cleanedPulse.parameters = getPulseParameters(cleanedPulse).map(
      parameter => {
        const {
          default: defaultValue,
          name,
          slug,
          type,
          value,
          id,
        } = parameter;
        const normalizedValue = normalizeParameterValue(type, value);
        return {
          default: defaultValue,
          id,
          name,
          slug,
          type,
          value: normalizedValue,
        };
      },
    );

    await this.props.updateEditingPulse(cleanedPulse);

    // The order below matters; it hides the "Done" button faster and prevents two pulses from being made if it's double-clicked
    this.setState({ editingMode: "list-pulses", returnMode: [] });
    await this.props.saveEditingPulse();
  };

  createSubscription = () => {
    this.setState(({ editingMode, returnMode }) => {
      return {
        editingMode: "new-pulse",
        returnMode: returnMode.concat([editingMode]),
      };
    });

    this.props.setEditingPulse(null, null);
  };

  editPulse = (pulse, channelType) => {
    this.setPulse(pulse);
    this.setState(({ editingMode, returnMode }) => {
      return {
        editingMode: "add-edit-" + channelType,
        returnMode: returnMode.concat([editingMode || "list-pulses"]),
      };
    });
  };

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);
    this.setState({ editingMode: "list-pulses", returnMode: [] });
  };

  // Because you can navigate down the sidebar, we need to wrap
  // onCancel from props and either call that or reset back a screen
  onCancel = () => {
    const { onCancel } = this.props;
    const { returnMode } = this.state;
    if (returnMode.length) {
      // set the current mode back to what it should be
      this.setState({
        editingMode: returnMode[returnMode.length - 1],
        returnMode: returnMode.slice(0, -1),
      });
    } else {
      onCancel();
    }
  };

  render() {
    const { editingMode } = this.state;
    const {
      pulse,
      pulses,
      formInput,
      testPulse,
      users,
      dashboard,
    } = this.props;

    // protect from empty values that will mess this up
    if (!formInput.channels || !pulse) {
      return <Sidebar />;
    }

    if (editingMode === "list-pulses" && pulses.length > 0) {
      return (
        <PulsesListSidebar
          pulses={pulses}
          createSubscription={this.createSubscription}
          onCancel={this.onCancel}
          editPulse={this.editPulse}
        />
      );
    }

    if (
      editingMode === "add-edit-email" &&
      (pulse.channels && pulse.channels.length > 0)
    ) {
      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === "email");
      // protection from a failure where the channels aren't loaded yet
      if (channelDetails.length === 0) {
        return <Sidebar />;
      }

      const [channel, index] = channelDetails[0];
      const channelSpec = formInput.channels.email;

      return (
        <AddEditEmailSidebar
          pulse={pulse}
          formInput={formInput}
          channel={channel}
          channelSpec={channelSpec}
          handleSave={this.handleSave}
          onCancel={this.onCancel}
          onChannelPropertyChange={_.partial(
            this.onChannelPropertyChange,
            index,
          )}
          onChannelScheduleChange={_.partial(
            this.onChannelScheduleChange,
            index,
          )}
          testPulse={testPulse}
          toggleSkipIfEmpty={this.toggleSkipIfEmpty}
          setPulse={this.setPulse}
          users={users}
          handleArchive={this.handleArchive}
          dashboard={dashboard}
          setPulseParameters={this.setPulseParameters}
        />
      );
    }

    if (
      editingMode === "add-edit-slack" &&
      (pulse.channels && pulse.channels.length > 0)
    ) {
      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === "slack");

      // protection from a failure where the channels aren't loaded yet
      if (channelDetails.length === 0) {
        return <Sidebar />;
      }

      const [channel, index] = channelDetails[0];
      const channelSpec = formInput.channels.slack;
      return (
        <AddEditSlackSidebar
          pulse={pulse}
          formInput={formInput}
          channel={channel}
          channelSpec={channelSpec}
          handleSave={this.handleSave}
          onCancel={this.onCancel}
          onChannelPropertyChange={_.partial(
            this.onChannelPropertyChange,
            index,
          )}
          onChannelScheduleChange={_.partial(
            this.onChannelScheduleChange,
            index,
          )}
          toggleSkipIfEmpty={this.toggleSkipIfEmpty}
          handleArchive={this.handleArchive}
          dashboard={dashboard}
          setPulseParameters={this.setPulseParameters}
        />
      );
    }

    if (editingMode === "new-pulse" || pulses.length === 0) {
      const { configured: emailConfigured = false } =
        formInput.channels.email || {};
      const { configured: slackConfigured = false } =
        formInput.channels.slack || {};

      return (
        <NewPulseSidebar
          onCancel={this.onCancel}
          emailConfigured={emailConfigured}
          slackConfigured={slackConfigured}
          onNewEmailPulse={() => {
            if (emailConfigured) {
              this.setState(({ returnMode }) => {
                return {
                  editingMode: "add-edit-email",
                  returnMode: returnMode.concat([editingMode]),
                };
              });
              this.addChannel("email");
            }
          }}
          onNewSlackPulse={() => {
            if (slackConfigured) {
              this.setState(({ returnMode }) => {
                return {
                  editingMode: "add-edit-slack",
                  returnMode: returnMode.concat([editingMode]),
                };
              });
              this.addChannel("slack");
            }
          }}
        />
      );
    }

    return <Sidebar />;
  }
}

export default SharingSidebar;
