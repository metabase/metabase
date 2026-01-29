/* eslint "react/prop-types": "error" */

import PropTypes from "prop-types";
import { Component, useMemo } from "react";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Pulses } from "metabase/entities/pulses";
import {
  NEW_PULSE_TEMPLATE,
  cleanPulse,
  createChannel,
} from "metabase/lib/pulse";
import { connect } from "metabase/lib/redux";
import {
  AddEditEmailSidebar,
  AddEditSlackSidebar,
} from "metabase/notifications/AddEditSidebar/AddEditSidebar";
import { NewPulseSidebar } from "metabase/notifications/NewPulseSidebar";
import { PulsesListSidebar } from "metabase/notifications/PulsesListSidebar";
import {
  cancelEditingPulse,
  fetchPulseFormInput,
  saveEditingPulse,
  testPulse,
  updateEditingPulse,
} from "metabase/notifications/pulse/actions";
import {
  getEditingPulse,
  getPulseFormInput,
} from "metabase/notifications/pulse/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { UserApi } from "metabase/services";

import { getSupportedCardsForSubscriptions } from "./get-supported-cards-for-subscriptions";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const EDITING_MODES = {
  ADD_EMAIL: "add-edit-email",
  ADD_SLACK: "add-edit-slack",
  NEW_PULSE: "new-pulse",
  LIST_PULSES_OR_NEW_PULSE: "list-pulses-or-new-pulse",
};

const CHANNEL_TYPES = {
  EMAIL: "email",
  SLACK: "slack",
};

