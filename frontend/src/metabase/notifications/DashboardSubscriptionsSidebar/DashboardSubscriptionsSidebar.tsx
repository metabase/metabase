import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ScheduleChangeProp } from "metabase/common/components/SchedulePicker";
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
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Channel,
  ChannelApiResponse,
  ChannelSpec,
  ChannelSpecs,
  ChannelType,
  Dashboard,
  DashboardSubscription,
  ScheduleSettings,
  SubscriptionSupportingCard,
  User,
} from "metabase-types/api";
import type { DraftDashboardSubscription, State } from "metabase-types/store";

import { getSupportedCardsForSubscriptions } from "./get-supported-cards-for-subscriptions";

export const CHANNEL_ICONS: Record<string, string> = {
  email: "mail",
  slack: "slack",
};

const EDITING_MODES = {
  ADD_EMAIL: "add-edit-email",
  ADD_SLACK: "add-edit-slack",
  NEW_PULSE: "new-pulse",
  LIST_PULSES_OR_NEW_PULSE: "list-pulses-or-new-pulse",
} as const;

type EditingMode = (typeof EDITING_MODES)[keyof typeof EDITING_MODES];

const CHANNEL_TYPES = {
  EMAIL: "email",
  SLACK: "slack",
} as const;

const cardsToPulseCards = (
  cards: SubscriptionSupportingCard[],
  pulseCards: DashboardSubscription["cards"],
) => {
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

const getEditingPulseWithDefaults = (
  state: State,
  props: { dashboard: Dashboard },
): DraftDashboardSubscription => {
  const pulse = getEditingPulse(state);
  const dashboardWrapper = state.dashboard;
  const dashboardId = dashboardWrapper.dashboardId;

  if (dashboardId == null) {
    return pulse;
  }

  const currentDashboard = dashboardWrapper.dashboards[dashboardId];

  return {
    ...pulse,
    name: pulse.name ?? currentDashboard.name,
    dashboard_id: pulse.dashboard_id ?? currentDashboard.id,
    cards: cardsToPulseCards(
      getSupportedCardsForSubscriptions(props.dashboard),
      pulse.cards,
    ),
  };
};

const mapStateToProps = (state: State, props: { dashboard: Dashboard }) => ({
  isAdmin: getUserIsAdmin(state),
  pulse: getEditingPulseWithDefaults(state, props),
  formInput: getPulseFormInput(state),
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

function shouldDisplayNewPulse(
  editingMode: EditingMode,
  pulses?: DashboardSubscription[],
): boolean {
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

interface DashboardSubscriptionsSidebarInnerProps {
  dashboard: Dashboard;
  fetchPulseFormInput: () => void;
  formInput: ChannelApiResponse;
  initialCollectionId?: number;
  isAdmin?: boolean;
  pulse: DraftDashboardSubscription;
  saveEditingPulse: () => Promise<DashboardSubscription>;
  testPulse: () => void;
  updateEditingPulse: (pulse: DraftDashboardSubscription) => void;
  cancelEditingPulse: () => void;
  pulses?: DashboardSubscription[];
  onCancel: () => void;
  setPulseArchived: (
    pulse: DraftDashboardSubscription,
    archived: boolean,
  ) => Promise<void>;
  params?: Record<string, string>;
  loading?: boolean;
}

function DashboardSubscriptionsSidebarInner({
  dashboard,
  fetchPulseFormInput: fetchFormInput,
  formInput,
  isAdmin,
  pulse,
  saveEditingPulse: saveEditing,
  testPulse: testPulseFn,
  updateEditingPulse: updateEditing,
  cancelEditingPulse: cancelEditing,
  pulses,
  onCancel,
  setPulseArchived,
  loading: isSubscriptionListLoading,
}: DashboardSubscriptionsSidebarInnerProps) {
  const [editingMode, setEditingMode] = useState<EditingMode>(
    EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
  );
  const [returnMode, setReturnMode] = useState<EditingMode[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState<User[] | undefined>(undefined);

  const prevPulsesRef = useRef(pulses);
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  const setPulse = useCallback(
    (p: DraftDashboardSubscription) => {
      updateEditing(p);
    },
    [updateEditing],
  );

  const setPulseWithChannel = useCallback(
    (type: ChannelType) => {
      const channelSpec = formInput.channels[type];
      if (!channelSpec) {
        return;
      }

      const channel = createChannel(channelSpec);

      const newPulse: DraftDashboardSubscription = {
        ...NEW_PULSE_TEMPLATE,
        channels: [channel],
        cards: getSupportedCardsForSubscriptions(dashboard),
      };
      setPulse(newPulse);
    },
    [dashboard, formInput, setPulse],
  );

  // componentDidMount
  useEffect(() => {
    fetchFormInput();

    async function fetchUsers() {
      if (isEmbeddingSdk()) {
        // We don't need the the list of users in modular embedding/SDK context because we will hard code the recipient to the logged in user.
        setUsers([]);
      } else {
        setUsers((await UserApi.list()).data);
      }
    }
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // componentDidUpdate - SDK forwarding
  useEffect(() => {
    /**
     * (EMB-976): In modular embedding/modular embedding SDK context we need to avoid showing the NEW_PULSE view
     * (the view that lets users select * between Email and Slack options) because we only allow email subscriptions there.
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
      setEditingMode(EDITING_MODES.ADD_EMAIL);
      setPulseWithChannel(CHANNEL_TYPES.EMAIL);
    }
  }, [editingMode, pulses, isSubscriptionListLoading, setPulseWithChannel]);

  // componentDidUpdate - non-admin forwarding
  useEffect(() => {
    if (isAdmin) {
      return;
    }

    const prevPulses = prevPulsesRef.current;
    prevPulsesRef.current = pulses;

    // prevent forwarding to add-pulse editingMode after creating a new pulse
    // when none existed previously
    if (pulses && pulses.length > 0 && prevPulses?.length === 0) {
      setEditingMode(EDITING_MODES.LIST_PULSES_OR_NEW_PULSE);
      setReturnMode([]);
      return;
    }

    const isEditingModeForwardable = shouldDisplayNewPulse(editingMode, pulses);

    if (isEditingModeForwardable) {
      const emailConfigured = formInput?.channels?.email?.configured || false;
      const slackConfigured = formInput?.channels?.slack?.configured || false;

      const shouldForwardToAddEmail = emailConfigured && !slackConfigured;
      const shouldForwardToAddSlack = slackConfigured && !emailConfigured;

      if (shouldForwardToAddEmail) {
        setEditingMode(EDITING_MODES.ADD_EMAIL);
        setPulseWithChannel(CHANNEL_TYPES.EMAIL);
        return;
      }

      if (shouldForwardToAddSlack) {
        setEditingMode(EDITING_MODES.ADD_SLACK);
        setPulseWithChannel(CHANNEL_TYPES.SLACK);
        return;
      }
    }
  }, [isAdmin, editingMode, formInput, pulses, setPulseWithChannel]);

  const onChannelPropertyChange = useCallback(
    (index: number, name: string, value: unknown) => {
      const p = pulseRef.current;
      const channels = [...p.channels];
      channels[index] = { ...channels[index], [name]: value };
      setPulse({ ...p, channels });
    },
    [setPulse],
  );

  // changedProp contains the schedule property that user just changed
  // newSchedule may contain also other changed properties as some property changes reset other properties
  const onChannelScheduleChange = useCallback(
    (
      index: number,
      newSchedule: ScheduleSettings,
      _changedProp: ScheduleChangeProp,
    ) => {
      const p = pulseRef.current;
      const channels = [...p.channels];
      channels[index] = { ...channels[index], ...newSchedule };
      setPulse({ ...p, channels });
    },
    [setPulse],
  );

  const toggleSkipIfEmpty = useCallback(() => {
    const p = pulseRef.current;
    setPulse({ ...p, skip_if_empty: !p.skip_if_empty });
  }, [setPulse]);

  const setPulseParameters = useCallback(
    (parameters: UiParameter[]) => {
      const p = pulseRef.current;
      setPulse({ ...p, parameters });
    },
    [setPulse],
  );

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }

    const cleanedPulse = cleanPulse(pulse, formInput.channels as ChannelSpecs);
    cleanedPulse.name = dashboard.name;

    try {
      setIsSaving(true);
      await updateEditing(cleanedPulse);
      await saveEditing();
      setEditingMode(EDITING_MODES.LIST_PULSES_OR_NEW_PULSE);
      setReturnMode([]);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, pulse, formInput, dashboard.name, updateEditing, saveEditing]);

  const createSubscription = useCallback(() => {
    setReturnMode((prev) => [...prev, editingMode]);
    setEditingMode(EDITING_MODES.NEW_PULSE);
  }, [editingMode]);

  const editPulse = useCallback(
    (p: DashboardSubscription, channelType: ChannelType) => {
      setPulse(p);
      const editingModeMap: Partial<Record<ChannelType, EditingMode>> = {
        [CHANNEL_TYPES.EMAIL]: EDITING_MODES.ADD_EMAIL,
        [CHANNEL_TYPES.SLACK]: EDITING_MODES.ADD_SLACK,
      };
      setReturnMode((prev) => [
        ...prev,
        editingMode || EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
      ]);
      setEditingMode(
        editingModeMap[channelType] ?? EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
      );
    },
    [editingMode, setPulse],
  );

  const handleArchive = useCallback(async () => {
    await setPulseArchived(pulse, true);

    if (isEmbeddingSdk() && pulses?.length === 1) {
      onCancel();
    } else {
      setEditingMode(EDITING_MODES.LIST_PULSES_OR_NEW_PULSE);
      setReturnMode([]);
    }
  }, [pulse, pulses, setPulseArchived, onCancel]);

  // Because you can navigate down the sidebar, we need to wrap
  // onCancel from props and either call that or reset back a screen
  const handleCancel = useCallback(() => {
    if (returnMode.length) {
      // set the current mode back to what it should be
      setEditingMode(returnMode[returnMode.length - 1]);
      setReturnMode(returnMode.slice(0, -1));
    } else {
      onCancel();
    }
    cancelEditing();
  }, [returnMode, onCancel, cancelEditing]);

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
        createSubscription={createSubscription}
        onCancel={handleCancel}
        editPulse={editPulse}
      />
    );
  }

  if (
    editingMode === EDITING_MODES.ADD_EMAIL &&
    pulse.channels &&
    pulse.channels.length > 0
  ) {
    const channelDetails = pulse.channels
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.enabled && c.channel_type === CHANNEL_TYPES.EMAIL);
    // protection from a failure where the channels aren't loaded yet
    if (channelDetails.length === 0) {
      return <Sidebar>{null}</Sidebar>;
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
        handleSave={handleSave}
        onCancel={handleCancel}
        onChannelPropertyChange={onChannelPropertyChange}
        onChannelScheduleChange={onChannelScheduleChange}
        testPulse={testPulseFn}
        toggleSkipIfEmpty={toggleSkipIfEmpty}
        setPulse={setPulse}
        users={users}
        handleArchive={handleArchive}
        dashboard={dashboard}
        setPulseParameters={setPulseParameters}
      />
    );
  }

  if (
    editingMode === EDITING_MODES.ADD_SLACK &&
    pulse.channels &&
    pulse.channels.length > 0
  ) {
    const channelDetails = pulse.channels
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.enabled && c.channel_type === CHANNEL_TYPES.SLACK);

    // protection from a failure where the channels aren't loaded yet
    if (channelDetails.length === 0) {
      return <Sidebar>{null}</Sidebar>;
    }

    const [channel, index] = channelDetails[0];
    const channelSpec = formInput.channels.slack;
    return (
      <AddEditSlackSidebar
        pulse={pulse}
        formInput={formInput}
        channel={channel}
        channelSpec={channelSpec}
        handleSave={handleSave}
        onCancel={handleCancel}
        onChannelPropertyChange={_.partial(onChannelPropertyChange, index)}
        onChannelScheduleChange={_.partial(onChannelScheduleChange, index)}
        testPulse={testPulseFn}
        toggleSkipIfEmpty={toggleSkipIfEmpty}
        handleArchive={handleArchive}
        dashboard={dashboard}
        setPulseParameters={setPulseParameters}
      />
    );
  }

  if (shouldDisplayNewPulse(editingMode, pulses) && !isEmbeddingSdk()) {
    const emailConfigured = formInput?.channels?.email?.configured || false;
    const slackConfigured = formInput?.channels?.slack?.configured || false;

    return (
      <NewPulseSidebar
        onCancel={handleCancel}
        emailConfigured={emailConfigured}
        slackConfigured={slackConfigured}
        onNewEmailPulse={() => {
          if (emailConfigured) {
            setReturnMode((prev) => [...prev, editingMode]);
            setEditingMode(EDITING_MODES.ADD_EMAIL);
            setPulseWithChannel(CHANNEL_TYPES.EMAIL);
          }
        }}
        onNewSlackPulse={() => {
          if (slackConfigured) {
            setReturnMode((prev) => [...prev, editingMode]);
            setEditingMode(EDITING_MODES.ADD_SLACK);
            setPulseWithChannel(CHANNEL_TYPES.SLACK);
          }
        }}
      />
    );
  }

  return <Sidebar>{null}</Sidebar>;
}

interface AddEditEmailSidebarWithHooksProps {
  index: number;
  pulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  channel: Channel;
  channelSpec: ChannelSpec | undefined;
  handleSave: () => void;
  onCancel: () => void;
  onChannelPropertyChange: (
    index: number,
    name: string,
    value: unknown,
  ) => void;
  onChannelScheduleChange: (
    index: number,
    schedule: ScheduleSettings,
    changedProp: ScheduleChangeProp,
  ) => void;
  testPulse: () => void;
  toggleSkipIfEmpty: () => void;
  setPulse: (pulse: DraftDashboardSubscription) => void;
  users: User[];
  handleArchive: () => void;
  dashboard: Dashboard;
  setPulseParameters: (parameters: UiParameter[]) => void;
}

function AddEditEmailSidebarWithHooks({
  index,
  pulse,
  formInput,
  channel,
  channelSpec,
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  testPulse: testPulseFn,
  toggleSkipIfEmpty,
  setPulse,
  users,
  handleArchive,
  dashboard,
  setPulseParameters,
}: AddEditEmailSidebarWithHooksProps) {
  /**
   * Memoized because it's used in `AddEditEmailSidebar.tsx` as a dependency
   */
  const handleChannelPropertyChange = useMemo(
    () => _.partial(onChannelPropertyChange, index),
    [index, onChannelPropertyChange],
  );

  const handleChannelScheduleChange = useMemo(
    () => _.partial(onChannelScheduleChange, index),
    [index, onChannelScheduleChange],
  );

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
      testPulse={testPulseFn}
      toggleSkipIfEmpty={toggleSkipIfEmpty}
      setPulse={setPulse}
      users={users}
      handleArchive={handleArchive}
      dashboard={dashboard}
      setPulseParameters={setPulseParameters}
    />
  );
}

const DashboardSubscriptionsSidebarConnected = _.compose(
  Pulses.loadList({
    query: (_state: State, { dashboard }: { dashboard: Dashboard }) => ({
      dashboard_id: dashboard.id,
    }),
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
