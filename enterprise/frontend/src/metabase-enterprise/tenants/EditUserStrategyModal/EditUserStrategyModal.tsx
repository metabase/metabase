import { useEffect, useState } from "react";
import { t } from "ttag";

import { permissionApi } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useAdminSetting } from "metabase/settings";
import { Button, Flex, Modal, Radio, Stack } from "metabase/ui";

interface EditUserStrategyModalProps {
  onClose: () => void;
}

export const EditUserStrategyModal = ({
  onClose,
}: EditUserStrategyModalProps) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { isLoading, error, value, updateSetting, refetch } =
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

    addToast({ message: t`Changes saved` });

    dispatch(
      permissionApi.util.invalidateTags([
        "permissions-group",
        "embedding-hub-checklist",
      ]),
    );

    setIsApplyingAfterConfirm(false);
    onClose();

    if (selectedStrategy === "multi-tenant") {
      // Wait for settings to be refetched before navigating.
      // This ensures `createTenantsRouteGuard` sees the updated setting.
      await refetch();

      navigate("/admin/people/tenants");
    }
  };

  const handleCancel = () => {
    setSelectedStrategy(initialStrategy);
    onClose();
  };

  const strategyOptions = [
    {
      value: "multi-tenant",
      label: t`Multi tenant`,
      description: t`Each tenant operates in an isolated environment with dedicated resources and permissions. Best for SaaS platforms, scalable embedding, or strict data isolation needs.`,
    },
    {
      value: "single-tenant",
      label: t`Single tenant`,
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- in admin settings
      description: t`All users exist in the same world and are managed via Metabase groups. Ideal for internal company analytics, proof of concept, or simple embedding setups.`,
    },
  ];

  return (
    <>
      <Modal
        opened={!confirmationModal && !isApplyingAfterConfirm}
        title={t`Pick a user strategy`}
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
                    label={option.label}
                    description={option.description}
                    withIndicator={false}
                  />
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
