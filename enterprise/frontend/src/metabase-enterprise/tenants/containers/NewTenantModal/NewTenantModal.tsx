import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import { useCreateTenantMutation } from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

import { TenantForm } from "../../components/TenantForm";

interface NewUserModalProps {
  onClose: () => void;
  isFirstTenant?: boolean;
}

export const NewTenantModal = ({
  onClose,
  isFirstTenant = false,
}: NewUserModalProps) => {
  const dispatch = useDispatch();

  const [createTenant] = useCreateTenantMutation();

  const handleSubmit = async (vals: Partial<Tenant>) => {
    await createTenant({
      ...vals,
      name: vals.name ?? "",
      slug: vals.slug ?? "",
    }).unwrap();
    dispatch(addUndo({ message: t`Tenant creation successful` }));
    onClose();
  };

  return (
    <Modal
      opened
      title={isFirstTenant ? t`Set up your first tenant` : t`New tenant`}
      padding="xl"
      onClose={onClose}
    >
      <TenantForm
        initialValues={{}}
        submitText={t`Create tenant`}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
};
