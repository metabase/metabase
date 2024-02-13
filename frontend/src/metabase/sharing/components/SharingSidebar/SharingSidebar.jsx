/* eslint "react/prop-types": "error" */

import { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { connect } from "react-redux";
import { NewPulseSidebar } from "metabase/sharing/components/NewPulseSidebar";
import PulsesListSidebar from "metabase/sharing/components/PulsesListSidebar";
import {
  AddEditSlackSidebar,
  AddEditEmailSidebar,
} from "metabase/sharing/components/AddEditSidebar/AddEditSidebar";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import Pulses from "metabase/entities/pulses";

import {
  cleanPulse,
  createChannel,
  NEW_PULSE_TEMPLATE,
} from "metabase/lib/pulse";

import { getEditingPulse, getPulseFormInput } from "metabase/pulse/selectors";

import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import {
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  testPulse,
} from "metabase/pulse/actions";
import { UserApi } from "metabase/services";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const EDITING_MODES = {
  ADD_EMAIL: "add-edit-email",
  ADD_SLACK: "add-edit-slack",
  NEW_PULSE: "new-pulse",
  LIST_PULSES: "list-pulses",
};

const CHANNEL_TYPES = {
  EMAIL: "email",
  SLACK: "slack",
};

const cardsFromDashboard = dashboard => {
  if (dashboard === undefined) {
    return [];
  }

  return dashboard.dashcards.map(card => ({
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

const getSupportedCardsForSubscriptions = dashboard => {
  return cardsFromDashboard(dashboard).filter(
    card => !["text", "heading", "action", "link"].includes(card.display),
  );
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
    getSupportedCardsForSubscriptions(props.dashboard),
    pulse.cards,
  );

  return pulse;
};

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state),
  pulse: getEditingPulseWithDefaults(state, props),
  formInput: getPulseFormInput(state, props),
  user: getUser(state),
});

const mapDispatchToProps = {
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
};

class SharingSidebarInner extends Component {
  state = {
    editingMode: EDITING_MODES.LIST_PULSES,
    // use this to know where to go "back" to
    returnMode: [],
    isSaving: false,
    users: undefined,
  };

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    formInput: PropTypes.object.isRequired,
    initialCollectionId: PropTypes.number,
    isAdmin: PropTypes.bool,
    pulse: PropTypes.object.isRequired,
    saveEditingPulse: PropTypes.func.isRequired,
    testPulse: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
    pulses: PropTypes.array,
    onCancel: PropTypes.func.isRequired,
    setPulseArchived: PropTypes.func.isRequired,
    params: PropTypes.object,
  };

  componentDidMount() {
    this.props.fetchPulseFormInput();
    this.fetchUsers();
  }

  componentDidUpdate(prevProps) {
    const { isAdmin } = this.props;

    if (!isAdmin) {
      this.forwardNonAdmins({ prevProps });
    }
  }

  fetchUsers = async () => {
    this.setState({ users: (await UserApi.list()).data });
  };

  forwardNonAdmins = ({ prevProps }) => {
    const { editingMode } = this.state;
    const { formInput, pulses: newPulses } = this.props;
    const { pulses: prevPulses } = prevProps;

    // prevent forwarding to add-pulse editingMode after creating a new pulse
    // when none existed previously
    if (newPulses?.length > 0 && prevPulses?.length === 0) {
      this.setState(() => {
        return {
          editingMode: EDITING_MODES.LIST_PULSES,
          returnMode: [],
        };
      });

      return;
    }

    const isEditingModeForwardable =
      editingMode === EDITING_MODES.NEW_PULSE ||
      (editingMode === EDITING_MODES.LIST_PULSES && newPulses?.length === 0);

    if (isEditingModeForwardable) {
      const emailConfigured = formInput?.channels?.email?.configured || false;
      const slackConfigured = formInput?.channels?.slack?.configured || false;

      const shouldForwardToAddEmail = emailConfigured && !slackConfigured;
      const shouldForwardToAddSlack = slackConfigured && !emailConfigured;

      if (shouldForwardToAddEmail) {
        this.setState(() => {
          return {
            editingMode: EDITING_MODES.ADD_EMAIL,
          };
        });
        this.setPulseWithChannel(CHANNEL_TYPES.EMAIL);

        return;
      }

      if (shouldForwardToAddSlack) {
        this.setState(() => {
          return {
            editingMode: EDITING_MODES.ADD_SLACK,
          };
        });
        this.setPulseWithChannel(CHANNEL_TYPES.SLACK);

        return;
      }
    }
  };

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  setPulseWithChannel = type => {
    const { dashboard, formInput } = this.props;

    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    const newPulse = {
      ...NEW_PULSE_TEMPLATE,
      channels: [channel],
      cards: getSupportedCardsForSubscriptions(dashboard),
    };
    this.setPulse(newPulse);
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
    const { isSaving } = this.state;

    if (isSaving) {
      return;
    }

    const cleanedPulse = cleanPulse(pulse, formInput.channels);
    cleanedPulse.name = dashboard.name;

    try {
      this.setState({ isSaving: true });
      await this.props.updateEditingPulse(cleanedPulse);
      await this.props.saveEditingPulse();
      this.setState({ editingMode: EDITING_MODES.LIST_PULSES, returnMode: [] });
    } finally {
      this.setState({ isSaving: false });
    }
  };

  createSubscription = () => {
    this.setState(({ editingMode, returnMode }) => {
      return {
        editingMode: EDITING_MODES.NEW_PULSE,
        returnMode: returnMode.concat([editingMode]),
      };
    });
  };

  editPulse = (pulse, channelType) => {
    this.setPulse(pulse);
    this.setState(({ editingMode, returnMode }) => {
      return {
        editingMode: "add-edit-" + channelType,
        returnMode: returnMode.concat([
          editingMode || EDITING_MODES.LIST_PULSES,
        ]),
      };
    });
  };

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);
    this.setState({ editingMode: EDITING_MODES.LIST_PULSES, returnMode: [] });
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
    const { editingMode, users } = this.state;
    const { dashboard, formInput, pulse, pulses, testPulse } = this.props;

    const isLoading = !pulses || !users || !pulse || !formInput?.channels;

    if (isLoading) {
      return (
        <Sidebar>
          <LoadingAndErrorWrapper loading />
        </Sidebar>
      );
    }

    if (editingMode === EDITING_MODES.LIST_PULSES && pulses.length > 0) {
      return (
        <PulsesListSidebar
          pulses={pulses}
          formInput={formInput}
          createSubscription={this.createSubscription}
          onCancel={this.onCancel}
          editPulse={this.editPulse}
        />
      );
    }

    if (
      editingMode === EDITING_MODES.ADD_EMAIL &&
      pulse.channels &&
      pulse.channels.length > 0
    ) {
      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(
          ([c, i]) => c.enabled && c.channel_type === CHANNEL_TYPES.EMAIL,
        );
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
      editingMode === EDITING_MODES.ADD_SLACK &&
      pulse.channels &&
      pulse.channels.length > 0
    ) {
      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(
          ([c, i]) => c.enabled && c.channel_type === CHANNEL_TYPES.SLACK,
        );

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
          testPulse={testPulse}
          toggleSkipIfEmpty={this.toggleSkipIfEmpty}
          handleArchive={this.handleArchive}
          dashboard={dashboard}
          setPulseParameters={this.setPulseParameters}
        />
      );
    }

    if (editingMode === EDITING_MODES.NEW_PULSE || pulses.length === 0) {
      const emailConfigured = formInput?.channels?.email?.configured || false;
      const slackConfigured = formInput?.channels?.slack?.configured || false;

      return (
        <NewPulseSidebar
          onCancel={this.onCancel}
          emailConfigured={emailConfigured}
          slackConfigured={slackConfigured}
          onNewEmailPulse={() => {
            if (emailConfigured) {
              this.setState(({ returnMode }) => {
                return {
                  editingMode: EDITING_MODES.ADD_EMAIL,
                  returnMode: returnMode.concat([editingMode]),
                };
              });
              this.setPulseWithChannel(CHANNEL_TYPES.EMAIL);
            }
          }}
          onNewSlackPulse={() => {
            if (slackConfigured) {
              this.setState(({ returnMode }) => {
                return {
                  editingMode: EDITING_MODES.ADD_SLACK,
                  returnMode: returnMode.concat([editingMode]),
                };
              });
              this.setPulseWithChannel(CHANNEL_TYPES.SLACK);
            }
          }}
        />
      );
    }

    return <Sidebar />;
  }
}

const SharingSidebar = _.compose(
  Pulses.loadList({
    query: (state, { dashboard }) => ({ dashboard_id: dashboard.id }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(SharingSidebarInner);

export default SharingSidebar;
