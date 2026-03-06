import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Button, Checkbox, Flex, Modal } from "metabase/ui";
import type { Channel } from "metabase-types/api";
import type { DraftDashboardSubscription } from "metabase-types/store";

function getConfirmItems(pulse: DraftDashboardSubscription): ReactNode[] {
  return pulse.channels.map((c: Channel, index: number) =>
    c.channel_type === "email" ? (
      <span key={index}>
        {jt`This dashboard will no longer be emailed to ${(
          <strong key="msg">
            {((n) => ngettext(msgid`${n} address`, `${n} addresses`, n))(
              c.recipients?.length || 0,
            )}
          </strong>
        )} ${(<strong key="type">{c.schedule_type}</strong>)}`}
        .
      </span>
    ) : c.channel_type === "slack" ? (
      <span key={index}>
        {jt`Slack channel ${(
          <strong key="msg">{c.details && c.details.channel}</strong>
        )} will no longer get this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ) : (
      <span key={index}>
        {jt`Channel ${(
          <strong key="msg">{c.channel_type}</strong>
        )} will no longer receive this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ),
  );
}

interface DeleteSubscriptionActionProps {
  pulse: DraftDashboardSubscription;
  handleArchive: () => void;
}

export function DeleteSubscriptionAction({
  pulse,
  handleArchive,
}: DeleteSubscriptionActionProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const confirmItems = getConfirmItems(pulse);
  const confirmed = confirmItems.reduce(
    (acc, _item, index) => acc && checked[index],
    true,
  );

  const handleDelete = async () => {
    await handleArchive();
    closeModal();
  };

  if (!pulse.id || pulse.archived) {
    return null;
  }

  return (
    <>
      <Flex className={cx(CS.borderTop, CS.pt1, CS.pb3)} justify="flex-end">
        <Button variant="subtle" c="text-tertiary" onClick={openModal}>
          {t`Delete this subscription`}
        </Button>
      </Flex>
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={t`Delete this subscription to ${pulse.name}?`}
        size="lg"
        data-testid="delete-confirmation-modal-pulse"
      >
        <Flex direction="column" gap="md" mt="md">
          <ul>
            {confirmItems.map((item, index) => (
              <li
                key={index}
                className={cx(
                  CS.pb2,
                  CS.mb2,
                  CS.borderRowDivider,
                  CS.flex,
                  CS.alignCenter,
                )}
              >
                <Checkbox
                  label={item}
                  checked={checked[index]}
                  onChange={(e) =>
                    setChecked({
                      ...checked,
                      [index]: e.currentTarget.checked,
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <Flex justify="flex-end" gap="sm">
            <Button onClick={closeModal}>{t`Cancel`}</Button>
            <Button
              color={confirmed ? "danger" : undefined}
              variant="filled"
              onClick={handleDelete}
              disabled={!confirmed}
            >
              {t`Delete`}
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}
