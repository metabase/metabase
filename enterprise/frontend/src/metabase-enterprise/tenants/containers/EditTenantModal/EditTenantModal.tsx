import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";
import {
  useGetTenantQuery,
  useUpdateTenantMutation,
} from "metabase-enterprise/api";
import type { CreateTenantInput } from "metabase-types/api";

import { TenantForm } from "../../components/TenantForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
}

export const EditTenantModal = ({ params, onClose }: EditUserModalProps) => {
  const dispatch = useDispatch();

  const tenantId = params.tenantId ? parseInt(params.tenantId, 10) : undefined;
  const {
    data: tenant = {},
    isLoading,
    error,
  } = useGetTenantQuery(tenantId ?? skipToken);
  const [updateTenant] = useUpdateTenantMutation();

  const initialValues = useMemo(
    () => _.pick(tenant, ["id", "name", "slug"]),
    [tenant],
  );

  const handleSubmit = async (vals: CreateTenantInput) => {
    await updateTenant(vals).unwrap();
    dispatch(addUndo({ message: t`Tenant update successful` }));
    onClose();
  };

  return (
    <Modal opened title={t`Edit tenant`} padding="xl" onClose={onClose}>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <TenantForm
          initialValues={initialValues}
          onCancel={onClose}
          onSubmit={handleSubmit}
        />
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
