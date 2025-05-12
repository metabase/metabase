import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { Modal, Select, Stack, Text } from "metabase/ui";

interface EditUserStrategyModalProps {
  onClose: () => void;
}

export const EditUserStrategyModal = ({
  onClose,
}: EditUserStrategyModalProps) => {
  const { isLoading, error, value, updateSetting } =
    useAdminSetting("use-tenants");

  const strategy = value ? "multi-tenant" : "single-tenant";

  const data = [
    { label: t`Single tenant`, value: "single-tenant" },
    { label: t`Multi tenant`, value: "multi-tenant" },
  ];

  const handleStrategyChange = (value: string) =>
    updateSetting({
      key: "use-tenants",
      value: value === "multi-tenant",
    });

  return (
    <Modal
      opened
      title={t`People settings`}
      padding="xl"
      size="lg"
      onClose={onClose}
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <Stack gap="md" mt="lg" mb="xl">
          <Select
            label={t`User strategy`}
            placeholder={t`Pick value`}
            data={data}
            defaultValue="single-tenant"
            value={strategy}
            onChange={handleStrategyChange}
          />

          <Text c="text-secondary">
            {/* eslint-disable-next-line no-literal-metabase-strings -- This link only shows for admins. */}
            {t`All users exist in the same world and are managed via Metabase groups. Best for internal company analytics or one off embedding setups or proofs of concept.`}
          </Text>
        </Stack>
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
