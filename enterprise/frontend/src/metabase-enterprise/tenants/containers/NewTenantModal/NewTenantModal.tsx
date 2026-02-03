import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import { useCreateTenantMutation } from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

import { TenantForm } from "../../components/TenantForm";

interface NewUserModalProps {
  onClose: () => void;
  location?: Location;
}

export const NewTenantModal = ({ onClose, location }: NewUserModalProps) => {
  const dispatch = useDispatch();

  const [createTenant] = useCreateTenantMutation();

  const isOnboarding = useMemo(() => {
    const searchParams = new URLSearchParams(location?.search);

    return searchParams.get("onboarding") === "true";
  }, [location?.search]);

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
      title={isOnboarding ? t`Set up your first tenant` : t`New tenant`}
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
