import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import {
  cronToScheduleSettings,
  scheduleSettingsToCron,
} from "metabase/admin/performance/utils";
import {
  useCreateNotificationMutation,
  useListNotificationsQuery,
  useSendUnsavedNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api/notification";
import { useGetChannelInfoQuery } from "metabase/api/subscription";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  NEW_PULSE_TEMPLATE,
  cleanPulse,
  createChannel,
} from "metabase/lib/pulse";
import { useSelector } from "metabase/lib/redux";
import {
  AddEditEmailSidebar,
  AddEditSlackSidebar,
} from "metabase/notifications/AddEditSidebar/AddEditSidebar";
import { NewPulseSidebar } from "metabase/notifications/NewPulseSidebar";
import { PulsesListSidebar } from "metabase/notifications/PulsesListSidebar";
import { getUserIsAdmin } from "metabase/selectors/user";
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
import type {
  CreateDashboardNotificationRequest,
  DashboardSubscriptionDashcard,
  Notification,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerSlack,
  NotificationRecipient,
  NotificationRecipientRawValue,
  NotificationRecipientUser,
  UpdateDashboardNotificationRequest,
} from "metabase-types/api/notification";
import type { DraftDashboardSubscription } from "metabase-types/store";

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

// ─── Adapter functions: notification ↔ pulse ────────────────────────────────

function handlerRecipientsToChannelRecipients(
  recipients: NotificationRecipient[],
): User[] {
  return recipients
    .filter(
      (r): r is NotificationRecipientUser =>
        r.type === "notification-recipient/user",
    )
    .map((r) => r.user as User)
    .filter(Boolean);
}

function handlerToChannel(
  handler: NotificationHandler,
  subscription?: { cron_schedule: string },
): Channel {
  const scheduleSettings: Partial<ScheduleSettings> = subscription
    ? (cronToScheduleSettings(subscription.cron_schedule) ?? {})
    : {};

  if (handler.channel_type === "channel/email") {
    return {
      channel_type: "email",
      enabled: handler.active !== false,
      recipients: handlerRecipientsToChannelRecipients(handler.recipients),
      ...scheduleSettings,
    } as Channel;
  }

  if (handler.channel_type === "channel/slack") {
    const slackChannel =
      handler.recipients?.[0]?.type === "notification-recipient/raw-value"
        ? (handler.recipients[0] as NotificationRecipientRawValue).details.value
        : undefined;
    return {
      channel_type: "slack",
      enabled: handler.active !== false,
      recipients: [],
      details: slackChannel ? { channel: slackChannel } : undefined,
      ...scheduleSettings,
    } as Channel;
  }

  return {
    channel_type: handler.channel_type.replace("channel/", "") as ChannelType,
    channel_id: handler.channel_id ?? undefined,
    enabled: handler.active !== false,
    recipients: [],
    ...scheduleSettings,
  } as Channel;
}

function mergeCardsWithDashcards(
  supportedCards: SubscriptionSupportingCard[],
  dashcards?: DashboardSubscriptionDashcard[] | null,
): SubscriptionSupportingCard[] {
  if (!dashcards || dashcards.length === 0) {
    return supportedCards;
  }

  return supportedCards.map((card) => {
    const dashcard = dashcards.find(
      (dc) =>
        dc.card_id === card.id &&
        (dc.dashboard_card_id == null ||
          dc.dashboard_card_id === card.dashboard_card_id),
    );
    if (dashcard) {
      return {
        ...card,
        include_csv: dashcard.include_csv ?? false,
        include_xls: dashcard.include_xls ?? false,
        format_rows: dashcard.format_rows ?? true,
        pivot_results: dashcard.pivot_results ?? false,
      };
    }
    return card;
  });
}

