import { t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  useGetTenantQuery,
  useUpdateTenantMutation,
} from "metabase-enterprise/api";

interface UserActivationModalInnerProps {
  params: { tenantId: string };
  onClose: () => void;
}

export const TenantActivationModal = ({
  params,
  onClose,
}: UserActivationModalInnerProps) => {
  const tenantId = parseInt(params.tenantId, 10);
  const { data: tenant } = useGetTenantQuery(tenantId);

  const dispatch = useDispatch();

  const [updateTenant] = useUpdateTenantMutation();

  if (!tenant) {
    return null;
  }

  if (tenant.is_active) {
    return (
      <ConfirmModal
        opened
        title={t`Deactivate ${tenant.name}?`}
        message="TODO: SOME KIND OF COPY HERE"
        confirmButtonText={t`Deactivate`}
        onClose={onClose}
        onConfirm={async () => {
          await updateTenant({ id: tenantId, is_active: false });
          dispatch(addUndo({ message: t`Tenant deactivated` }));
          onClose();
        }}
      />
    );
  }

  return (
    <ConfirmModal
      opened
      title={t`Reactivate ${tenant.name}?`}
      message="TODO: SOME KIND OF COPY HERE"
      confirmButtonText={t`Reactivate`}
      onClose={onClose}
      onConfirm={async () => {
        await updateTenant({ id: tenantId, is_active: true });
        dispatch(addUndo({ message: t`Tenant reactivated` }));
        onClose();
      }}
    />
  );
};