const cardsToPulseCards = (cards, pulseCards) => {
  return cards.map((card) => {
    const pulseCard =
      pulseCards.find(
        (pc) =>
          pc.id === card.id && pc.dashboard_card_id === card.dashboard_card_id,
      ) || card;
    return {
      ...card,
      format_rows: pulseCard.format_rows,
      pivot_results: pulseCard.pivot_results,
      include_csv: pulseCard.include_csv,
      include_xls: pulseCard.include_xls,
      download_perms: pulseCard.download_perms,
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
  cancelEditingPulse,
  fetchPulseFormInput,
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
};

class DashboardSubscriptionsSidebarInner extends Component {
  state = {
    editingMode: EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
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
    cancelEditingPulse: PropTypes.func.isRequired,
    pulses: PropTypes.array,
    onCancel: PropTypes.func.isRequired,
    setPulseArchived: PropTypes.func.isRequired,
    params: PropTypes.object,
    // From Pulses.loadList HOC
    loading: PropTypes.bool,
  };

  componentDidMount() {
    this.props.fetchPulseFormInput();
    this.fetchUsers();
  }

  componentDidUpdate(prevProps) {
    const { editingMode } = this.state;
    const { isAdmin, pulses, loading: isSubscriptionListLoading } = this.props;

    /**
     * (EMB-976): In modular embedding/modular embedding SDK context we need to avoid showing the NEW_PULSE view (the view that lets users select
     * between Email and Slack options) because we only allow email subscriptions there.
     *
     * And it's guaranteed that email would already be set up in modular embedding/SDK context.
     * Otherwise, we won't show the subscription button to open this sidebar
     * in the first place.
     */
    if (
      isEmbeddingSdk() &&
      shouldDisplayNewPulse(editingMode, pulses) &&
      /**
       * Ensure we don't prematurely switch to ADD_EMAIL while the pulse list is loading.
       * When loading completes, shouldDisplayNewPulse() will correctly return false if the list is empty.
       */
      !isSubscriptionListLoading
    ) {
      this.setState({
        editingMode: EDITING_MODES.ADD_EMAIL,
      });
      this.setPulseWithChannel(CHANNEL_TYPES.EMAIL);
    }

    if (!isAdmin) {
      this.forwardNonAdmins({ prevProps });
    }
  }

  fetchUsers = async () => {
    if (isEmbeddingSdk()) {
      // We don't need the the list of users in modular embedding/SDK context because we will hard code the recipient to the logged in user.
      this.setState({ users: [] });
    } else {
      this.setState({ users: (await UserApi.list()).data });
    }
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
          editingMode: EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
          returnMode: [],
        };
      });

      return;
    }

    const isEditingModeForwardable = shouldDisplayNewPulse(
      editingMode,
      newPulses,
    );

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

  setPulse = (pulse) => {
    this.props.updateEditingPulse(pulse);
  };

  setPulseWithChannel = (type) => {
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

  setPulseParameters = (parameters) => {
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
      this.setState({
        editingMode: EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
        returnMode: [],
      });
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
      const editingModeMap = {
        [CHANNEL_TYPES.EMAIL]: EDITING_MODES.ADD_EMAIL,
        [CHANNEL_TYPES.SLACK]: EDITING_MODES.ADD_SLACK,
      };
      return {
        editingMode: editingModeMap[channelType],
        returnMode: returnMode.concat([
          editingMode || EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
        ]),
      };
    });
  };

  handleArchive = async () => {
    const { pulse, pulses, setPulseArchived, onCancel } = this.props;

    await setPulseArchived(pulse, true);

    if (isEmbeddingSdk() && pulses.length === 1) {
      onCancel();
    } else {
      this.setState({
        editingMode: EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
        returnMode: [],
      });
    }
  };

  // Because you can navigate down the sidebar, we need to wrap
  // onCancel from props and either call that or reset back a screen
  onCancel = () => {
    const { cancelEditingPulse, onCancel } = this.props;
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
    cancelEditingPulse();
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

    if (
      editingMode === EDITING_MODES.LIST_PULSES_OR_NEW_PULSE &&
      pulses.length > 0
    ) {
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
        <AddEditEmailSidebarWithHooks
          index={index}
          pulse={pulse}
          formInput={formInput}
          channel={channel}
          channelSpec={channelSpec}
          handleSave={this.handleSave}
          onCancel={this.onCancel}
          onChannelPropertyChange={this.onChannelPropertyChange}
          onChannelScheduleChange={this.onChannelScheduleChange}
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

    if (shouldDisplayNewPulse(editingMode, pulses) && !isEmbeddingSdk()) {
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

function AddEditEmailSidebarWithHooks({
  /* eslint-disable react/prop-types */
  index,
  pulse,
  formInput,
  channel,
  channelSpec,
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  testPulse,
  toggleSkipIfEmpty,
  setPulse,
  users,
  handleArchive,
  dashboard,
  setPulseParameters,
  /* eslint-enable react/prop-types */
}) {
  /**
   * Memoized because it's used in `AddEditEmailSidebar.tsx` as a dependency
   */
  const handleChannelPropertyChange = useMemo(
    () => _.partial(onChannelPropertyChange, index),
    [index, onChannelPropertyChange],
  );

  const handleChannelScheduleChange = _.partial(onChannelScheduleChange, index);

  return (
    <AddEditEmailSidebar
      pulse={pulse}
      formInput={formInput}
      channel={channel}
      channelSpec={channelSpec}
      handleSave={handleSave}
      onCancel={onCancel}
      onChannelPropertyChange={handleChannelPropertyChange}
      onChannelScheduleChange={handleChannelScheduleChange}
      testPulse={testPulse}
      toggleSkipIfEmpty={toggleSkipIfEmpty}
      setPulse={setPulse}
      users={users}
      handleArchive={handleArchive}
      dashboard={dashboard}
      setPulseParameters={setPulseParameters}
    />
  );
}

function shouldDisplayNewPulse(editingMode, pulses) {
  if (editingMode === EDITING_MODES.NEW_PULSE) {
    return true;
  }

  if (
    editingMode === EDITING_MODES.LIST_PULSES_OR_NEW_PULSE &&
    pulses?.length === 0
  ) {
    return true;
  }

  return false;
}

const DashboardSubscriptionsSidebarConnected = _.compose(
  Pulses.loadList({
    query: (state, { dashboard }) => ({ dashboard_id: dashboard.id }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardSubscriptionsSidebarInner);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DashboardSubscriptionsSidebar() {
  const { dashboard, setSharing } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <DashboardSubscriptionsSidebarConnected
      dashboard={dashboard}
      onCancel={() => setSharing(false)}
    />
  );
}