function notificationToPulse(
  notification: Notification,
  dashboard: Dashboard,
): DashboardSubscription {
  if (notification.payload_type !== "notification/dashboard") {
    throw new Error(`Unexpected payload_type: ${notification.payload_type}`);
  }

  const subscription = notification.subscriptions[0];
  const channels = notification.handlers.map((handler) =>
    handlerToChannel(handler, subscription),
  );

  const supportedCards = getSupportedCardsForSubscriptions(dashboard);
  const cards = mergeCardsWithDashcards(
    supportedCards,
    notification.payload.dashboard_subscription_dashcards,
  );

  return {
    id: notification.id,
    name: dashboard.name,
    dashboard_id: notification.payload.dashboard_id,
    cards,
    channels,
    skip_if_empty: notification.payload.skip_if_empty ?? false,
    parameters: (notification.payload.parameters ??
      []) as DashboardSubscription["parameters"],
    archived: !notification.active,
    can_write: true,
    collection_id: null,
    collection_position: null,
    created_at: notification.created_at ?? "",
    creator: notification.creator as User,
    creator_id: notification.creator_id,
    disable_links: false,
    entity_id: "" as DashboardSubscription["entity_id"],
    updated_at: notification.updated_at ?? "",
  };
}

function recipientToNotificationRecipient(
  user: User,
): NotificationRecipientUser {
  return {
    type: "notification-recipient/user",
    user_id: user.id,
    details: null,
  };
}

function channelToHandler(channel: Channel): NotificationHandler {
  if (channel.channel_type === "email") {
    return {
      channel_type: "channel/email",
      active: channel.enabled !== false,
      recipients: (channel.recipients ?? []).map(
        recipientToNotificationRecipient,
      ),
      template_id: null,
      channel_id: null,
    } as NotificationHandlerEmail;
  }

  if (channel.channel_type === "slack") {
    const slackChannel = channel.details?.channel;
    return {
      channel_type: "channel/slack",
      active: channel.enabled !== false,
      recipients: slackChannel
        ? [
            {
              type: "notification-recipient/raw-value" as const,
              details: { value: String(slackChannel) },
            },
          ]
        : [],
      template_id: null,
      channel_id: null,
    } as NotificationHandlerSlack;
  }

  return {
    channel_type:
      `channel/${channel.channel_type}` as NotificationHandler["channel_type"],
    active: channel.enabled !== false,
    recipients: [],
    channel_id: channel.channel_id ?? null,
    template_id: null,
  } as NotificationHandler;
}

function pulseCardsToDashcards(
  cards: SubscriptionSupportingCard[],
): DashboardSubscriptionDashcard[] {
  return cards.map((card) => ({
    card_id: card.id,
    dashboard_card_id: card.dashboard_card_id,
    include_csv: card.include_csv ?? false,
    include_xls: card.include_xls ?? false,
    format_rows: card.format_rows ?? true,
    pivot_results: card.pivot_results ?? false,
  }));
}

function pulseToCreateNotification(
  pulse: DraftDashboardSubscription,
): CreateDashboardNotificationRequest {
  const channel = pulse.channels[0];
  const cronSchedule = scheduleSettingsToCron(
    _.pick(
      channel,
      "schedule_day",
      "schedule_frame",
      "schedule_hour",
      "schedule_type",
    ),
  );

  return {
    payload_type: "notification/dashboard",
    payload: {
      dashboard_id: pulse.dashboard_id!,
      parameters: (pulse.parameters ?? []) as Record<string, unknown>[],
      skip_if_empty: pulse.skip_if_empty ?? false,
      dashboard_subscription_dashcards: pulseCardsToDashcards(pulse.cards),
    },
    handlers: pulse.channels.filter((ch) => ch.enabled).map(channelToHandler),
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: cronSchedule,
        ui_display_type: null,
      },
    ],
  };
}

