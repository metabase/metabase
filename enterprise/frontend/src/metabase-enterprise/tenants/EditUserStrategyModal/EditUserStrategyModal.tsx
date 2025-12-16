import { useEffect, useState } from "react";
import { t } from "ttag";

import { permissionApi } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Group, Modal, Radio, Stack, Text } from "metabase/ui";

import S from "./EditUserStrategyModal.module.css";

interface EditUserStrategyModalProps {
  onClose: () => void;
}

export const EditUserStrategyModal = ({
  onClose,
}: EditUserStrategyModalProps) => {
  const dispatch = useDispatch();

  const { isLoading, error, value, updateSetting } =
    useAdminSetting("use-tenants");

  const [addToast] = useToast();
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();

  // When the confirmation modal is confirmed, we don't have to show the parent modal while the request is ongoing
  const [isApplyingAfterConfirm, setIsApplyingAfterConfirm] = useState(false);

  const initialStrategy = value ? "multi-tenant" : "single-tenant";

  // Needed to disable the apply button when the strategy does not change
  const [selectedStrategy, setSelectedStrategy] = useState(initialStrategy);

  useEffect(() => {
    setSelectedStrategy(initialStrategy);
  }, [initialStrategy]);

  const isDisablingTenants =
    initialStrategy === "multi-tenant" && selectedStrategy === "single-tenant";

  const handleApply = async () => {
    if (isDisablingTenants) {
      const confirmed = await new Promise<boolean>((resolve) =>
        showConfirmation({
          title: t`Disable tenants?`,
          message: t`Disabling the tenants feature will automatically disable all tenant users. Email addresses must be unique across internal and tenant users, so if you are planning to set up existing tenant users as regular users again, you should first change their email addresses.`,
          confirmButtonText: t`Proceed and disable`,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        }),
      );

      if (!confirmed) {
        return;
      } else {
        setIsApplyingAfterConfirm(true);
      }
    }

    const response = await updateSetting({
      key: "use-tenants",
      value: selectedStrategy === "multi-tenant",
    });

    // Revert selection to initial value if update fails
    if (response.error) {
      setSelectedStrategy(initialStrategy);
      setIsApplyingAfterConfirm(false);
      return;
    }

    addToast({
      message:
        selectedStrategy === "multi-tenant"
          ? // eslint-disable-next-line no-literal-metabase-strings -- used in admin
            t`You can create tenant collections from the main Metabase navigation`
          : t`Changes saved`,
    });

    dispatch(
      permissionApi.util.invalidateTags([
        "permissions-group",
        "embedding-hub-checklist",
      ]),
    );

    setIsApplyingAfterConfirm(false);
    onClose();
  };

  const handleCancel = () => {
    setSelectedStrategy(initialStrategy);
    onClose();
  };

  const strategyOptions = [
    {
      value: "single-tenant",
      title: t`Single tenant`,
      // eslint-disable-next-line no-literal-metabase-strings -- in admin settings
      description: t`All users exist in the same world and are managed via Metabase groups. Ideal for internal company analytics, proof of concept, or simple embedding setups.`,
    },
    {
      value: "multi-tenant",
      title: t`Multi tenant`,
      description: t`Each tenant operates in an isolated environment with dedicated resources and permissions. Best for SaaS platforms, scalable embedding, or strict data isolation needs.`,
    },
  ];

  return (
    <>
      <Modal
        opened={!confirmationModal && !isApplyingAfterConfirm}
        title={t`User strategy`}
        padding="xl"
        size="md"
        onClose={onClose}
      >
        <LoadingAndErrorWrapper loading={isLoading} error={error}>
          <Stack gap="md" mt="sm">
            <Radio.Group
              value={selectedStrategy}
              onChange={setSelectedStrategy}
            >
              <Stack gap="md">
                {strategyOptions.map((option) => (
                  <Radio.Card
                    key={option.value}
                    value={option.value}
                    radius="md"
                    p="md"
                    className={S.radioCard}
                  >
                    <Group wrap="nowrap">
                      <Radio.Indicator />

                      <div>
                        <Text fw={700} fz="lg" lh="xl" mb="xs">
                          {option.title}
                        </Text>

                        <Text c="text-secondary" fz="sm" lh="lg">
                          {option.description}
                        </Text>
                      </div>
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>

            <Flex justify="flex-end" gap="md" mt="md">
              <Button variant="outline" onClick={handleCancel}>
                {t`Cancel`}
              </Button>

              <Button
                onClick={handleApply}
                disabled={initialStrategy === selectedStrategy}
                variant="filled"
              >{t`Apply`}</Button>
            </Flex>
          </Stack>
        </LoadingAndErrorWrapper>
      </Modal>
      {confirmationModal}
    </>
  );
};