function pulseToUpdateNotification(
  pulse: DraftDashboardSubscription,
  originalNotification: Notification,
): UpdateDashboardNotificationRequest {
  const channel = pulse.channels[0];
  const cronSchedule = scheduleSettingsToCron(
    _.pick(
      channel,
      "schedule_day",
      "schedule_frame",
      "schedule_hour",
      "schedule_type",
    ),
  );

  const existingSubscription = originalNotification.subscriptions[0];

  return {
    id: originalNotification.id,
    active: !pulse.archived,
    payload_type: "notification/dashboard",
    payload: {
      ...originalNotification.payload,
      dashboard_id: pulse.dashboard_id!,
      parameters: (pulse.parameters ?? []) as Record<string, unknown>[],
      skip_if_empty: pulse.skip_if_empty ?? false,
      dashboard_subscription_dashcards: pulseCardsToDashcards(pulse.cards),
    },
    handlers: pulse.channels
      .filter((ch) => ch.enabled)
      .map((ch, i) => {
        const handler = channelToHandler(ch);
        const existingHandler = originalNotification.handlers[i];
        if (existingHandler?.id) {
          return { ...handler, id: existingHandler.id };
        }
        return handler;
      }),
    subscriptions: [
      {
        ...(existingSubscription ?? {}),
        type: "notification-subscription/cron" as const,
        event_name: null,
        cron_schedule: cronSchedule,
        ui_display_type: existingSubscription?.ui_display_type ?? null,
      },
    ],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

interface DashboardSubscriptionsSidebarInnerProps {
  dashboard: Dashboard;
  onCancel: () => void;
}

function DashboardSubscriptionsSidebarInner({
  dashboard,
  onCancel,
}: DashboardSubscriptionsSidebarInnerProps) {
  const isAdmin = useSelector(getUserIsAdmin);

  // ── RTK Query: notifications + channel info ──
  const { data: notifications, isLoading: isNotificationsLoading } =
    useListNotificationsQuery({
      dashboard_id: dashboard.id,
      payload_type: "notification/dashboard",
    });

  const { data: formInput } = useGetChannelInfoQuery();

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();
  const [sendUnsavedNotification] = useSendUnsavedNotificationMutation();

  // ── Derived pulse list ──
  const pulses = useMemo<DashboardSubscription[] | undefined>(() => {
    if (!notifications) {
      return undefined;
    }
    return notifications.map((n) => notificationToPulse(n, dashboard));
  }, [notifications, dashboard]);

  // ── Map notification id → Notification for reverse lookup ──
  const notificationById = useMemo(() => {
    if (!notifications) {
      return new Map<number, Notification>();
    }
    return new Map(notifications.map((n) => [n.id, n]));
  }, [notifications]);

  // ── Local editing state ──
  const [editingPulse, setEditingPulse] =
    useState<DraftDashboardSubscription | null>(null);
  const [editingMode, setEditingMode] = useState<EditingMode>(
    EDITING_MODES.LIST_PULSES_OR_NEW_PULSE,
  );
  const [returnMode, setReturnMode] = useState<EditingMode[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState<User[] | undefined>(undefined);

  const prevPulsesRef = useRef(pulses);

  // Build pulse with dashboard defaults
  const pulse = useMemo<DraftDashboardSubscription>(() => {
    const p =
      editingPulse ??
      ({
        ...NEW_PULSE_TEMPLATE,
        dashboard_id: dashboard.id,
        name: dashboard.name,
      } as DraftDashboardSubscription);

    const supportedCards = getSupportedCardsForSubscriptions(dashboard);
    return {
      ...p,
      name: p.name || dashboard.name,
      dashboard_id: p.dashboard_id || dashboard.id,
      cards: cardsToPulseCards(supportedCards, p.cards ?? []),
    };
  }, [editingPulse, dashboard]);

  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  const setPulse = useCallback((p: DraftDashboardSubscription) => {
    setEditingPulse(
      (prev) =>
        ({
          ...(prev ?? {}),
          ...p,
        }) as DraftDashboardSubscription,
    );
  }, []);

  const setPulseWithChannel = useCallback(
    (type: ChannelType) => {
      const channelSpec = formInput?.channels[type];
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

  // Fetch users on mount
  useEffect(() => {
    async function fetchUsers() {
      if (isEmbeddingSdk()) {
        setUsers([]);
      } else {
        setUsers((await UserApi.list()).data);
      }
    }
    fetchUsers();
  }, []);

  // SDK forwarding
  useEffect(() => {
    if (
      isEmbeddingSdk() &&
      shouldDisplayNewPulse(editingMode, pulses) &&
      !isNotificationsLoading
    ) {
      setEditingMode(EDITING_MODES.ADD_EMAIL);
      setPulseWithChannel(CHANNEL_TYPES.EMAIL);
    }
  }, [editingMode, pulses, isNotificationsLoading, setPulseWithChannel]);

  // Non-admin forwarding
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

  const onChannelScheduleChange = useCallback(
    (index: number, cronString: string, schedule: ScheduleSettings) => {
      const p = pulseRef.current;
      const channels = [...p.channels];
      const scheduleSettings = cronToScheduleSettings(cronString) ?? schedule;
      channels[index] = { ...channels[index], ...scheduleSettings };
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
    if (isSaving || !formInput) {
      return;
    }

    const cleanedPulse = cleanPulse(pulse, formInput.channels as ChannelSpecs);
    cleanedPulse.name = dashboard.name;

    try {
      setIsSaving(true);

      if (cleanedPulse.id != null) {
        const originalNotification = notificationById.get(cleanedPulse.id);
        if (originalNotification) {
          await updateNotification(
            pulseToUpdateNotification(cleanedPulse, originalNotification),
          ).unwrap();
        }
      } else {
        await createNotification(
          pulseToCreateNotification(cleanedPulse),
        ).unwrap();
      }

      setEditingPulse(null);
      setEditingMode(EDITING_MODES.LIST_PULSES_OR_NEW_PULSE);
      setReturnMode([]);
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    pulse,
    formInput,
    dashboard.name,
    notificationById,
    createNotification,
    updateNotification,
  ]);

  const testPulseFn = useCallback(
    async (cleanedPulse: DraftDashboardSubscription) => {
      const notificationReq = pulseToCreateNotification(cleanedPulse);
      await sendUnsavedNotification(notificationReq);
    },
    [sendUnsavedNotification],
  );

  const createSubscription = useCallback(() => {
    setReturnMode((prev) => [...prev, editingMode]);
    setEditingMode(EDITING_MODES.NEW_PULSE);
    setEditingPulse(null);
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
    if (pulse.id == null) {
      return;
    }

    const originalNotification = notificationById.get(pulse.id);
    if (originalNotification) {
      await updateNotification({
        ...pulseToUpdateNotification(pulse, originalNotification),
        active: false,
      }).unwrap();
    }

    if (isEmbeddingSdk() && pulses?.length === 1) {
      onCancel();
    } else {
      setEditingPulse(null);
      setEditingMode(EDITING_MODES.LIST_PULSES_OR_NEW_PULSE);
      setReturnMode([]);
    }
  }, [pulse, pulses, notificationById, updateNotification, onCancel]);

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
    setEditingPulse(null);
  }, [returnMode, onCancel]);

  const isLoading = !pulses || !users || !formInput?.channels;

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
    if (!channelSpec) {
      return <Sidebar>{null}</Sidebar>;
    }
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

// ─── AddEditEmailSidebar wrapper (memoizes partial-applied callbacks) ────────

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
    cronString: string,
    schedule: ScheduleSettings,
  ) => void;
  testPulse: (pulse: DraftDashboardSubscription) => Promise<unknown>;
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

  if (!channelSpec) {
    return <Sidebar>{null}</Sidebar>;
  }

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DashboardSubscriptionsSidebar() {
  const { dashboard, setSharing } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <DashboardSubscriptionsSidebarInner
      dashboard={dashboard}
      onCancel={() => setSharing(false)}
    />
  );
}
